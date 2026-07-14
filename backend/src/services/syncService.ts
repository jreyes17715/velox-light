import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import {
  fetchAllBusinessPartners,
  fetchBusinessPartnerGroups,
  fetchOrdersSince,
  fetchAllOrders,
  fetchCreditNotesSince,
  fetchAllCreditNotes,
  fetchSection1ItemCodes,
  SapOrder,
} from './sapService';
import { ONLY_SECTION_1_PRODUCTS } from '../utils/constants';

const ITBIS = 1.18;

// Calcula el monto de "produccion" de una orden.
// Confirmado con el contacto de SAP: la produccion real solo cuenta articulos de
// "Seccion 1" (tabla OITM, QryGroup1 = 'Y' -- expuesto como Properties1 en el
// Service Layer). Se suman los LineTotal (netos, sin ITBIS) de esas lineas y se
// multiplica por 1.18 para obtener el equivalente bruto, consistente con el
// resto del sistema (donde "neta" = bruta / ITBIS).
function calcOrderAmount(order: SapOrder, section1Codes: Set<string>): number {
  if (!ONLY_SECTION_1_PRODUCTS) return order.DocTotal;

  const lines = order.DocumentLines ?? [];
  if (lines.length === 0) {
    // SAP no devolvio lineas -- fallback seguro al total completo en vez de
    // perder la venta silenciosamente.
    return order.DocTotal;
  }

  const seccion1Lines = lines.filter(l => section1Codes.has(l.ItemCode));
  if (seccion1Lines.length === 0) return 0; // ningun articulo de Seccion 1 en esta orden

  const sumNeta = seccion1Lines.reduce((s, l) => s + (l.LineTotal ?? 0), 0);
  return sumNeta * ITBIS;
}

