import { Router, Request, Response } from 'express';
import { fullSync, syncUsers, syncSales, syncCreditNotes } from '../services/syncService';
import { fetchSection1ItemCodes, SapOrder } from '../services/sapService';
import { sapGet } from '../utils/sapClient';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import axios from 'axios';
import https from 'https';

const router = Router();

// GET /api/admin/sap/test — diagnóstico de conexión SAP
router.get('/sap/test', async (_req: Request, res: Response) => {
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const baseURL = process.env.SAP_BASE_URL!;
  const companyDB = process.env.SAP_COMPANY_DB!;
  const userName = process.env.SAP_USERNAME!;
  const password = process.env.SAP_PASSWORD!;

  logger.info(`SAP TEST: URL=${baseURL}, CompanyDB=${companyDB}, UserName=${userName}`);

  // Intentar con el username tal cual
  try {
    const r = await axios.post(`${baseURL}/Login`, { CompanyDB: companyDB, UserName: userName, Password: password }, { httpsAgent, timeout: 15000 });
    return res.json({ ok: true, sessionId: r.data.SessionId, testedWith: userName });
  } catch (e1: unknown) {
    const err1 = e1 as { response?: { status?: number; data?: unknown }; message?: string };
    const status1 = err1?.response?.status;
    const data1 = err1?.response?.data;

    // Si falla, intentar con solo la parte después del backslash
    const shortUser = userName.includes('\\') ? userName.split('\\').pop()! : null;
    if (shortUser && shortUser !== userName) {
      try {
        const r2 = await axios.post(`${baseURL}/Login`, { CompanyDB: companyDB, UserName: shortUser, Password: password }, { httpsAgent, timeout: 15000 });
        return res.json({ ok: true, sessionId: r2.data.SessionId, testedWith: shortUser, note: 'Funcionó sin dominio' });
      } catch (e2: unknown) {
        const err2 = e2 as { response?: { status?: number; data?: unknown }; message?: string };
        return res.status(200).json({
          ok: false,
          attempt1: { user: userName, status: status1, sapResponse: data1 },
          attempt2: { user: shortUser, status: err2?.response?.status, sapResponse: err2?.response?.data },
        });
      }
    }

    return res.status(200).json({
      ok: false,
      attempt1: { user: userName, status: status1, sapResponse: data1, message: err1?.message },
    });
  }
});

// POST /api/admin/sync/full — sync completo manual
router.post('/sync/full', async (_req: Request, res: Response) => {
  logger.info('ADMIN: sync completo manual iniciado');
  try {
    await fullSync();
    res.json({ ok: true, message: 'Sync completo finalizado' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: msg });
  }
});

// POST /api/admin/sync/users — sync solo usuarios
router.post('/sync/users', async (_req: Request, res: Response) => {
  try {
    const result = await syncUsers();
    res.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: msg });
  }
});

// POST /api/admin/sync/sales — sync solo ventas
router.post('/sync/sales', async (_req: Request, res: Response) => {
  try {
    const result = await syncSales(true);
    res.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: msg });
  }
});

// GET /api/admin/sync/logs — últimos logs de sync
router.get('/sync/logs', async (_req: Request, res: Response) => {
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  res.json(logs);
});

// GET /api/admin/users — todos los usuarios (para asignación)
router.get('/users', async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      sapUserId: true,
      name: true,
      role: true,
      unitName: true,
      supervisorId: true,
      supervisor: { select: { id: true, name: true } },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  res.json(users);
});

// PATCH /api/admin/users/:id/supervisor — asignar directora a consultora
router.patch('/users/:id/supervisor', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { supervisorId } = req.body as { supervisorId: string | null };

  try {
    // Validar que el supervisor sea directora
    if (supervisorId) {
      const supervisor = await prisma.user.findUnique({ where: { id: supervisorId } });
      if (!supervisor || supervisor.role !== 'directora') {
        res.status(400).json({ error: 'El supervisor debe ser una directora' });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { supervisorId },
    });

    res.json({ ok: true, supervisorId: updated.supervisorId });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando supervisora' });
  }
});


