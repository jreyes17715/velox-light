import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { AuthRequest } from '../types';
import { prisma } from '../utils/prisma';

const router = Router();

// GET /api/sales
router.get('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { userId, startDate, endDate, status, page = '1', limit = '20' } = req.query as Record<string, string>;

    const targetUserId = userId || user.sapUserId;

    // Verificar autorización: solo puede ver sus propias ventas o de sus subordinadas
    if (targetUserId !== user.sapUserId) {
      const isSubordinate = user.subordinates.some((s) => s.sapUserId === targetUserId);
      if (!isSubordinate) {
        res.status(403).json({ error: 'Forbidden: cannot access this user data' });
        return;
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const where: Record<string, unknown> = { userId: targetUserId };
    if (startDate) where.saleDate = { ...(where.saleDate as object || {}), gte: new Date(startDate) };
    if (endDate) where.saleDate = { ...(where.saleDate as object || {}), lte: new Date(endDate) };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { saleDate: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.sale.count({ where }),
    ]);

    res.json({
      data: data.map((s) => ({
        id: s.id,
        sapOrderId: s.sapOrderId,
        sapDocNum: s.sapDocNum,
        amount: Number(s.amount),
        currency: s.currency,
        saleDate: s.saleDate,
        status: s.status,
        userId: s.userId,
      })),
      page: pageNum,
      limit: limitNum,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching sales' });
  }
});

export default router;
