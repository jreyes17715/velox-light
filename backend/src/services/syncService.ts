import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import {
  fetchAllBusinessPartners,
  fetchBusinessPartnerGroups,
  fetchOrdersSince,
  fetchAllOrders,
} from './sapService';

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
    for (const g of groups) {
      if (g.U_CardCode) {
        groupMap.set(g.Code, { directoraCardCode: g.U_CardCode, groupName: g.Name });
      }
    }
    logger.info(`SYNC: ${groups.length} grupos, ${groupMap.size} con directora asignada`);

    // 2. Traer todos los BusinessPartners (clientes)
    const partners = await fetchAllBusinessPartners();

    // 3. Identificar directoras:
    //    - U_Tipo === 'D', O su CardCode aparece en algún grupo como U_CardCode
    const directoraCardCodes = new Set<string>();
    for (const [, g] of groupMap) directoraCardCodes.add(g.directoraCardCode);

    // 4. Upsert todos los usuarios
    for (const bp of partners) {
      const isDirectora = bp.U_Tipo === 'D' || directoraCardCodes.has(bp.CardCode);
      const role = isDirectora ? 'directora' : 'consultora';

      const existing = await prisma.user.findUnique({ where: { sapUserId: bp.CardCode } });

      if (existing) {
        await prisma.user.update({
          where: { sapUserId: bp.CardCode },
          data: {
            name: bp.CardName,
            email: bp.EmailAddress || existing.email,
            role,
            lastSapSync: new Date(),
          },
        });
        updated++;
      } else {
        await prisma.user.create({
          data: {
            sapUserId: bp.CardCode,
            name: bp.CardName,
            email: bp.EmailAddress || null,
            role,
            lastSapSync: new Date(),
          },
        });
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

      await prisma.sale.upsert({
        where: { sapOrderId: String(order.DocEntry) },
        create: {
          sapOrderId: String(order.DocEntry),
          userId: order.CardCode,
          amount: order.DocTotal,
          currency: 'DOP',
          saleDate: new Date(order.DocDate),
          status,
          sapDocNum: order.DocNum,
          sapDocEntry: String(order.DocEntry),
          syncedAt: new Date(),
        },
        update: {
          amount: order.DocTotal,
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
    logger.error('SYNC ventas error:', msg);
    throw error;
  }
}

// ─── Sync completo ────────────────────────────────────────────────────────────
export async function fullSync(): Promise<void> {
  logger.info('SYNC: iniciando sync completo...');
  await syncUsers();
  await syncSales(true);
  logger.info('SYNC: sync completo finalizado');
}
