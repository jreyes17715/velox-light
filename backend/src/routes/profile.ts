import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../types';
import { calcDIQKPIs } from './diq';

const router = Router();

interface ProfileTarget {
  id: string;
  sapUserId: string;
  name: string;
  email: string | null;
  role: string;
  unitName: string | null;
  isSuperAdmin: boolean;
  supervisorId: string | null;
  status?: string | null;
}

async function getSubordinatesFor(targetUser: { id: string; role: string }) {
  if (targetUser.role === 'iniciadora') {
    return prisma.user.findMany({
      where: { inciadoraId: targetUser.id },
      select: { id: true, name: true, sapUserId: true, role: true, status: true },
      orderBy: { name: 'asc' },
    });
  }
  return prisma.user.findMany({
    where: { supervisorId: targetUser.id },
    select: { id: true, name: true, sapUserId: true, role: true, status: true },
    orderBy: { name: 'asc' },
  });
}

async function buildProfileData(targetUser: ProfileTarget) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const gte = new Date(year, month - 1, 1);
  const lt  = new Date(year, month, 1);

  // Ventas del mes actual
  const ventasMes = await prisma.sale.aggregate({
    where: { userId: targetUser.sapUserId, saleDate: { gte, lt }, status: { not: 'cancelled' } },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Meta del mes
  const meta = await prisma.target.findUnique({
    where: { userId_month_year: { userId: targetUser.sapUserId, month, year } },
  });

  // Historial ultimos 6 meses
  const historial = await Promise.all(
    Array.from({ length: 6 }, (_, i) => {
      const d = new Date(year, month - 1 - i, 1);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    }).map(async ({ month: m, year: y }) => {
      const start = new Date(y, m - 1, 1);
      const end   = new Date(y, m, 1);
      const result = await prisma.sale.aggregate({
        where: { userId: targetUser.sapUserId, saleDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        _sum: { amount: true },
        _count: { id: true },
      });
      const metaRow = await prisma.target.findUnique({
        where: { userId_month_year: { userId: targetUser.sapUserId, month: m, year: y } },
      });
      return {
        month: m, year: y,
        ventas: Number(result._sum.amount ?? 0),
        pedidos: result._count.id,
        meta: Number(metaRow?.targetAmount ?? 0),
      };
    })
  );

  // Reclutas (si es iniciadora/diq con reclutas personales)
  const reclutas = await prisma.user.findMany({
    where: { inciadoraId: targetUser.id },
    select: { name: true, sapUserId: true, role: true, status: true },
    orderBy: { name: 'asc' },
  });

  // Supervisora (si tiene)
  let supervisora = null;
  if (targetUser.supervisorId) {
    supervisora = await prisma.user.findUnique({
      where: { id: targetUser.supervisorId },
      select: { name: true, sapUserId: true, unitName: true },
    });
  }

  const subordinadas = await getSubordinatesFor(targetUser);

  // Notas de credito
  const creditNotes = await prisma.creditNote.findMany({
    where: { userId: targetUser.sapUserId, cancelled: false },
    orderBy: { docDate: 'desc' },
    take: 50,
    select: {
      id: true, sapDocNum: true, sapDocEntry: true,
      amount: true, docDate: true, comments: true,
      ncfRef: true, ncfNC: true, cancelled: true,
    },
  });

  const ncMesAgg = await prisma.creditNote.aggregate({
    where: { userId: targetUser.sapUserId, docDate: { gte, lt }, cancelled: false },
    _sum: { amount: true },
  });
  const totalCreditNotesMes = Number(ncMesAgg._sum.amount ?? 0);

  // Progreso DIQ (si el usuario esta calificando como directora)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let diq: any = null;
  if (targetUser.role === 'diq') {
    const diqRecord = await prisma.dIQ.findUnique({ where: { userId: targetUser.id } });
    if (diqRecord && diqRecord.status === 'active') {
      const kpis = await calcDIQKPIs(targetUser.id, diqRecord.startDate, diqRecord.endDate);
      const msRestantes = diqRecord.endDate.getTime() - now.getTime();
      const diasRestantes = Math.max(0, Math.ceil(msRestantes / (1000 * 60 * 60 * 24)));
      diq = {
        startDate: diqRecord.startDate,
        endDate: diqRecord.endDate,
        diasRestantes,
        vencido: msRestantes < 0,
        kpis,
      };
    }
  }

  return {
    user: {
      id:           targetUser.id,
      sapUserId:    targetUser.sapUserId,
      name:         targetUser.name,
      email:        targetUser.email,
      role:         targetUser.role,
      unitName:     targetUser.unitName,
      isSuperAdmin: targetUser.isSuperAdmin,
      status:       targetUser.status ?? null,
    },
    mesActual: {
      month, year,
      ventas:  Number(ventasMes._sum.amount ?? 0),
      pedidos: ventasMes._count.id,
      meta:    Number(meta?.targetAmount ?? 0),
    },
    historial: historial.reverse(),
    reclutas,
    supervisora,
    subordinadasCount: subordinadas.length,
    subordinadas: subordinadas.map(s => ({
      id:        s.id,
      name:      s.name,
      sapUserId: s.sapUserId,
      role:      s.role,
      status:    s.status ?? null,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    creditNotes: creditNotes.map((n: any) => ({
      ...n,
      amount: Number(n.amount),
    })),
    totalCreditNotesMes,
    diq,
  };
}

// GET /api/profile/me
router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const data = await buildProfileData(req.user!);
    res.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/profile/:userId -- solo Super Admin puede ver el perfil de otro usuario
router.get('/:userId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.isSuperAdmin) {
      res.status(403).json({ error: 'Solo Super Admin puede ver el perfil de otros usuarios' });
      return;
    }

    const target = await prisma.user.findUnique({ where: { id: req.params.userId as string } });
    if (!target) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    const data = await buildProfileData(target);
    res.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;
