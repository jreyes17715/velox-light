import { Router, Request, Response } from 'express';
import { fullSync, syncUsers, syncSales } from '../services/syncService';
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
  const { id } = req.params;
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

export default router;
