import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { AuthRequest } from '../types';
import { prisma } from '../utils/prisma';

const router = Router();

// GET /api/dashboard/overview
router.get('/overview', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Ventas del usuario en el período
    const salesResult = await prisma.sale.aggregate({
      where: {
        userId: user.sapUserId,
        saleDate: { gte: startDate, lte: endDate },
        status: { not: 'cancelled' },
      },
      _sum: { amount: true },
      _count: true,
    });

    // Meta del usuario en el período
    const target = await prisma.target.findUnique({
      where: { userId_month_year: { userId: user.sapUserId, month, year } },
    });

    const totalSales = Number(salesResult._sum.amount || 0);
    const targetAmount = Number(target?.targetAmount || 0);
    const achievementPercent = targetAmount > 0 ? (totalSales / targetAmount) * 100 : 0;

    res.json({
      user: { name: user.name, role: user.role, unitName: user.unitName },
      totalSales,
      targetAmount,
      achievementPercent: Math.round(achievementPercent * 10) / 10,
      salesCount: salesResult._count,
      subordinateCount: user.subordinates.length,
      currency: 'DOP',
      period: { month, year },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching overview' });
  }
});

// GET /api/dashboard/subordinates
router.get('/subordinates', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const subordinates = user.subordinates;
    const total = subordinates.length;
    const paginated = subordinates.slice((page - 1) * limit, page * limit);

    const data = await Promise.all(
      paginated.map(async (sub) => {
        const salesResult = await prisma.sale.aggregate({
          where: {
            userId: sub.sapUserId,
            saleDate: { gte: startDate, lte: endDate },
            status: { not: 'cancelled' },
          },
          _sum: { amount: true },
          _count: true,
        });

        const target = await prisma.target.findUnique({
          where: { userId_month_year: { userId: sub.sapUserId, month, year } },
        });

        const totalSales = Number(salesResult._sum.amount || 0);
        const targetAmount = Number(target?.targetAmount || 0);
        const achievementPercent = targetAmount > 0 ? (totalSales / targetAmount) * 100 : 0;

        return {
          id: sub.id,
          name: sub.name,
          sapUserId: sub.sapUserId,
          totalSales,
          targetAmount,
          achievementPercent: Math.round(achievementPercent * 10) / 10,
          salesCount: salesResult._count,
        };
      })
    );

    res.json({ data, page, limit, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching subordinates' });
  }
});

export default router;
