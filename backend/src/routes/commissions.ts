import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { calcCommissions } from '../services/commissionService';
import { prisma } from '../utils/prisma';

const router = Router();

// GET /api/commissions?month=5&year=2026
// GET /api/commissions?month=5&year=2026&userId=xxx  (solo superadmin, futuro)
router.get('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const year  = req.query.year  ? parseInt(req.query.year  as string) : now.getFullYear();

    if (month < 1 || month > 12 || year < 2020) {
      res.status(400).json({ error: 'Parámetros month/year inválidos' });
      return;
    }

    // Solo directoras tienen comisiones de unidad y descendientes
    // Consultoras solo tienen Tipo C (si son iniciadoras)
    const result = await calcCommissions(user.id, month, year);

    res.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/commissions/summary?year=2026
// Resumen de todos los meses del año para el usuario
router.get('/summary', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

    const months = await Promise.all(
      Array.from({ length: 12 }, (_, i) => i + 1).map(async (month) => {
        const result = await calcCommissions(user.id, month, year);
        return {
          month,
          tipoA: result.tipoA.comision,
          tipoB: result.tipoB.totalComision,
          tipoC: result.tipoC.totalComision,
          total: result.totalComision,
        };
      }),
    );

    res.json({ year, months });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;
