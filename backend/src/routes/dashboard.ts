import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { AuthRequest } from '../types';
import { prisma } from '../utils/prisma';

const router = Router();


// ─── Helper: créditos activos de un usuario en un rango ─────────────────────
async function creditNotesTotal(userId: string, gte: Date, lt: Date): Promise<number> {
  const r = await prisma.creditNote.aggregate({
    where: { userId, docDate: { gte, lt }, cancelled: false },
    _sum: { amount: true },
  });
  return Number(r._sum.amount ?? 0);
}

// GET /api/dashboard/overview
router.get('/overview', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user   = req.user!;
    const month  = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year   = parseInt(req.query.year  as string) || new Date().getFullYear();

    const gte     = new Date(year, month - 1, 1);
    const lt      = new Date(year, month, 1);

    // ── mes anterior ─────────────────────────────────────────────────────────
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const prevGte   = new Date(prevYear, prevMonth - 1, 1);
    const prevLt    = new Date(prevYear, prevMonth, 1);

    // ── hoy / ayer ────────────────────────────────────────────────────────────
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const yestStart  = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);
    const yestEnd    = new Date(todayEnd);   yestEnd.setDate(yestEnd.getDate() - 1);

    // ── ventas personales ─────────────────────────────────────────────────────
    const [salesAgg, todayAgg, yestAgg, prevSalesAgg, targetRow] = await Promise.all([
      prisma.sale.aggregate({
        where: { userId: user.sapUserId, saleDate: { gte, lt }, status: { not: 'cancelled' } },
        _sum: { amount: true }, _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { userId: user.sapUserId, saleDate: { gte: todayStart, lte: todayEnd }, status: { not: 'cancelled' } },
        _sum: { amount: true }, _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { userId: user.sapUserId, saleDate: { gte: yestStart, lte: yestEnd }, status: { not: 'cancelled' } },
        _sum: { amount: true }, _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { userId: user.sapUserId, saleDate: { gte: prevGte, lt: prevLt }, status: { not: 'cancelled' } },
        _sum: { amount: true },
      }),
      prisma.target.findUnique({
        where: { userId_month_year: { userId: user.sapUserId, month, year } },
      }),
    ]);

    const creditosPersonales = await creditNotesTotal(user.sapUserId, gte, lt);
    const totalSales         = Math.max(0, Number(salesAgg._sum.amount    || 0) - creditosPersonales);
    const todaySales         = Number(todayAgg._sum.amount    || 0);
    const yesterdaySales   = Number(yestAgg._sum.amount     || 0);
    const lastMonthSales   = Number(prevSalesAgg._sum.amount || 0);
    const targetAmount     = Number(targetRow?.targetAmount  || 0);
    const achievementPercent = targetAmount > 0 ? (totalSales / targetAmount) * 100 : 0;

    // ── datos de grupo (subordinadas) ─────────────────────────────────────────
    // .filter(...) -- salvaguarda: si algun dato viejo de sync dejo a la
    // directora con supervisorId = su propio id, no se cuenta a si misma
    // dentro de "su grupo" (duplicaria su produccion personal y apareceria
    // en su propio ranking de consultoras). Ver fix de raiz en syncService.ts.
    const subs = user.subordinates.filter(s => s.id !== user.id);
    const subIds = subs.map(s => s.sapUserId);

    let groupTotalSales   = 0;
    let lastMonthGroupSales = 0;
    let groupTargetAmount = 0;
    let consultorasActivas = 0;
    let lastMonthConsultorasActivas = 0;
    let consultoraRanking: { sapUserId: string; name: string; ventas: number; meta: number; pedidos: number }[] = [];

    if (subIds.length > 0) {
      const [grpAgg, prevGrpAgg, metasAgg, activasIds, prevActivasIds, grpRows] = await Promise.all([
        // ventas grupo mes actual
        prisma.sale.aggregate({
          where: { userId: { in: subIds }, saleDate: { gte, lt }, status: { not: 'cancelled' } },
          _sum: { amount: true },
        }),
        // ventas grupo mes anterior
        prisma.sale.aggregate({
          where: { userId: { in: subIds }, saleDate: { gte: prevGte, lt: prevLt }, status: { not: 'cancelled' } },
          _sum: { amount: true },
        }),
        // suma metas del grupo
        prisma.target.aggregate({
          where: { userId: { in: subIds }, month, year },
          _sum: { targetAmount: true },
        }),
        // consultoras activas este mes
        prisma.sale.findMany({
          where: { userId: { in: subIds }, saleDate: { gte, lt }, status: { not: 'cancelled' } },
          select: { userId: true }, distinct: ['userId'],
        }),
        // consultoras activas mes anterior
        prisma.sale.findMany({
          where: { userId: { in: subIds }, saleDate: { gte: prevGte, lt: prevLt }, status: { not: 'cancelled' } },
          select: { userId: true }, distinct: ['userId'],
        }),
        // ventas por consultora (para ranking)
        prisma.sale.groupBy({
          by: ['userId'],
          where: { userId: { in: subIds }, saleDate: { gte, lt }, status: { not: 'cancelled' } },
          _sum: { amount: true }, _count: { id: true },
          orderBy: { _sum: { amount: 'desc' } },
        }),
      ]);

      const grpCredits             = await prisma.creditNote.aggregate({
        where: { userId: { in: subIds }, docDate: { gte, lt }, cancelled: false },
        _sum: { amount: true },
      });
      groupTotalSales             = Math.max(0, Number(grpAgg._sum.amount || 0) - Number(grpCredits._sum.amount ?? 0));
      lastMonthGroupSales         = Number(prevGrpAgg._sum.amount || 0);
      groupTargetAmount           = Number(metasAgg._sum.targetAmount || 0);
      consultorasActivas          = activasIds.length;
      lastMonthConsultorasActivas = prevActivasIds.length;

      // Metas individuales para el ranking
      const metaMap: Record<string, number> = {};
      const targets = await prisma.target.findMany({ where: { userId: { in: subIds }, month, year } });
      targets.forEach(t => { metaMap[t.userId] = Number(t.targetAmount); });

      const nameMap: Record<string, string> = {};
      subs.forEach(s => { nameMap[s.sapUserId] = s.name; });

      consultoraRanking = grpRows.map(r => ({
        sapUserId: r.userId,
        name:      nameMap[r.userId] ?? r.userId,
        ventas:    Number(r._sum.amount || 0),
        meta:      metaMap[r.userId]   ?? 0,
        pedidos:   r._count.id,
      })).slice(0, 5);
    }

    const groupAchievementPercent = groupTargetAmount > 0
      ? (groupTotalSales / groupTargetAmount) * 100 : 0;

    // ── unidad completa (directora + grupo) ────────────────────────────────────
    // Confirmado 12-ago-2026: "groupTotalSales" a propósito excluye la
    // producción personal de la directora (ver comentario arriba), pero eso
    // dejaba a las directoras/DEC sin forma de ver la producción TOTAL de su
    // unidad (ella + sus consultoras) en un solo número. Se agrega esto como
    // campos NUEVOS y separados -- no se toca groupTotalSales ni su significado,
    // para no romper nada que ya dependa de ese campo (Llave Rosa, Super Admin, etc).
    const unitTotalSales        = totalSales + groupTotalSales;
    const lastMonthUnitSales    = lastMonthSales + lastMonthGroupSales;
    const unitTargetAmount      = targetAmount + groupTargetAmount;
    const unitAchievementPercent = unitTargetAmount > 0 ? (unitTotalSales / unitTargetAmount) * 100 : 0;

    res.json({
      user: { name: user.name, role: user.role, unitName: user.unitName },
      // personales
      totalSales, todaySales, yesterdaySales, lastMonthSales,
      todayCount: todayAgg._count.id,
      salesCount:  salesAgg._count.id,
      targetAmount, achievementPercent: Math.round(achievementPercent * 10) / 10,
      // grupo (solo consultoras, sin la directora -- ver comentario arriba)
      groupTotalSales, lastMonthGroupSales,
      groupTargetAmount,
      groupAchievementPercent: Math.round(groupAchievementPercent * 10) / 10,
      consultorasActivas, lastMonthConsultorasActivas,
      subordinateCount: subs.length,
      consultoraRanking,
      // unidad completa (directora + grupo)
      unitTotalSales, lastMonthUnitSales,
      unitTargetAmount,
      unitAchievementPercent: Math.round(unitAchievementPercent * 10) / 10,
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
    const user  = req.user!;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year  as string) || new Date().getFullYear();
    const page  = parseInt(req.query.page  as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const startDate = new Date(year, month - 1, 1);
    const endDate   = new Date(year, month, 0, 23, 59, 59);

    const subordinates = user.subordinates.filter(s => s.id !== user.id); // salvaguarda self-supervision
    const total        = subordinates.length;
    const paginated    = subordinates.slice((page - 1) * limit, page * limit);

    const data = await Promise.all(
      paginated.map(async (sub) => {
        const salesResult = await prisma.sale.aggregate({
          where: { userId: sub.sapUserId, saleDate: { gte: startDate, lte: endDate }, status: { not: 'cancelled' } },
          _sum: { amount: true }, _count: true,
        });

        const target = await prisma.target.findUnique({
          where: { userId_month_year: { userId: sub.sapUserId, month, year } },
        });

        const totalSalesAmt    = Number(salesResult._sum.amount || 0);
        const targetAmt        = Number(target?.targetAmount || 0);
        const achievementPct   = targetAmt > 0 ? (totalSalesAmt / targetAmt) * 100 : 0;

        return {
          id: sub.id, name: sub.name, sapUserId: sub.sapUserId,
          totalSales: totalSalesAmt, targetAmount: targetAmt,
          achievementPercent: Math.round(achievementPct * 10) / 10,
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

// GET /api/dashboard/m// GET /api/dashboard/metas
// La Target de la directora = meta de unidad (asignada por superadmin)
router.get('/metas', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user  = req.user!;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year  as string) || new Date().getFullYear();

    const unitTargetRow = await prisma.target.findUnique({
      where: { userId_month_year: { userId: user.sapUserId, month, year } },
    });
    const unitGoal = Number(unitTargetRow?.targetAmount ?? 0);

    const subordinates = (user.subordinates ?? []).filter(s => s.id !== user.id); // salvaguarda self-supervision
    const allMembers = [
      { id: user.id, sapUserId: user.sapUserId, name: user.name, role: user.role, isDirectora: true },
      ...subordinates.map(s => ({ id: s.id, sapUserId: s.sapUserId, name: s.name, role: 'consultora', isDirectora: false })),
    ];

    const allIds = allMembers.map(m => m.sapUserId);
    const existingTargets = await prisma.target.findMany({
      where: { userId: { in: allIds }, month, year },
    });
    const targetMap = new Map(existingTargets.map(t => [t.userId, Number(t.targetAmount)]));

    const members = allMembers.map(m => ({
      id:            m.id,
      sapUserId:     m.sapUserId,
      name:          m.name,
      role:          m.role,
      isDirectora:   m.isDirectora,
      currentTarget: targetMap.get(m.sapUserId) ?? 0,
    }));

    const totalDistributed = members.reduce((s, m) => s + m.currentTarget, 0);

    res.json({ month, year, unitGoal, totalDistributed, members });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error cargando metas' });
  }
});

// PUT /api/dashboard/metas — directora guarda distribucion
router.put('/metas', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'directora' && user.role !== 'diq' && !user.isSuperAdmin) {
      res.status(403).json({ error: 'Solo directoras pueden distribuir metas' });
      return;
    }

    const { month, year, targets } = req.body as {
      month:   number;
      year:    number;
      targets: { sapUserId: string; amount: number }[];
    };

    if (!month || !year || !Array.isArray(targets)) {
      res.status(400).json({ error: 'month, year y targets son requeridos' });
      return;
    }

    const allowedIds = new Set([
      user.sapUserId,
      ...(user.subordinates ?? []).map(s => s.sapUserId),
    ]);

    const forbidden = targets.find(t => !allowedIds.has(t.sapUserId));
    if (forbidden) {
      res.status(403).json({ error: 'No tienes permiso sobre ese usuario' });
      return;
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
    console.error(error);
    res.status(500).json({ error: 'Error guardando metas' });
  }
});

// GET /api/dashboard/iniciadoras -- vista "celulas" para la directora: sus
// reclutas personales directas (inciadoraId = ella, viene de U_CodIni en SAP
// -- reclutamiento personal, NO tiene que ver con supervisorId/unidad SAP) con
// su produccion del periodo, y para cada una sus propias reclutas (nivel 2).
// Mismo calculo de produccion que superadmin.ts /iniciadoras: suma bruta de
// Sale.amount del periodo sin restar notas de credito -- es informativo,
// consistente con el resto del sistema (no toca el motor de comisiones).
const DASHBOARD_ITBIS = 1.18;

router.get('/iniciadoras', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    // DEC (antes DIQ) tambien puede tener reclutas personales propias (U_CodIni
    // en SAP) igual que una directora -- misma vista, mismos datos, solo que
    // filtrados por su propio id via inciadoraId (ver query de abajo).
    if (user.role !== 'directora' && user.role !== 'diq' && !user.isSuperAdmin) {
      res.status(403).json({ error: 'Esta vista es exclusiva para Directoras y DEC' });
      return;
    }

    const now   = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const year  = req.query.year  ? parseInt(req.query.year  as string) : now.getFullYear();
    const gte   = new Date(year, month - 1, 1);
    const lt    = new Date(year, month, 1);

    // Nivel 1: a quien reclutó personalmente la directora
    const nivel1 = await prisma.user.findMany({
      where: { inciadoraId: user.id },
      select: {
        id: true, sapUserId: true, name: true, role: true,
        reclutas: {
          select: { id: true, sapUserId: true, name: true, role: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (nivel1.length === 0) {
      res.json({ month, year, totalReclutas: 0, totalReclutasNivel2: 0, produccionTotal: 0, iniciadoras: [] });
      return;
    }

    // Nivel 2: reclutas de cada recluta -- se traen todas las ventas (nivel 1 + 2) en una sola query
    const nivel2Ids = nivel1.flatMap(n => n.reclutas.map(r => r.sapUserId));
    const allIds = [...nivel1.map(n => n.sapUserId), ...nivel2Ids];

    const ventas = await prisma.sale.groupBy({
      by: ['userId'],
      where: { userId: { in: allIds }, saleDate: { gte, lt }, status: { not: 'cancelled' } },
      _sum: { amount: true },
      _count: { id: true },
    });

    const ventasMap = new Map(ventas.map(v => [v.userId, {
      total:   Number(v._sum.amount ?? 0),
      pedidos: v._count.id,
    }]));

    const result = nivel1.map(n => {
      const vN1 = ventasMap.get(n.sapUserId);

      const reclutasDetalle = n.reclutas.map(r => {
        const v = ventasMap.get(r.sapUserId);
        return {
          sapUserId: r.sapUserId,
          name:      r.name,
          role:      r.role,
          ventas:    v?.total   ?? 0,
          pedidos:   v?.pedidos ?? 0,
          activa:    (v?.total ?? 0) > 0,
        };
      }).sort((a, b) => b.ventas - a.ventas);

      const produccionReclutas = reclutasDetalle.reduce((s, r) => s + r.ventas, 0);

      return {
        sapUserId:        n.sapUserId,
        name:              n.name,
        role:              n.role,
        ventasPersonales:  vN1?.total   ?? 0,
        pedidosPersonales: vN1?.pedidos ?? 0,
        totalReclutas:     n.reclutas.length,
        reclutasActivas:   reclutasDetalle.filter(r => r.activa).length,
        produccionReclutas,
        produccionNeta:    produccionReclutas / DASHBOARD_ITBIS,
        reclutas:          reclutasDetalle,
      };
    });

    result.sort((a, b) =>
      (b.ventasPersonales + b.produccionReclutas) - (a.ventasPersonales + a.produccionReclutas)
    );

    const produccionTotal = result.reduce((s, n) => s + n.ventasPersonales + n.produccionReclutas, 0);

    res.json({
      month, year,
      totalReclutas:       nivel1.length,
      totalReclutasNivel2: nivel2Ids.length,
      produccionTotal,
      iniciadoras: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error cargando iniciadoras' });
  }
});

export default router;