// ─── Sync de usuarios (BusinessPartners + jerarquía automática) ──────────────
export async function syncUsers(): Promise<{ created: number; updated: number; supervisorsAssigned: number; inciadorasAssigned: number }> {
  logger.info('SYNC: iniciando sync de usuarios...');
  const log = await prisma.syncLog.create({
    data: { syncType: 'users', status: 'running' },
  });

  let created = 0;
  let updated = 0;
  let supervisorsAssigned = 0;
  let inciadorasAssigned = 0;

  try {
    // 1. Traer grupos: mapa GroupCode → { directoraCardCode, groupName }
    const groups = await fetchBusinessPartnerGroups();
    const groupMap = new Map<number, { directoraCardCode: string; groupName: string }>();
    // Mapa inverso: CardCode de directora -> nombre de su unidad
    const directoraUnitMap = new Map<string, string>();
    for (const g of groups) {
      if (g.U_CardCode) {
        groupMap.set(g.Code, { directoraCardCode: g.U_CardCode, groupName: g.Name });
        directoraUnitMap.set(g.U_CardCode, g.Name);
      }
    }
    logger.info(`SYNC: ${groups.length} grupos, ${groupMap.size} con directora asignada`);

    // 2. Traer todos los BusinessPartners (clientes)
    const partners = await fetchAllBusinessPartners();

    // 3. Identificar directoras:
    //    - U_Tipo === 'D', O su CardCode aparece en algún grupo como U_CardCode
    const directoraCardCodes = new Set<string>();
    for (const [, g] of groupMap) directoraCardCodes.add(g.directoraCardCode);

    // 3b. Identificar iniciadoras: cualquier CardCode que aparezca como U_CodIni de alguien más
    //     Construir mapa: CardCode → U_DIQ para cruzarlo después
    const inciadoraCardCodes = new Set<string>();
    const diqMap = new Map<string, string | null>(); // CardCode → U_DIQ
    for (const bp of partners) {
      diqMap.set(bp.CardCode, bp.U_DIQ ?? null);
      if (bp.U_CodIni) inciadoraCardCodes.add(bp.U_CodIni);
    }

    // 4. Upsert todos los usuarios
    for (const bp of partners) {
      const isDirectora = bp.U_Tipo === 'D' || directoraCardCodes.has(bp.CardCode);
      const isIniciadora = inciadoraCardCodes.has(bp.CardCode);
      const isDiq = isIniciadora && (bp.U_DIQ === 'S');

      // Prioridad: directora > diq > iniciadora > consultora
      const role = isDirectora ? 'directora'
                 : isDiq       ? 'diq'
                 : isIniciadora ? 'iniciadora'
                 : 'consultora';

      const existing = await prisma.user.findUnique({ where: { sapUserId: bp.CardCode } });

      // Si es directora y tiene unidad en SAP, poblar unitName automaticamente
      const sapUnitName = isDirectora ? directoraUnitMap.get(bp.CardCode) : undefined;

      if (existing) {
        try {
          await prisma.user.update({
            where: { sapUserId: bp.CardCode },
            data: {
              name: bp.CardName,
              email: bp.EmailAddress || existing.email,
              role,
              // Solo sobreescribir unitName si SAP lo trae y el usuario no lo personalizó
              ...(sapUnitName && !existing.unitName ? { unitName: sapUnitName } : {}),
              lastSapSync: new Date(),
            },
          });
        } catch (e: any) {
          // Email duplicado con otro usuario -- actualizar sin tocar el email
          if (e.code === 'P2002') {
            await prisma.user.update({
              where: { sapUserId: bp.CardCode },
              data: {
                name: bp.CardName,
                role,
                ...(sapUnitName && !existing.unitName ? { unitName: sapUnitName } : {}),
                lastSapSync: new Date(),
              },
            });
          } else throw e;
        }
        updated++;
      } else {
        try {
          await prisma.user.create({
            data: {
              sapUserId: bp.CardCode,
              name: bp.CardName,
              email: bp.EmailAddress || null,
              role,
              unitName: sapUnitName ?? null,
              lastSapSync: new Date(),
            },
          });
        } catch (e: any) {
          // Email duplicado — crear sin email
          if (e.code === 'P2002') {
            await prisma.user.create({
              data: {
                sapUserId: bp.CardCode,
                name: bp.CardName,
                email: null,
                role,
                unitName: sapUnitName ?? null,
                lastSapSync: new Date(),
              },
            });
          } else throw e;
        }
        created++;
      }
    }

    logger.info(`SYNC usuarios: ${created} creados, ${updated} actualizados`);

    // 5. Asignar supervisoras automáticamente por GroupCode
    for (const bp of partners) {
      if (!bp.GroupCode) continue;
      const groupInfo = groupMap.get(bp.GroupCode);
      if (!groupInfo) continue;

      const [user, directora] = await Promise.all([
        prisma.user.findUnique({ where: { sapUserId: bp.CardCode }, select: { id: true, supervisorId: true } }),
        prisma.user.findUnique({ where: { sapUserId: groupInfo.directoraCardCode }, select: { id: true } }),
      ]);

      if (!user || !directora) continue;
      if (user.supervisorId === directora.id) continue; // ya asignada, sin cambio

      await prisma.user.update({
        where: { sapUserId: bp.CardCode },
        data: { supervisorId: directora.id },
      });
      supervisorsAssigned++;
      logger.debug(`SYNC: ${bp.CardCode} → directora ${groupInfo.directoraCardCode} (${groupInfo.groupName})`);
    }

    logger.info(`SYNC: ${supervisorsAssigned} jerarquías asignadas`);

    // 5b. Asegurar registro DIQ para usuarios marcados como DIQ en SAP (U_DIQ = 'S').
    //     El role='diq' ya se asigna arriba, pero sin una fila en la tabla DIQ no hay
    //     fecha de inicio ni metas que trackear -- se crea automaticamente si no existe.
    let diqsAutoCreados = 0;
    for (const bp of partners) {
      const isIniciadoraBp = inciadoraCardCodes.has(bp.CardCode);
      const isDiqBp = isIniciadoraBp && (bp.U_DIQ === 'S');
      if (!isDiqBp) continue;

      const diqUser = await prisma.user.findUnique({
        where: { sapUserId: bp.CardCode },
        select: { id: true, supervisorId: true },
      });
      if (!diqUser) continue;

      const existingDiq = await prisma.dIQ.findUnique({ where: { userId: diqUser.id } });
      if (existingDiq) continue; // ya tiene proceso DIQ registrado, no tocar fechas/metas

      const startDate = new Date(); startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate); endDate.setMonth(endDate.getMonth() + 3);

      await prisma.dIQ.create({
        data: {
          userId: diqUser.id,
          registeredById: diqUser.supervisorId ?? diqUser.id,
          startDate,
          endDate,
          notes: 'Auto-creado por sync SAP (U_DIQ=S)',
        },
      });
      diqsAutoCreados++;
    }
    if (diqsAutoCreados > 0) {
      logger.info(`SYNC: ${diqsAutoCreados} registros DIQ auto-creados desde SAP`);
    }

    // 6. Asignar inciadoraId: U_CodIni apunta al CardCode de quien reclutó a esta persona.
    //    Puede ser distinto a la directora de su unidad (relación de reclutamiento personal).

    // Diagnóstico: mostrar muestra de valores U_CodIni que llegan de SAP
    const conIni = partners.filter(bp => bp.U_CodIni);
    logger.info(`SYNC DEBUG: ${conIni.length} BPs tienen U_CodIni. Ejemplos: ${conIni.slice(0, 5).map(bp => `${bp.CardCode}→${bp.U_CodIni}`).join(', ')}`);

    for (const bp of partners) {
      if (!bp.U_CodIni) continue;

      const [user, iniciadora] = await Promise.all([
        prisma.user.findUnique({ where: { sapUserId: bp.CardCode }, select: { id: true, inciadoraId: true } }),
        prisma.user.findUnique({ where: { sapUserId: bp.U_CodIni }, select: { id: true } }),
      ]);

      if (!user || !iniciadora) {
        logger.debug(`SYNC: iniciadora no encontrada para ${bp.CardCode} (U_CodIni=${bp.U_CodIni})`);
        continue;
      }
      if (user.inciadoraId === iniciadora.id) continue; // sin cambio

      await prisma.user.update({
        where: { sapUserId: bp.CardCode },
        data: { inciadoraId: iniciadora.id },
      });
      inciadorasAssigned++;
      logger.debug(`SYNC: ${bp.CardCode} → iniciadora ${bp.U_CodIni}`);
    }

    logger.info(`SYNC: ${inciadorasAssigned} relaciones de iniciadora asignadas`);

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'success', recordsProcessed: partners.length, completedAt: new Date() },
    });

    return { created, updated, supervisorsAssigned, inciadorasAssigned };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', errorMessage: msg, completedAt: new Date() },
    });
    logger.error('SYNC usuarios error:', msg);
    throw error;
  }
}

