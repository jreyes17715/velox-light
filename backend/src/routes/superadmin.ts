import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../types';

const router = Router();

const ITBIS = 1.18;

function getUnitRate(bruta: number): number {
  if (bruta >= 550_000) return 0.14;
  if (bruta >= 450_000) return 0.08;
  if (bruta >= 1)       return 0.06;
  return 0;
}

function requireSuperAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: 'Acceso restringido a Super Admin' });
    return false;
  }
  return true;
}

// GET /api/superadmin/overview?month=5&year=2026
// Dashboard consolidado: todas las unidades con producción del mes
router.get('/overview', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const year  = req.query.year  ? parseInt(req.query.year  as string) : now.getFullYear();

    const gte = new Date(year, month - 1, 1);
    const lt  = new Date(year, month, 1);

    // Todas las directoras
    const directoras = await prisma.user.findMany({
      where: { role: 'directora' },
      select: { id: true, sapUserId: true, name: true, unitName: true },
      orderBy: { name: 'asc' },
    });

    // Para cada directora calcular producción de su unidad
    const unidades = await Promise.all(directoras.map(async (dir) => {
      const miembros = await prisma.user.findMany({
        where: { supervisorId: dir.id },
        select: { sapUserId: true },
      });
      const sapIds = [dir.sapUserId, ...miembros.map(m => m.sapUserId)];

      const result = await prisma.sale.aggregate({
        where: {
          userId: { in: sapIds },
          saleDate: { gte, lt },
          status: { not: 'cancelled' },
        },
        _sum: { amount: true },
        _count: { id: true },
      });

      const compraBruta = Number(result._sum.amount ?? 0);
      const compraNeta  = compraBruta / ITBIS;
      const rate        = getUnitRate(compraBruta);
      const comision    = compraNeta * rate;

      return {
        directoraId:   dir.id,
        sapUserId:     dir.sapUserId,
        nombre:        dir.name,
        unidad:        dir.unitName ?? dir.name,
        miembros:      sapIds.length,
        compraBruta,
        compraNeta,
        rate,
        comision,
        pedidos:       result._count.id,
      };
    }));

    // Ordenar por compraBruta desc (ranking)
    unidades.sort((a, b) => b.compraBruta - a.compraBruta);

    const totalBruta   = unidades.reduce((s, u) => s + u.compraBruta, 0);
    const totalNeta    = unidades.reduce((s, u) => s + u.compraNeta, 0);
    const totalComision = unidades.reduce((s, u) => s + u.comision, 0);
    const totalPedidos = unidades.reduce((s, u) => s + u.pedidos, 0);

    res.json({
      month, year,
      resumen: { totalBruta, totalNeta, totalComision, totalPedidos, unidadesCount: unidades.length },
      unidades,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;
