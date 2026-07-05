import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../types';

const router = Router();

// GET /api/profile/me
router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const gte = new Date(year, month - 1, 1);
    const lt  = new Date(year, month, 1);

    // Ventas del mes actual
    const ventasMes = await prisma.sale.aggregate({
      where: { userId: user.sapUserId, saleDate: { gte, lt }, status: { not: 'cancelled' } },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Meta del mes
    const meta = await prisma.target.findUnique({
      where: { userId_month_year: { userId: user.sapUserId, month, year } },
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
          where: { userId: user.sapUserId, saleDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
          _sum: { amount: true },
          _count: { id: true },
        });
        const metaRow = await prisma.target.findUnique({
          where: { userId_month_year: { userId: user.sapUserId, month: m, year: y } },
        });
        return {
          month: m, year: y,
          ventas: Number(result._sum.amount ?? 0),
          pedidos: result._count.id,
          meta: Number(metaRow?.targetAmount ?? 0),
        };
      })
    );

    // Reclutas (si es iniciadora)
    const reclutas = await prisma.user.findMany({
      where: { inciadoraId: user.id },
      select: { name: true, sapUserId: true, role: true },
      orderBy: { name: 'asc' },
    });

    // Supervisora (si tiene)
    let supervisora = null;
    if (user.supervisorId) {
      supervisora = await prisma.user.findUnique({
        where: { id: user.supervisorId },
        select: { name: true, sapUserId: true, unitName: true },
      });
    }

    // Notas de credito del mes actual
    const creditNotes = await prisma.creditNote.findMany({
      where: { userId: user.sapUserId, cancelled: false },
      orderBy: { docDate: 'desc' },
      take: 50,
      select: {
        id: true, sapDocNum: true, sapDocEntry: true,
        amount: true, docDate: true, comments: true,
        ncfRef: true, ncfNC: true, cancelled: true,
      },
    });

    // Total notas de credito del mes actual
    const ncMesAgg = await prisma.creditNote.aggregate({
      where: { userId: user.sapUserId, docDate: { gte, lt }, cancelled: false },
      _sum: { amount: true },
    });
    const totalCreditNotesMes = Number(ncMesAgg._sum.amount ?? 0);

    res.json({
      user: {
        id:           user.id,
        sapUserId:    user.sapUserId,
        name:         user.name,
        email:        user.email,
        role:         user.role,
        unitName:     user.unitName,
        isSuperAdmin: user.isSuperAdmin,
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
      subordinadasCount: user.subordinates.length,
      subordinadas: user.subordinates.map(s => ({
        id:       s.id,
        name:     s.name,
        sapUserId: s.sapUserId,
        role:     s.role,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      creditNotes: creditNotes.map((n: any) => ({
        ...n,
        amount: Number(n.amount),
      })),
      totalCreditNotesMes,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;
