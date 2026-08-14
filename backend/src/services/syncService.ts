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
    let noAprobados = 0;
    for (const bp of partners) {
      // Registro no aprobado todavia (CardCode temporal tipo "CA-<timestamp>"
      // que WordPress/SAP asigna al momento del registro, antes de convertirlo
      // al CardCode definitivo al aprobar) -- confirmado 11-ago-2026, campo
      // U_estado_consultora. Solo se salta si el campo viene poblado Y no dice
      // "Aprobado" -- si viene null/vacío se deja pasar igual que antes, para
      // no excluir por error registros viejos que nunca tuvieron este campo.
      // Caso real: Yolanda Carolina Castillo Germán con 3 registros (2
      // CardCodes temporales + el definitivo C01318) antes de este filtro.
      if (bp.U_estado_consultora && bp.U_estado_consultora !== 'Aprobado') {
        noAprobados++;
        continue;
      }

      // Tres señales independientes (OR) para detectar directoras -- esto es
      // aditivo a proposito: cada señal solo puede SUMAR mas directoras
      // detectadas, nunca le quita el rol a alguien que ya lo tenia por otra
      // via. U_nivel_cliente se agrego 28-jul-2026 porque se confirmo con IT
      // que es el campo que se actualiza de forma mas confiable al ascender a
      // alguien (a veces U_Tipo se queda sin tocar y el grupo/unidad tarda en
      // crearse -- ver caso Sarah Massiel Feliz Acosta, SF-00001). Si a alguien
      // le falta el grupo en SAP, va a aparecer como directora sin unidad
      // asignada todavia -- eso hay que resolverlo en SAP, no en el codigo.
      const isDirectora = bp.U_Tipo === 'D'
        || bp.U_nivel_cliente === 'Directora'
        || directoraCardCodes.has(bp.CardCode);
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

    logger.info(`SYNC usuarios: ${created} creados, ${updated} actualizados, ${noAprobados} saltados (no aprobados / registro temporal)`);

    // 5. Asignar supervisoras automáticamente por GroupCode
    for (const bp of partners) {
      if (!bp.GroupCode) continue;
      const groupInfo = groupMap.get(bp.GroupCode);
      if (!groupInfo) continue;
      // Una directora casi siempre tambien es "miembro" de su propio grupo SAP
      // (GroupCode apunta a su propia unidad). Sin este filtro, el bloque de
      // abajo la asignaria como supervisora de si misma (supervisorId = su
      // propio id), lo que la hace aparecer duplicada como "miembro" de su
      // propia unidad en /unit/:directoraId y en cualquier vista que combine
      // [dir.sapUserId, ...miembros] (bug detectado 21-jul-2026, ver Cristina
      // Yosaira Baez Perez apareciendo 2 veces en Ver Unidad).
      if (bp.CardCode === groupInfo.directoraCardCode) continue;

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
    //
    //     IMPORTANTE (confirmado 11-ago-2026, caso Rosa Hilda Hidalgo Urbaez H00337):
    //     SAP ya trae las fechas OFICIALES del trimestre en U_FechaIniD/U_FechaFinD
    //     (ej. 2026-06-01 a 2026-08-31). Antes se calculaba una ventana propia de 3
    //     meses desde el dia en que el sync detectaba a la candidata por primera vez,
    //     lo cual no coincidia con el trimestre real que maneja el negocio. Ahora se
    //     usa SAP como fuente de verdad cuando esas fechas vienen pobladas, tanto al
    //     crear el registro como para corregir uno ya existente si SAP las actualiza.
    let diqsAutoCreados = 0;
    let diqsFechasCorregidas = 0;
    for (const bp of partners) {
      const isIniciadoraBp = inciadoraCardCodes.has(bp.CardCode);
      const isDiqBp = isIniciadoraBp && (bp.U_DIQ === 'S');
      if (!isDiqBp) continue;

      const diqUser = await prisma.user.findUnique({
        where: { sapUserId: bp.CardCode },
        select: { id: true, supervisorId: true },
      });
      if (!diqUser) continue;

      const sapStart = bp.U_FechaIniD ? new Date(bp.U_FechaIniD) : null;
      const sapEnd   = bp.U_FechaFinD ? new Date(bp.U_FechaFinD) : null;

      const existingDiq = await prisma.dIQ.findUnique({ where: { userId: diqUser.id } });

      if (!existingDiq) {
        const fallbackStart = new Date(); fallbackStart.setHours(0, 0, 0, 0);
        const fallbackEnd = new Date(fallbackStart); fallbackEnd.setMonth(fallbackEnd.getMonth() + 3);
        const startDate = sapStart ?? fallbackStart;
        const endDate   = sapEnd   ?? fallbackEnd;

        await prisma.dIQ.create({
          data: {
            userId: diqUser.id,
            registeredById: diqUser.supervisorId ?? diqUser.id,
            startDate,
            endDate,
            notes: sapStart && sapEnd
              ? 'Auto-creado por sync SAP (U_DIQ=S, fechas oficiales U_FechaIniD/U_FechaFinD)'
              : 'Auto-creado por sync SAP (U_DIQ=S, sin fechas oficiales en SAP -- se usó fallback de 3 meses)',
          },
        });
        diqsAutoCreados++;
      } else if (existingDiq.status === 'active' && sapStart && sapEnd) {
        // Corregir fechas si SAP trae las oficiales y difieren de lo que ya tenemos.
        const cambioInicio = existingDiq.startDate.getTime() !== sapStart.getTime();
        const cambioFin    = existingDiq.endDate.getTime()   !== sapEnd.getTime();
        if (cambioInicio || cambioFin) {
          await prisma.dIQ.update({
            where: { id: existingDiq.id },
            data: { startDate: sapStart, endDate: sapEnd },
          });
          diqsFechasCorregidas++;
          logger.debug(`SYNC: DEC ${bp.CardCode} fechas corregidas desde SAP (${sapStart.toISOString().slice(0,10)} → ${sapEnd.toISOString().slice(0,10)})`);
        }
      }
    }
    if (diqsAutoCreados > 0) {
      logger.info(`SYNC: ${diqsAutoCreados} registros DIQ auto-creados desde SAP`);
    }
    if (diqsFechasCorregidas > 0) {
      logger.info(`SYNC: ${diqsFechasCorregidas} registros DIQ con fechas corregidas desde SAP (U_FechaIniD/U_FechaFinD)`);
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