// GET /api/admin/diag/order/:docEntry — diagnóstico read-only: trae la orden
// directo de SAP + el Set de códigos Sección 1 vigente, y muestra línea por
// línea cuáles cuentan como producción y por qué. NO toca la lógica real de
// comisiones/produccion, solo la expone para depurar diferencias reportadas.
router.get('/diag/order/:docEntry', async (req: Request, res: Response) => {
  const docEntry = req.params.docEntry as string;
  try {
    const [section1Codes, orderData] = await Promise.all([
      fetchSection1ItemCodes(),
      sapGet<{ value: SapOrder[] }>('/Orders', {
        $filter: `DocEntry eq ${docEntry}`,
        $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,DocumentStatus,Cancelled,DocumentLines',
      }),
    ]);

    const order = orderData.value?.[0];
    if (!order) {
      res.status(404).json({ error: `Orden DocEntry=${docEntry} no encontrada en SAP` });
      return;
    }

    const lines = order.DocumentLines ?? [];
    const lineDetail = lines.map(l => ({
      ItemCode: l.ItemCode,
      LineTotal: l.LineTotal,
      esSeccion1: section1Codes.has(l.ItemCode),
    }));
    const sumTodasLineas = lines.reduce((s, l) => s + (l.LineTotal ?? 0), 0);
    const sumSeccion1 = lineDetail.filter(l => l.esSeccion1).reduce((s, l) => s + (l.LineTotal ?? 0), 0);

    res.json({
      section1CodesCount: section1Codes.size,
      order: { DocEntry: order.DocEntry, DocNum: order.DocNum, CardCode: order.CardCode, DocTotal: order.DocTotal },
      lineas: lineDetail,
      sumTodasLineasNeta: Math.round(sumTodasLineas * 100) / 100,
      sumSeccion1Neta: Math.round(sumSeccion1 * 100) / 100,
      amountCalculado: Math.round(sumSeccion1 * 1.18 * 100) / 100,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/admin/diag/user/:sapUserId — diagnóstico read-only: compara el
// usuario tal como está en NUESTRA base (existe? role? cuándo se sincronizó)
// contra sus ventas locales, y contra las órdenes que SAP tiene registradas
// para ese CardCode en los últimos 6 meses. Sirve para depurar casos donde
// alguien reporta una compra que "no aparece" pese a correr sync completo.
router.get('/diag/user/:sapUserId', async (req: Request, res: Response) => {
  const sapUserId = req.params.sapUserId as string;
  try {
    const [user, sales, sapOrdersData, lastSyncLogs] = await Promise.all([
      prisma.user.findUnique({
        where: { sapUserId },
        select: { id: true, sapUserId: true, name: true, role: true, supervisorId: true, createdAt: true, lastSapSync: true },
      }),
      prisma.sale.findMany({
        where: { userId: sapUserId },
        orderBy: { saleDate: 'desc' },
        select: { sapOrderId: true, amount: true, saleDate: true, status: true, syncedAt: true },
      }),
      sapGet<{ value: SapOrder[] }>('/Orders', {
        $filter: `CardCode eq '${sapUserId}'`,
        $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,DocumentStatus,Cancelled',
        $orderby: 'DocDate desc',
      }),
      prisma.syncLog.findMany({ where: { syncType: { in: ['sales', 'users'] } }, orderBy: { startedAt: 'desc' }, take: 6 }),
    ]);

    const sapOrders = sapOrdersData.value ?? [];
    const sapDocEntries = new Set(sapOrders.map(o => String(o.DocEntry)));
    const localDocEntries = new Set(sales.map(s => s.sapOrderId));
    const faltantes = sapOrders.filter(o => !localDocEntries.has(String(o.DocEntry)));

    res.json({
      usuarioEnNuestraBase: user,
      ventasLocales: sales,
      ordenesEnSAP: sapOrders,
      ordenesQueFaltanSincronizar: faltantes,
      ultimosSyncLogs: lastSyncLogs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// Patrón de CardCode temporal que SAP/WordPress asigna al momento del
// registro, antes de aprobar y convertir al CardCode definitivo (ej. "C01318").
// Confirmado 11-ago-2026 con casos reales: "CA-202607222334", "CA-202608122455".
const TEMP_CARDCODE_PATTERN = /^CA-\d{10,}$/;

// GET /api/admin/cleanup/temp-registrations — dry-run: lista usuarios cuyo
// sapUserId matchea el patrón de CardCode temporal (registro sin aprobar que
// quedó huérfano porque SAP ya lo reemplazó por el CardCode definitivo). No
// borra nada -- solo muestra qué se borraría y si tiene datos dependientes
// (ventas, metas, notas de crédito, subordinadas, reclutas, DIQ) que lo
// harían inseguro de borrar.
router.get('/cleanup/temp-registrations', async (_req: Request, res: Response) => {
  try {
    const all = await prisma.user.findMany({
      select: { id: true, sapUserId: true, name: true, role: true, createdAt: true },
    });
    const candidatos = all.filter(u => TEMP_CARDCODE_PATTERN.test(u.sapUserId));

    const detalle = await Promise.all(candidatos.map(async u => {
      const [sales, targets, creditNotes, subordinates, reclutas, diqAsCandidate, diqsRegistered] = await Promise.all([
        prisma.sale.count({ where: { userId: u.sapUserId } }),
        prisma.target.count({ where: { userId: u.sapUserId } }),
        prisma.creditNote.count({ where: { userId: u.sapUserId } }),
        prisma.user.count({ where: { supervisorId: u.id } }),
        prisma.user.count({ where: { inciadoraId: u.id } }),
        prisma.dIQ.count({ where: { userId: u.id } }),
        prisma.dIQ.count({ where: { registeredById: u.id } }),
      ]);
      const dependientes = sales + targets + creditNotes + subordinates + reclutas + diqAsCandidate + diqsRegistered;
      return {
        id: u.id, sapUserId: u.sapUserId, name: u.name, role: u.role, createdAt: u.createdAt,
        dependientes: { sales, targets, creditNotes, subordinates, reclutas, diqAsCandidate, diqsRegistered },
        seguroBorrar: dependientes === 0,
      };
    }));

    res.json({
      total: detalle.length,
      seguros: detalle.filter(d => d.seguroBorrar).length,
      conDependientes: detalle.filter(d => !d.seguroBorrar).length,
      registros: detalle,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// POST /api/admin/cleanup/temp-registrations — borra los registros temporales
// que dieron "seguroBorrar: true" en el GET de arriba (sin dependientes). Los
// que tienen dependientes se saltan y se reportan, no se tocan.
router.post('/cleanup/temp-registrations', async (_req: Request, res: Response) => {
  try {
    const all = await prisma.user.findMany({
      select: { id: true, sapUserId: true, name: true },
    });
    const candidatos = all.filter(u => TEMP_CARDCODE_PATTERN.test(u.sapUserId));

    const borrados: { sapUserId: string; name: string }[] = [];
    const saltados: { sapUserId: string; name: string; razon: string }[] = [];

    for (const u of candidatos) {
      const [sales, targets, creditNotes, subordinates, reclutas, diqAsCandidate, diqsRegistered] = await Promise.all([
        prisma.sale.count({ where: { userId: u.sapUserId } }),
        prisma.target.count({ where: { userId: u.sapUserId } }),
        prisma.creditNote.count({ where: { userId: u.sapUserId } }),
        prisma.user.count({ where: { supervisorId: u.id } }),
        prisma.user.count({ where: { inciadoraId: u.id } }),
        prisma.dIQ.count({ where: { userId: u.id } }),
        prisma.dIQ.count({ where: { registeredById: u.id } }),
      ]);
      const dependientes = sales + targets + creditNotes + subordinates + reclutas + diqAsCandidate + diqsRegistered;

      if (dependientes > 0) {
        saltados.push({ sapUserId: u.sapUserId, name: u.name, razon: `tiene ${dependientes} registro(s) dependiente(s)` });
        continue;
      }

      try {
        await prisma.user.delete({ where: { id: u.id } });
        borrados.push({ sapUserId: u.sapUserId, name: u.name });
      } catch (e) {
        saltados.push({ sapUserId: u.sapUserId, name: u.name, razon: 'error al borrar (posible FK no contemplada)' });
      }
    }

    logger.info(`ADMIN cleanup: ${borrados.length} registros temporales borrados, ${saltados.length} saltados`);
    res.json({ borrados: borrados.length, saltados: saltados.length, detalle: { borrados, saltados } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// POST /api/admin/sync/credit-notes — sync notas de crédito manual
router.post('/sync/credit-notes', async (_req: Request, res: Response) => {
  try {
    const result = await syncCreditNotes(true);
    res.json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;
