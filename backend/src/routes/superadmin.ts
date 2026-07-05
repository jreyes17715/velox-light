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

      const creditAgg = await prisma.creditNote.aggregate({
        where: { userId: { in: sapIds }, docDate: { gte, lt }, cancelled: false },
        _sum: { amount: true },
      });
      const compraBruta = Math.max(0, Number(result._sum.amount ?? 0) - Number(creditAgg._sum.amount ?? 0));
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

    const totalBruta    = unidades.reduce((s, u) => s + u.compraBruta, 0);
    const totalNeta     = unidades.reduce((s, u) => s + u.compraNeta, 0);
    const totalComision = unidades.reduce((s, u) => s + u.comision, 0);
    const totalPedidos  = unidades.reduce((s, u) => s + u.pedidos, 0);

    // --- Datos adicionales para el dashboard ---

    // Ventas de hoy y ayer
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(todayStart.getTime() + 86400000);
    const yestStart  = new Date(todayStart.getTime() - 86400000);
    const [todayAgg, yestAgg] = await Promise.all([
      prisma.sale.aggregate({ where: { saleDate: { gte: todayStart, lt: todayEnd }, status: { not: 'cancelled' } }, _sum: { amount: true } }),
      prisma.sale.aggregate({ where: { saleDate: { gte: yestStart,  lt: todayStart }, status: { not: 'cancelled' } }, _sum: { amount: true } }),
    ]);
    const todaySales     = Number(todayAgg._sum.amount ?? 0);
    const yesterdaySales = Number(yestAgg._sum.amount  ?? 0);

    // Mes anterior
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const prevGte   = new Date(prevYear, prevMonth - 1, 1);
    const prevLt    = new Date(prevYear, prevMonth, 1);
    const prevMonthAgg = await prisma.sale.aggregate({
      where: { saleDate: { gte: prevGte, lt: prevLt }, status: { not: 'cancelled' } },
      _sum: { amount: true },
    });
    const lastMonthBruta = Number(prevMonthAgg._sum.amount ?? 0);

    // Consultoras activas (con al menos 1 venta en el mes)
    const activeUserIds = await prisma.sale.findMany({
      where: { saleDate: { gte, lt }, status: { not: 'cancelled' } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const consultorasActivas = activeUserIds.length;

    // Consultoras activas mes anterior
    const prevActiveUserIds = await prisma.sale.findMany({
      where: { saleDate: { gte: prevGte, lt: prevLt }, status: { not: 'cancelled' } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const lastMonthConsultorasActivas = prevActiveUserIds.length;

    // Unidades activas este mes y mes anterior
    const unidadesActivas         = unidades.filter(u => u.compraBruta > 0).length;
    const prevUnidadesActivas     = await (async () => {
      // Approx: cuantas unidades tuvieron ventas el mes anterior
      let count = 0;
      for (const dir of directoras) {
        const miembros = await prisma.user.findMany({ where: { supervisorId: dir.id }, select: { sapUserId: true } });
        const sapIds = [dir.sapUserId, ...miembros.map(m => m.sapUserId)];
        const r = await prisma.sale.aggregate({
          where: { userId: { in: sapIds }, saleDate: { gte: prevGte, lt: prevLt }, status: { not: 'cancelled' } },
          _sum: { amount: true },
        });
        if (Number(r._sum.amount ?? 0) > 0) count++;
      }
      return count;
    })();

    // Top 5 personas por produccion
    const topSalesGroups = await prisma.sale.groupBy({
      by: ['userId'],
      where: { saleDate: { gte, lt }, status: { not: 'cancelled' } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });
    const topIds   = topSalesGroups.map(s => s.userId);
    const topUsers = await prisma.user.findMany({ where: { sapUserId: { in: topIds } }, select: { sapUserId: true, name: true, role: true } });
    const rankingPersonas = topSalesGroups
      .map(s => {
        const u = topUsers.find(u => u.sapUserId === s.userId);
        return { sapUserId: s.userId, name: u?.name ?? s.userId, role: u?.role ?? '', ventas: Number(s._sum.amount ?? 0) };
      })
      .slice(0, 5);

    // Total metas del mes (para avance general)
    const metasAgg = await prisma.target.aggregate({
      where: { month, year },
      _sum: { targetAmount: true },
    });
    const totalMetas = Number(metasAgg._sum.targetAmount ?? 0);

    res.json({
      month, year,
      resumen: {
        totalBruta, totalNeta, totalComision, totalPedidos,
        unidadesCount: unidades.length,
        todaySales, yesterdaySales, lastMonthBruta,
        consultorasActivas, lastMonthConsultorasActivas,
        unidadesActivas, lastMonthUnidadesActivas: prevUnidadesActivas,
        totalMetas,
      },
      unidades,
      rankingPersonas,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/superadmin/search?q=lucia
router.get('/search', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const q = (req.query.q as string ?? '').trim();
    if (q.length < 2) { res.json([]); return; }

    const users = await prisma.user.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        isSuperAdmin: false,
        localPassword: null,
      },
      select: {
        id: true, sapUserId: true, name: true, role: true, unitName: true,
        supervisor: { select: { name: true, unitName: true } },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/superadmin/user/:sapUserId?month=5&year=2026
router.get('/user/:sapUserId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const now   = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const year  = req.query.year  ? parseInt(req.query.year  as string) : now.getFullYear();
    const gte   = new Date(year, month - 1, 1);
    const lt    = new Date(year, month, 1);

    const user = await prisma.user.findUnique({
      where: { sapUserId: req.params.sapUserId },
      include: {
        supervisor:  { select: { name: true, sapUserId: true, unitName: true } },
        subordinates:{ select: { name: true, sapUserId: true } },
        reclutas:    { select: { name: true, sapUserId: true, role: true } },
      },
    });
    if (!user) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }

    // Ventas del mes
    const ventasMes = await prisma.sale.aggregate({
      where: { userId: user.sapUserId, saleDate: { gte, lt }, status: { not: 'cancelled' } },
      _sum: { amount: true }, _count: { id: true },
    });

    // Meta del mes
    const meta = await prisma.target.findUnique({
      where: { userId_month_year: { userId: user.sapUserId, month, year } },
    });

    // Historial 6 meses
    const historial = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date(year, month - 1 - i, 1);
        return { month: d.getMonth() + 1, year: d.getFullYear() };
      }).map(async ({ month: m, year: y }) => {
        const s = new Date(y, m - 1, 1);
        const e = new Date(y, m, 1);
        const r = await prisma.sale.aggregate({
          where: { userId: user.sapUserId, saleDate: { gte: s, lt: e }, status: { not: 'cancelled' } },
          _sum: { amount: true }, _count: { id: true },
        });
        return { month: m, year: y, ventas: Number(r._sum.amount ?? 0), pedidos: r._count.id };
      })
    );

    // Últimas 10 ventas
    const ultimasVentas = await prisma.sale.findMany({
      where: { userId: user.sapUserId, status: { not: 'cancelled' } },
      orderBy: { saleDate: 'desc' },
      take: 10,
      select: { sapDocNum: true, amount: true, saleDate: true, status: true },
    });

    res.json({
      user: {
        id: user.id, sapUserId: user.sapUserId, name: user.name,
        email: user.email, role: user.role, unitName: user.unitName,
        supervisor: user.supervisor,
        subordinadasCount: user.subordinates.length,
        reclutasCount: user.reclutas.length,
        reclutas: user.reclutas,
      },
      mesActual: {
        month, year,
        ventas:  Number(ventasMes._sum.amount ?? 0),
        pedidos: ventasMes._count.id,
        meta:    Number(meta?.targetAmount ?? 0),
      },
      historial: historial.reverse(),
      ultimasVentas,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/superadmin/unit/:directoraId?month=5&year=2026
router.get('/unit/:directoraId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const now   = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const year  = req.query.year  ? parseInt(req.query.year  as string) : now.getFullYear();
    const gte   = new Date(year, month - 1, 1);
    const lt    = new Date(year, month, 1);

    const directora = await prisma.user.findUnique({
      where: { id: req.params.directoraId },
      select: { id: true, sapUserId: true, name: true, unitName: true },
    });
    if (!directora) { res.status(404).json({ error: 'Directora no encontrada' }); return; }

    const miembros = await prisma.user.findMany({
      where: { supervisorId: directora.id },
      select: { id: true, sapUserId: true, name: true },
      orderBy: { name: 'asc' },
    });

    const allMembers = [
      { id: directora.id, sapUserId: directora.sapUserId, name: directora.name, esDirectora: true },
      ...miembros.map(m => ({ ...m, esDirectora: false })),
    ];

    // Ventas de cada miembro
    const detalle = await Promise.all(allMembers.map(async m => {
      const r = await prisma.sale.aggregate({
        where: { userId: m.sapUserId, saleDate: { gte, lt }, status: { not: 'cancelled' } },
        _sum: { amount: true }, _count: { id: true },
      });
      const meta = await prisma.target.findUnique({
        where: { userId_month_year: { userId: m.sapUserId, month, year } },
      });
      const ventas = Number(r._sum.amount ?? 0);
      const metaAmt = Number(meta?.targetAmount ?? 0);
      return {
        ...m,
        ventas,
        pedidos: r._count.id,
        meta: metaAmt,
        pct: metaAmt > 0 ? Math.min((ventas / metaAmt) * 100, 100) : 0,
      };
    }));

    detalle.sort((a, b) => b.ventas - a.ventas);

    const totalBruta = detalle.reduce((s, m) => s + m.ventas, 0);

    res.json({
      directora: { ...directora, unidad: directora.unitName ?? directora.name },
      month, year,
      totalBruta,
      totalNeta: totalBruta / ITBIS,
      miembros: detalle,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/superadmin/sales-report?startDate=2026-01-01&endDate=2026-06-30&unitId=<directoraId>
// Reporte detallado de ventas por persona — para exportar a Excel
router.get('/sales-report', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const { startDate, endDate, unitId } = req.query as Record<string, string>;

    // Rango de fechas (default: mes actual)
    const now   = new Date();
    const gte   = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const lt    = endDate   ? new Date(new Date(endDate).setDate(new Date(endDate).getDate() + 1)) : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Si viene unitId filtramos por miembros de esa unidad
    let userIds: string[] | undefined;
    if (unitId) {
      const directora = await prisma.user.findUnique({ where: { id: unitId } });
      if (!directora) { res.status(404).json({ error: 'Unidad no encontrada' }); return; }
      const miembros = await prisma.user.findMany({
        where: { supervisorId: unitId },
        select: { sapUserId: true },
      });
      userIds = [directora.sapUserId, ...miembros.map(m => m.sapUserId)];
    }

    // Todos los usuarios relevantes (excluye superadmins locales)
    const users = await prisma.user.findMany({
      where: {
        isSuperAdmin: false,
        localPassword: null,
        ...(userIds ? { sapUserId: { in: userIds } } : {}),
      },
      select: {
        id: true, sapUserId: true, name: true, role: true, unitName: true,
        supervisor: { select: { name: true, unitName: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Ventas en el período para cada usuario
    const rows = await Promise.all(users.map(async u => {
      const r = await prisma.sale.aggregate({
        where: {
          userId: u.sapUserId,
          saleDate: { gte, lt },
          status: { not: 'cancelled' },
        },
        _sum: { amount: true },
        _count: { id: true },
      });
      const totalBruta = Number(r._sum.amount ?? 0);
      const totalNeta  = totalBruta / ITBIS;
      const pedidos    = r._count.id;

      // Determinar nombre de unidad
      let unidad = '—';
      let directora = '—';
      if (u.role === 'directora') {
        unidad    = u.unitName ?? u.name;
        directora = u.name;
      } else if (u.supervisor) {
        unidad    = u.supervisor.unitName ?? u.supervisor.name;
        directora = u.supervisor.name;
      }

      return {
        sapUserId: u.sapUserId,
        nombre:    u.name,
        rol:       u.role,
        unidad,
        directora,
        totalBruta,
        totalNeta,
        pedidos,
        promedio:  pedidos > 0 ? totalBruta / pedidos : 0,
      };
    }));

    // Ordenar por totalBruta desc
    rows.sort((a, b) => b.totalBruta - a.totalBruta);

    // Resumen por unidad
    const unidadMap = new Map<string, {
      unidad: string; directora: string;
      totalBruta: number; totalNeta: number; pedidos: number; miembros: number;
    }>();
    for (const r of rows) {
      const key = r.unidad;
      if (!unidadMap.has(key)) {
        unidadMap.set(key, { unidad: r.unidad, directora: r.directora, totalBruta: 0, totalNeta: 0, pedidos: 0, miembros: 0 });
      }
      const u = unidadMap.get(key)!;
      u.totalBruta += r.totalBruta;
      u.totalNeta  += r.totalNeta;
      u.pedidos    += r.pedidos;
      u.miembros   += 1;
    }

    const porUnidad = Array.from(unidadMap.values())
      .map(u => ({
        ...u,
        rate:     getUnitRate(u.totalBruta),
        comision: (u.totalNeta) * getUnitRate(u.totalBruta),
      }))
      .sort((a, b) => b.totalBruta - a.totalBruta);

    res.json({
      startDate: gte.toISOString().slice(0, 10),
      endDate:   new Date(lt.getTime() - 1).toISOString().slice(0, 10),
      totalRegistros: rows.length,
      porPersona: rows,
      porUnidad,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── GET /superadmin/metas ────────────────────────────────────────────────────

router.get('/metas', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year  as string) || new Date().getFullYear();

    // Todas las directoras
    const directoras = await prisma.user.findMany({
      where: { role: 'directora' },
      include: { subordinates: true },
    });

    const grupos = await Promise.all(directoras.map(async (d) => {
      // Meta directora
      const dirTarget = await prisma.target.findUnique({
        where: { userId_month_year: { userId: d.sapUserId, month, year } },
      });

      // Miembros con sus metas
      const miembros = await Promise.all(d.subordinates.map(async (s) => {
        const t = await prisma.target.findUnique({
          where: { userId_month_year: { userId: s.sapUserId, month, year } },
        });
        return {
          id:        s.id,
          sapUserId: s.sapUserId,
          name:      s.name,
          role:      s.role,
          meta:      t ? Number(t.targetAmount) : 0,
        };
      }));

      return {
        directoraId:     d.id,
        directoraSapId:  d.sapUserId,
        directoraNombre: d.name,
        unidad:          d.unitName ?? '',
        directoraMeta:   dirTarget ? Number(dirTarget.targetAmount) : 0,
        miembros,
      };
    }));

    res.json({ month, year, grupos });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── PUT /superadmin/metas ────────────────────────────────────────────────────

router.put('/metas', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const { month, year, targets } = req.body as {
      month: number;
      year:  number;
      targets: { sapUserId: string; amount: number }[];
    };

    if (!month || !year || !Array.isArray(targets)) {
      return res.status(400).json({ error: 'month, year, targets required' });
    }

    const ops = targets.map(t =>
      prisma.target.upsert({
        where:  { userId_month_year: { userId: t.sapUserId, month, year } },
        create: { userId: t.sapUserId, month, year, targetAmount: t.amount, currency: 'DOP' },
        update: { targetAmount: t.amount },
      })
    );

    await prisma.$transaction(ops);
    res.json({ ok: true, updated: targets.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