// ─── Sync de ventas (Orders) ─────────────────────────────────────────────────
export async function syncSales(fullSync = false): Promise<{ upserted: number; skipped: number }> {
  logger.info(`SYNC: iniciando sync de ventas (${fullSync ? 'completo' : 'incremental'})...`);
  const log = await prisma.syncLog.create({
    data: { syncType: 'sales', status: 'running' },
  });

  let upserted = 0;
  let skipped = 0;

  try {
    // Clasificacion de articulos Seccion 1 (produccion real) -- se trae UNA vez
    // por corrida de sync, no por orden, para no golpear SAP innecesariamente.
    const section1Codes = ONLY_SECTION_1_PRODUCTS ? await fetchSection1ItemCodes() : new Set<string>();

    const orders = fullSync
      ? await fetchAllOrders()
      : await fetchOrdersSince(new Date(Date.now() - 20 * 60 * 1000));

    for (const order of orders) {
      const user = await prisma.user.findUnique({
        where: { sapUserId: order.CardCode },
        select: { sapUserId: true },
      });

      if (!user) {
        skipped++;
        continue;
      }

      let status = 'completed';
      if (order.Cancelled === 'Y') status = 'cancelled';
      else if (order.DocumentStatus === 'O') status = 'pending';

      const amount = calcOrderAmount(order, section1Codes);

      await prisma.sale.upsert({
        where: { sapOrderId: String(order.DocEntry) },
        create: {
          sapOrderId: String(order.DocEntry),
          userId: order.CardCode,
          amount,
          currency: 'DOP',
          saleDate: new Date(order.DocDate),
          status,
          sapDocNum: order.DocNum,
          sapDocEntry: String(order.DocEntry),
          syncedAt: new Date(),
        },
        update: {
          amount,
          status,
          saleDate: new Date(order.DocDate),
          syncedAt: new Date(),
        },
      });

      upserted++;
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'success', recordsProcessed: upserted, completedAt: new Date() },
    });

    logger.info(`SYNC ventas: ${upserted} procesadas, ${skipped} saltadas`);
    return { upserted, skipped };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', errorMessage: msg, completedAt: new Date() },
    });
    throw error;
  }
}

// ─── Sync de notas de credito (CreditNotes) ───────────────────────────────────
export async function syncCreditNotes(fullSync = false): Promise<{ upserted: number; skipped: number }> {
  logger.info(`SYNC: iniciando sync de notas de crédito (${fullSync ? 'completo' : 'incremental'})...`);
  const log = await prisma.syncLog.create({
    data: { syncType: 'credit_notes', status: 'running' },
  });

  let upserted = 0;
  let skipped  = 0;

  try {
    const notes = fullSync
      ? await fetchAllCreditNotes()
      : await fetchCreditNotesSince(new Date(Date.now() - 20 * 60 * 1000));

    for (const note of notes) {
      const user = await prisma.user.findUnique({
        where: { sapUserId: note.CardCode },
        select: { sapUserId: true },
      });

      if (!user) { skipped++; continue; }

      const cancelled = note.Cancelled === 'tYES';

      await prisma.creditNote.upsert({
        where: { sapDocEntry: String(note.DocEntry) },
        create: {
          sapDocEntry: String(note.DocEntry),
          sapDocNum:   note.DocNum,
          userId:      note.CardCode,
          amount:      note.DocTotal,
          currency:    'DOP',
          docDate:     new Date(note.DocDate),
          comments:    note.Comments ?? null,
          ncfRef:      note.U_NCF    ?? null,
          ncfNC:       note.U_NCF_NC ?? null,
          cancelled,
          syncedAt:    new Date(),
        },
        update: {
          amount:    note.DocTotal,
          cancelled,
          comments:  note.Comments ?? null,
          ncfRef:    note.U_NCF    ?? null,
          ncfNC:     note.U_NCF_NC ?? null,
          syncedAt:  new Date(),
        },
      });

      upserted++;
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'success', recordsProcessed: upserted, completedAt: new Date() },
    });

    logger.info(`SYNC notas de crédito: ${upserted} procesadas, ${skipped} saltadas`);
    return { upserted, skipped };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', errorMessage: msg, completedAt: new Date() },
    });
    throw error;
  }
}

// ─── Sync completo ────────────────────────────────────────────────────────────
export async function fullSync(): Promise<void> {
  logger.info('SYNC: iniciando sync completo...');
  await syncUsers();
  await syncSales(true);
  await syncCreditNotes(true);
  logger.info('SYNC: sync completo finalizado');
}
