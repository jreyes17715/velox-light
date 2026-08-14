import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../types';

const router = Router();

const ITBIS = 1.18;

// Regla de meta de produccion confirmada por Padrino 06-ago-2026: antes solo
// se exigia un total de RD$300,000 en todo el periodo de 3 meses (umbral muy
// bajo, ~100k/mes de promedio). La regla real es doble y ambas condiciones
// aplican a la vez: (1) cada uno de los 3 meses del programa debe alcanzar
// individualmente el minimo mensual, Y (2) el acumulado de los 3 meses debe
// alcanzar la meta total. Si un mes no llega al minimo, no aprueba aunque el
// acumulado si llegue a la meta total.
const DIQ_MONTHLY_MIN = 300_000;   // minimo neto que debe hacer CADA mes del programa
const DIQ_TOTAL_GOAL  = 1_000_000; // acumulado neto que debe alcanzar en los 3 meses

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function calcDIQKPIs(diqUserId: string, startDate: Date, endDate: Date) {
  const user = await prisma.user.findUnique({
    where: { id: diqUserId },
    select: { id: true, sapUserId: true, name: true },
  });
  if (!user) throw new Error('DIQ user not found');

  // KPI 1: Reclutas totales con inciadoraId = DIQ
  const reclutas = await prisma.user.findMany({
    where: { inciadoraId: diqUserId },
    select: { id: true, sapUserId: true, name: true, createdAt: true },
  });

  // KPI 1a: Consultoras activas (compraron en el último mes completo)
  const ahora = new Date();
  const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const reclutasActivas = await Promise.all(
    reclutas.map(async r => {
      const venta = await prisma.sale.findFirst({
        where: { userId: r.sapUserId, saleDate: { gte: inicioMesActual }, status: { not: 'cancelled' } },
      });
      return { ...r, activa: !!venta };
    })
  );
  const activasCount = reclutasActivas.filter(r => r.activa).length;

  // KPI 1b: Nuevas iniciaciones desde startDate
  const nuevasIniciaciones = reclutas.filter(r => r.createdAt >= startDate).length;

  // KPI 2: Producción acumulada (DIQ + sus reclutas) desde startDate hasta endDate
  const sapIds = [user.sapUserId, ...reclutas.map(r => r.sapUserId)];
  const produccionResult = await prisma.sale.aggregate({
    where: {
      userId: { in: sapIds },
      saleDate: { gte: startDate, lte: endDate },
      status: { not: 'cancelled' },
    },
    _sum: { amount: true },
  });
  const produccionBruta = Number(produccionResult._sum.amount ?? 0);
  const produccionNeta  = produccionBruta / ITBIS;

  // Producción por mes (para gráfica y para validar el minimo mensual)
  const meses: { month: number; year: number; bruta: number; neta: number; cumpleMinimo: boolean }[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const m = cursor.getMonth() + 1;
    const y = cursor.getFullYear();
    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 1);
    const r = await prisma.sale.aggregate({
      where: { userId: { in: sapIds }, saleDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
      _sum: { amount: true },
    });
    const bruta = Number(r._sum.amount ?? 0);
    const neta  = bruta / ITBIS;
    meses.push({ month: m, year: y, bruta, neta, cumpleMinimo: neta >= DIQ_MONTHLY_MIN });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const mesesCumplidos     = meses.filter(m => m.cumpleMinimo).length;
  const cumpleTodosLosMeses = meses.length > 0 && meses.every(m => m.cumpleMinimo);
  const cumpleAcumulado    = produccionNeta >= DIQ_TOTAL_GOAL;

  return {
    consultoras: {
      total:   reclutas.length,
      activas: activasCount,
      meta:    24,
      pct:     Math.min((activasCount / 24) * 100, 100),
      lista:   reclutasActivas,
    },
    produccion: {
      bruta:    produccionBruta,
      neta:     produccionNeta,
      // "meta" = acumulado de los 3 meses (antes decia 300k por error -- ese
      // era en realidad el minimo MENSUAL, no el total del periodo).
      meta:        DIQ_TOTAL_GOAL,
      metaMensual: DIQ_MONTHLY_MIN,
      pct:         Math.min((produccionNeta / DIQ_TOTAL_GOAL) * 100, 100),
      porMes:      meses,
      mesesCumplidos,
      mesesTotal:  meses.length,
      cumpleTodosLosMeses,
      cumpleAcumulado,
      // Solo "aprueba" produccion si cumple los dos requisitos a la vez.
      aprobada:    cumpleTodosLosMeses && cumpleAcumulado,
    },
    iniciaciones: {
      total: nuevasIniciaciones,
      meta:  8,
      pct:   Math.min((nuevasIniciaciones / 8) * 100, 100),
    },
  };
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// GET /api/diq/candidates — consultoras disponibles para registrar como DIQ
router.get('/candidates', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    // Directora: solo sus subordinadas. SuperAdmin: todas las consultoras sin DIQ activa
    const where = user.isSuperAdmin
      ? { role: { in: ['consultora', 'iniciadora'] }, diqAsCandidate: null }
      : { role: { in: ['consultora', 'iniciadora'] }, supervisorId: user.id, diqAsCandidate: null };

    const candidates = await prisma.user.findMany({
      where,
      select: { id: true, name: true, sapUserId: true, unitName: true,
        supervisor: { select: { name: true, unitName: true } } },
      orderBy: { name: 'asc' },
    });

    res.json(candidates);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/diq/available-members — todas las consultoras asignables a un grupo DIQ
router.get('/available-members', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.isSuperAdmin) {
      res.status(403).json({ error: 'Solo superadmin' }); return;
    }
    const members = await prisma.user.findMany({
      where: { isSuperAdmin: false, localPassword: null, role: { in: ['consultora', 'iniciadora'] } },
      select: { id: true, name: true, sapUserId: true, role: true,
        supervisor: { select: { name: true, unitName: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/diq — registrar nueva DIQ (directoras y superadmin)
// Body: { userId, notes?, memberIds? }
//   memberIds (solo superadmin): IDs de consultoras que forman el grupo DIQ
router.post('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const registrador = req.user!;
    if (registrador.role !== 'directora' && !registrador.isSuperAdmin) {
      res.status(403).json({ error: 'Solo directoras o Super Admin pueden registrar DECs' });
      return;
    }

    const { userId, notes, memberIds } = req.body as {
      userId: string; notes?: string; memberIds?: string[];
    };
    if (!userId) { res.status(400).json({ error: 'userId requerido' }); return; }

    const candidata = await prisma.user.findUnique({ where: { id: userId } });
    if (!candidata) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    if (candidata.role === 'directora') { res.status(400).json({ error: 'Ya es directora' }); return; }

    const existing = await prisma.dIQ.findUnique({ where: { userId } });
    if (existing && existing.status === 'active') {
      res.status(400).json({ error: 'Ya tiene un proceso DEC activo' }); return;
    }

    const startDate = new Date(); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate); endDate.setMonth(endDate.getMonth() + 3);

    // Crear DIQ y cambiar role de la candidata a 'diq' en transacción
    const [diq] = await prisma.$transaction(async tx => {
      const diqRecord = await tx.dIQ.create({
        data: { userId, registeredById: registrador.id, startDate, endDate, notes: notes ?? null },
        include: { user: { select: { name: true, sapUserId: true } } },
      });

      // Cambiar role de la candidata
      await tx.user.update({ where: { id: userId }, data: { role: 'diq' } });

      // Asignar miembros (solo superadmin, y solo IDs válidos)
      if (memberIds && memberIds.length > 0 && registrador.isSuperAdmin) {
        await tx.user.updateMany({
          where: { id: { in: memberIds }, isSuperAdmin: false },
          data: { supervisorId: userId },
        });
      }

      return [diqRecord];
    });

    res.status(201).json(diq);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/diq/:id/members — actualizar lista de miembros de un grupo DIQ (solo superadmin)
// Body: { memberIds: string[] } — lista completa de IDs de miembros (reemplaza la anterior)
router.patch('/:id/members', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.isSuperAdmin) {
      res.status(403).json({ error: 'Solo superadmin puede modificar miembros' }); return;
    }

    const diq = await prisma.dIQ.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, userId: true, status: true },
    });
    if (!diq) { res.status(404).json({ error: 'DEC no encontrada' }); return; }

    const { memberIds } = req.body as { memberIds: string[] };

    await prisma.$transaction(async tx => {
      // Quitar supervisorId a los que ya no son miembros
      await tx.user.updateMany({
        where: { supervisorId: diq.userId, id: { notIn: memberIds } },
        data: { supervisorId: null },
      });
      // Asignar nuevos miembros
      if (memberIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: memberIds }, isSuperAdmin: false },
          data: { supervisorId: diq.userId },
        });
      }
    });

    const members = await prisma.user.findMany({
      where: { supervisorId: diq.userId },
      select: { id: true, name: true, sapUserId: true, role: true },
    });

    res.json({ updated: members.length, members });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/diq — listar DIQs (directora: las suyas; superadmin: todas)
router.get('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const where = user.isSuperAdmin ? {} : { registeredById: user.id };

    const diqs = await prisma.dIQ.findMany({
      where,
      include: {
        user:         { select: { name: true, sapUserId: true } },
        registeredBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calcular KPIs básicos para cada DIQ
    const result = await Promise.all(diqs.map(async diq => {
      const kpis = await calcDIQKPIs(diq.userId, diq.startDate, diq.endDate);
      return { ...diq, kpis };
    }));

    res.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/diq/my — progreso de la DIQ actual (si el usuario logueado tiene proceso activo)
router.get('/my', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const diq = await prisma.dIQ.findUnique({
      where:   { userId: user.id },
      include: { registeredBy: { select: { name: true, unitName: true } } },
    });

    if (!diq || diq.status !== 'active') {
      res.json(null);
      return;
    }

    const kpis = await calcDIQKPIs(user.id, diq.startDate, diq.endDate);
    res.json({ ...diq, kpis });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/diq/:id — detalle completo
router.get('/:id', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const diq  = await prisma.dIQ.findUnique({
      where:   { id: req.params.id as string },
      include: {
        user:         { select: { name: true, sapUserId: true } },
        registeredBy: { select: { name: true, unitName: true } },
      },
    });

    if (!diq) { res.status(404).json({ error: 'DEC no encontrada' }); return; }

    // Solo puede ver su propia DIQ, la directora que la registró, o superadmin
    const puedeVer = user.isSuperAdmin || diq.registeredById === user.id || diq.userId === user.id;
    if (!puedeVer) { res.status(403).json({ error: 'Sin acceso' }); return; }

    const kpis = await calcDIQKPIs(diq.userId, diq.startDate, diq.endDate);
    res.json({ ...diq, kpis });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/diq/:id/complete — marcar como completada
router.patch('/:id/complete', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isSuperAdmin && user.role !== 'directora') {
      res.status(403).json({ error: 'Sin permisos' });
      return;
    }

    const diq = await prisma.dIQ.findUnique({ where: { id: req.params.id as string } });
    if (!diq) { res.status(404).json({ error: 'DEC no encontrada' }); return; }

    const updated = await prisma.dIQ.update({
      where: { id: req.params.id as string },
      data: { status: 'completed', completedAt: new Date() },
    });

    res.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;