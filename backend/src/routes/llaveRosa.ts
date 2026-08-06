import { Router, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../types';
import { getLlaveRosaConfig, saveLlaveRosaConfig } from '../utils/llaveRosaConfig';

const router = Router();

// ============================================================================
// MODULO "LLAVE ROSA" -- produccion REAL (Sale/CreditNote), reglas de negocio
// reales del reglamento entregado por Padrino (jul-2026).
//
// La produccion usa exactamente la misma regla ya validada en el resto de la
// app (ver backend/src/routes/superadmin.ts /overview): produccion de UNIDAD
// (la directora + sus subordinadas), Sale.amount ya viene filtrado a
// "Seccion 1" desde el sync (ver ONLY_SECTION_1_PRODUCTS en constants.ts),
// se le restan las notas de credito del mismo periodo, y Neta = Bruta / 1.18.
//
// Lo que SIGUE sin una fuente real (no hay tabla de inscripcion/nivel en el
// schema todavia) y por eso se resuelve con una heuristica sobre el propio
// historial de ventas, documentada en cada punto:
//   - NIVEL (A o B): normalmente lo asigna la administracion al inscribir a
//     la directora. Aqui se INFIERE del ultimo trimestre completo real: si
//     su produccion neta de unidad de ese trimestre alcanza el umbral de
//     calificacion del Nivel B, se le asigna B; si no, A. Esto es solo un
//     nivel SUGERIDO -- falta el flujo real de inscripcion administrativa.
//   - FASE (calificacion / mantenimiento): el reglamento dice que empieza al
//     sexto mes desde el inicio de participacion, dato que tampoco existe.
//     Aqui se infiere: si en los ultimos 2 trimestres completos reales ya
//     cumplio el umbral de calificacion del nivel asignado, se considera en
//     mantenimiento; si no, en calificacion.
//   - RACHA: se cuenta hacia atras, trimestre completo por trimestre
//     completo real, mientras se siga cumpliendo el umbral de calificacion
//     del nivel asignado (simplificacion: se usa ese umbral en ambas fases
//     para decidir si un trimestre "cuenta", en vez de mezclar el umbral
//     mas bajo de mantenimiento).
//   - PREMIO (auto vs. efectivo): es una decision administrativa/de la
//     directora, no un dato de ventas. Sigue siendo un valor de ejemplo
//     (pseudo-aleatorio determinista) hasta que exista ese flujo real.
//   - Periodo de gracia / cuantos incumplimientos hacen perder el auto /
//     validacion administrativa del premio: NO se automatiza, solo se
//     muestra el estado (ver doc entregado por Padrino).
//
// Las FOTOS de los vehiculos SI son reales y administrables desde ahora
// (ver GET/PUT /config, guardadas en backend/data/llaveRosaConfig.json).
// ============================================================================

const ITBIS = 1.18;

type Nivel = 'A' | 'B';

const NIVELES: Record<Nivel, {
  vehiculo: string;
  calificacion: { mensual: number; trimestral: number; semestral: number };
  mantenimiento: { mensual: number; trimestral: number };
}> = {
  A: {
    vehiculo: 'Tiggo 4',
    calificacion:  { mensual: 950_000,   trimestral: 2_850_000, semestral: 5_700_000 },
    mantenimiento: { mensual: 900_000,   trimestral: 2_700_000 },
  },
  B: {
    vehiculo: 'Tiggo 7',
    calificacion:  { mensual: 1_350_000, trimestral: 4_050_000, semestral: 8_100_000 },
    mantenimiento: { mensual: 1_300_000, trimestral: 3_900_000 },
  },
};

const MONTH_NAMES      = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTH_NAMES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type MantenimientoStatus = 'al_dia' | 'en_riesgo' | 'incumplida' | 'no_aplica';
type Badge = 'en_progreso' | 'en_riesgo' | 'incumplida' | 'alcanzada' | 'manteniendo';

interface MetaBloque { meta: number; actual: number; pct: number; }

interface LlaveRosaStatus {
  sapUserId: string;
  name: string;
  unitName: string | null;
  nivel: Nivel;
  nivelSugerido: Nivel; // nivel inferido real del historial, sin importar si se esta previsualizando otro
  vehiculo: string;
  fase: 'calificacion' | 'mantenimiento';
  quarterLabel: string;
  semestreLabel: string;
  proximaEvaluacion: string;
  diasRestantesMes: number;
  metas: {
    mensual: MetaBloque;
    trimestral: MetaBloque;
    semestral: MetaBloque | null; // solo aplica en fase de calificacion
  };
  racha: number;
  premio: { tipo: 'auto' | 'efectivo' | null; label: string; definidoPorAdmin: boolean };
  mantenimiento: {
    status: MantenimientoStatus;
    proximaEvaluacion: string;
    montoFaltanteTrimestral: number;
  };
  historicoMensual: { mes: string; ventaNetaMes: number; ventaNetaAcumulada: number }[];
  badge: Badge;
}

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
  return ((h >>> 0) % 100000) / 100000;
}

function getQuarterInfo(date: Date) {
  const month = date.getMonth();
  const q = Math.floor(month / 3) + 1;
  const year = date.getFullYear();
  const startMonth = (q - 1) * 3;
  const label = `Q${q} ${year} (${MONTH_NAMES[startMonth]} - ${MONTH_NAMES[startMonth + 2]})`;
  const nextQuarterStartMonth = (startMonth + 3) % 12;
  const nextQuarterYear = startMonth + 3 >= 12 ? year + 1 : year;
  const proximaEvaluacion = `${MONTH_NAMES_FULL[nextQuarterStartMonth]} ${nextQuarterYear}`;
  return { q, year, startMonth, label, proximaEvaluacion };
}

function getSemesterInfo(date: Date) {
  const month = date.getMonth();
  const year = date.getFullYear();
  const isFirstHalf = month < 6;
  const label = isFirstHalf ? `Ene - Jun ${year}` : `Jul - Dic ${year}`;
  return { label, startMonth: isFirstHalf ? 0 : 6 };
}

function daysRemainingInMonth(date: Date): number {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - date.getDate(), 0);
}

function monthKey(y: number, mZeroBased: number): string {
  return `${y}-${String(mZeroBased + 1).padStart(2, '0')}`;
}

// Claves de mes (YYYY-MM) de un trimestre, relativo a "now". offset 0 = trimestre
// en curso, -1 = trimestre completo anterior, -2 = el anterior a ese, etc.
function quarterMonthKeys(now: Date, offset: number): string[] {
  const currentQStart = Math.floor(now.getMonth() / 3) * 3; // 0,3,6,9
  const baseIdx = now.getFullYear() * 12 + currentQStart + offset * 3;
  const keys: string[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = baseIdx + i;
    const y = Math.floor(idx / 12);
    const m = ((idx % 12) + 12) % 12;
    keys.push(monthKey(y, m));
  }
  return keys;
}

function sumMonths(monthBruta: Map<string, number>, keys: string[]): number {
  return keys.reduce((s, k) => s + (monthBruta.get(k) ?? 0), 0);
}

// ─── Nucleo de calculo (puro, sin acceso a BD) ─────────────────────────────
// monthBruta: mapa "YYYY-MM" -> produccion BRUTA de la unidad ese mes
// (Sale.amount - notas de credito del periodo, ya sin dividir entre ITBIS).
// oldestMonthKey: el mes mas antiguo realmente cubierto por la consulta
// (para no contar como "incumplidos" trimestres fuera del rango consultado).
function computeLlaveRosaStatus(
  sapUserId: string,
  name: string,
  unitName: string | null,
  monthBruta: Map<string, number>,
  oldestMonthKey: string,
  now: Date,
  premioOverride?: 'auto' | 'efectivo',
  nivelOverride?: Nivel,
): LlaveRosaStatus {
  const { label: quarterLabel, proximaEvaluacion } = getQuarterInfo(now);
  const { label: semestreLabel, startMonth: semestreStartMonth } = getSemesterInfo(now);

  const quarterNeta = (offset: number) => sumMonths(monthBruta, quarterMonthKeys(now, offset)) / ITBIS;
  const quarterFullyInRange = (offset: number) => quarterMonthKeys(now, offset)[0] >= oldestMonthKey;

  // 1) Nivel sugerido: segun el ultimo trimestre COMPLETO real (offset -1).
  //    Si no hay trimestre completo dentro del rango consultado, usa el
  //    trimestre en curso (offset 0) como mejor estimado disponible.
  const nivelBase = quarterFullyInRange(-1) ? quarterNeta(-1) : quarterNeta(0);
  const nivelSugerido: Nivel = nivelBase >= NIVELES.B.calificacion.trimestral ? 'B' : 'A';
  // nivelOverride permite "previsualizar" la vista completa como si estuviera
  // apuntando al otro nivel (ej: una directora en Nivel A viendo que le
  // faltaria para el Nivel B). Todo el resto del calculo (metas, fase, racha)
  // usa el nivel elegido, no necesariamente el sugerido/real.
  const nivel: Nivel = nivelOverride ?? nivelSugerido;
  const cfg = NIVELES[nivel];

  // 2) Racha real: trimestres completos consecutivos (empezando en el ultimo
  //    completo, offset -1, hacia atras) que alcanzaron el umbral de
  //    calificacion del nivel asignado.
  let racha = 0;
  for (let offset = -1; offset >= -8; offset--) {
    if (!quarterFullyInRange(offset)) break;
    if (quarterNeta(offset) >= cfg.calificacion.trimestral) racha++;
    else break;
  }

  // 3) Fase: si los ultimos 2 trimestres completos ya cumplieron el umbral
  //    de calificacion, se considera que ya paso el periodo de calificacion
  //    (~6 meses) y esta en mantenimiento.
  const fase: LlaveRosaStatus['fase'] = racha >= 2 ? 'mantenimiento' : 'calificacion';

  const metaMensual    = fase === 'mantenimiento' ? cfg.mantenimiento.mensual    : cfg.calificacion.mensual;
  const metaTrimestral = fase === 'mantenimiento' ? cfg.mantenimiento.trimestral : cfg.calificacion.trimestral;
  const metaSemestral  = cfg.calificacion.semestral;

  // 4) Produccion real del mes/trimestre/semestre en curso.
  const actualMensual    = (monthBruta.get(monthKey(now.getFullYear(), now.getMonth())) ?? 0) / ITBIS;
  const actualTrimestral = quarterNeta(0);
  const semestreKeys = Array.from({ length: now.getMonth() - semestreStartMonth + 1 }, (_, i) => monthKey(now.getFullYear(), semestreStartMonth + i));
  const actualSemestral = sumMonths(monthBruta, semestreKeys) / ITBIS;

  const pctMensual    = metaMensual    > 0 ? Math.round((actualMensual / metaMensual) * 100)       : 0;
  const pctTrimestral = metaTrimestral > 0 ? Math.round((actualTrimestral / metaTrimestral) * 100) : 0;
  const pctSemestral  = metaSemestral  > 0 ? Math.round((actualSemestral / metaSemestral) * 100)    : 0;

  let mantenimientoStatus: MantenimientoStatus = 'no_aplica';
  if (fase === 'mantenimiento') {
    const trimestralCumplida = actualTrimestral >= metaTrimestral;
    if (trimestralCumplida && pctMensual >= 100) mantenimientoStatus = 'al_dia';
    else if (trimestralCumplida || pctMensual >= 70) mantenimientoStatus = 'en_riesgo';
    else mantenimientoStatus = 'incumplida';
  }

  // Premio (auto vs. efectivo): decision administrativa, no es un dato de
  // ventas. Si el Super Admin ya la definio (premioOverride, guardado en
  // llaveRosaConfig.json), se usa esa. Si no, se muestra un valor de ejemplo
  // (pseudo-aleatorio determinista) claramente marcado como no definido aun.
  let premio: LlaveRosaStatus['premio'];
  if (fase === 'mantenimiento') {
    const definidoPorAdmin = premioOverride !== undefined;
    const tipo: 'auto' | 'efectivo' = premioOverride ?? (seededRandom(sapUserId + '-premio') > 0.5 ? 'auto' : 'efectivo');
    premio = {
      tipo,
      label: tipo === 'auto' ? `Derecho de llave (${cfg.vehiculo})` : 'Equivalente en efectivo',
      definidoPorAdmin,
    };
  } else {
    premio = { tipo: null, label: 'Aun en calificacion', definidoPorAdmin: false };
  }

  let badge: Badge;
  if (fase === 'calificacion') {
    if (pctTrimestral >= 100) badge = 'alcanzada';
    else if (pctMensual < 50) badge = 'en_riesgo';
    else badge = 'en_progreso';
  } else {
    if (mantenimientoStatus === 'al_dia') badge = 'manteniendo';
    else if (mantenimientoStatus === 'en_riesgo') badge = 'en_riesgo';
    else badge = 'incumplida';
  }

  // Historico mensual real (venta neta), acumulado desde Enero del anio actual.
  const mesesHastaAhora = now.getMonth() + 1;
  const historicoMensual: LlaveRosaStatus['historicoMensual'] = [];
  let acumulado = 0;
  for (let m = 1; m <= mesesHastaAhora; m++) {
    const valorMes = (monthBruta.get(monthKey(now.getFullYear(), m - 1)) ?? 0) / ITBIS;
    acumulado += valorMes;
    historicoMensual.push({ mes: `${MONTH_NAMES[m - 1]} ${now.getFullYear()}`, ventaNetaMes: Math.round(valorMes), ventaNetaAcumulada: Math.round(acumulado) });
  }

  return {
    sapUserId,
    name,
    unitName,
    nivel,
    nivelSugerido,
    vehiculo: cfg.vehiculo,
    fase,
    quarterLabel,
    semestreLabel,
    proximaEvaluacion,
    diasRestantesMes: daysRemainingInMonth(now),
    metas: {
      mensual:    { meta: metaMensual,    actual: Math.round(actualMensual),    pct: pctMensual },
      trimestral: { meta: metaTrimestral, actual: Math.round(actualTrimestral), pct: pctTrimestral },
      semestral:  fase === 'calificacion' ? { meta: metaSemestral, actual: Math.round(actualSemestral), pct: pctSemestral } : null,
    },
    racha,
    premio,
    mantenimiento: {
      status: mantenimientoStatus,
      proximaEvaluacion,
      montoFaltanteTrimestral: Math.max(Math.round(metaTrimestral - actualTrimestral), 0),
    },
    historicoMensual,
    badge,
  };
}

// ─── Acceso a datos: produccion real de ventas ─────────────────────────────
// Misma regla que backend/src/routes/superadmin.ts /overview: suma
// Sale.amount (ya filtrado a Seccion 1 por el sync) de la unidad, resta
// notas de credito del mismo periodo, sin dividir entre ITBIS todavia
// (eso lo hace computeLlaveRosaStatus al final, sobre las sumas mensuales).

const RANGE_MONTHS_BACK = 23; // ~2 anios (8 trimestres) de historial para calcular racha/fase

function rangeStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() - RANGE_MONTHS_BACK, 1);
}

async function getUnitSapIds(dir: { id: string; sapUserId: string }): Promise<string[]> {
  // id: { not: dir.id } -- salvaguarda: evita contar a la directora dos veces
  // si algun dato viejo de sync la dejo con supervisorId = su propio id (ver
  // fix en syncService.ts, paso 5 de asignacion de supervisoras).
  const miembros = await prisma.user.findMany({ where: { supervisorId: dir.id, id: { not: dir.id } }, select: { sapUserId: true } });
  return [dir.sapUserId, ...miembros.map(m => m.sapUserId)];
}

async function buildMonthBruta(sapIds: string[], now: Date): Promise<{ monthBruta: Map<string, number>; oldestMonthKey: string }> {
  const start = rangeStart(now);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [sales, creditNotes] = await Promise.all([
    prisma.sale.findMany({
      where: { userId: { in: sapIds }, saleDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
      select: { saleDate: true, amount: true },
    }),
    prisma.creditNote.findMany({
      where: { userId: { in: sapIds }, docDate: { gte: start, lt: end }, cancelled: false },
      select: { docDate: true, amount: true },
    }),
  ]);

  const salesByMonth = new Map<string, number>();
  for (const s of sales) {
    const k = monthKey(s.saleDate.getFullYear(), s.saleDate.getMonth());
    salesByMonth.set(k, (salesByMonth.get(k) ?? 0) + Number(s.amount));
  }
  const creditByMonth = new Map<string, number>();
  for (const c of creditNotes) {
    const k = monthKey(c.docDate.getFullYear(), c.docDate.getMonth());
    creditByMonth.set(k, (creditByMonth.get(k) ?? 0) + Number(c.amount));
  }

  const monthBruta = new Map<string, number>();
  const allKeys = new Set([...salesByMonth.keys(), ...creditByMonth.keys()]);
  for (const k of allKeys) {
    const bruta = Math.max(0, (salesByMonth.get(k) ?? 0) - (creditByMonth.get(k) ?? 0));
    monthBruta.set(k, bruta);
  }

  return { monthBruta, oldestMonthKey: monthKey(start.getFullYear(), start.getMonth()) };
}

// GET /api/llaverosa/me -- vista de la directora logueada
router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'directora') {
      res.status(403).json({ error: 'Llave Rosa es exclusivo para Directoras' });
      return;
    }
    const now = new Date();
    // .filter(...) -- misma salvaguarda contra self-supervision que en getUnitSapIds()
    const sapIds = [user.sapUserId, ...user.subordinates.filter(s => s.id !== user.id).map(s => s.sapUserId)];
    const { monthBruta, oldestMonthKey } = await buildMonthBruta(sapIds, now);
    const premioOverride = getLlaveRosaConfig().premioPreferencias[user.sapUserId];
    // ?nivel=A|B -- permite "previsualizar" el panel completo como si la meta
    // fuera el otro nivel (usado por el toggle "Premios por Nivel" del frontend).
    const nivelOverride = req.query.nivel === 'A' || req.query.nivel === 'B' ? req.query.nivel : undefined;
    const data = computeLlaveRosaStatus(user.sapUserId, user.name, user.unitName ?? null, monthBruta, oldestMonthKey, now, premioOverride, nivelOverride);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/llaverosa/ranking -- vista Super Admin: todas las directoras
router.get('/ranking', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      res.status(403).json({ error: 'Acceso restringido a Super Admin' });
      return;
    }

    const now = new Date();
    const directoras = await prisma.user.findMany({
      where: { role: 'directora' },
      select: { id: true, sapUserId: true, name: true, unitName: true },
      orderBy: { name: 'asc' },
    });

    // Trae ventas/notas de credito de TODAS las unidades en 2 consultas, en
    // vez de una consulta por directora (evita N+1 sobre el rango de 2 anios).
    const unitSapIdsByDirectora = await Promise.all(directoras.map(async d => ({ dir: d, sapIds: await getUnitSapIds(d) })));
    const allSapIds = Array.from(new Set(unitSapIdsByDirectora.flatMap(u => u.sapIds)));

    const start = rangeStart(now);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [sales, creditNotes] = await Promise.all([
      prisma.sale.findMany({
        where: { userId: { in: allSapIds }, saleDate: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: { userId: true, saleDate: true, amount: true },
      }),
      prisma.creditNote.findMany({
        where: { userId: { in: allSapIds }, docDate: { gte: start, lt: end }, cancelled: false },
        select: { userId: true, docDate: true, amount: true },
      }),
    ]);

    // sapUserId -> "YYYY-MM" -> monto (sin combinar todavia sales/credito)
    const salesByUserMonth = new Map<string, Map<string, number>>();
    for (const s of sales) {
      const k = monthKey(s.saleDate.getFullYear(), s.saleDate.getMonth());
      if (!salesByUserMonth.has(s.userId)) salesByUserMonth.set(s.userId, new Map());
      const inner = salesByUserMonth.get(s.userId)!;
      inner.set(k, (inner.get(k) ?? 0) + Number(s.amount));
    }
    const creditByUserMonth = new Map<string, Map<string, number>>();
    for (const c of creditNotes) {
      const k = monthKey(c.docDate.getFullYear(), c.docDate.getMonth());
      if (!creditByUserMonth.has(c.userId)) creditByUserMonth.set(c.userId, new Map());
      const inner = creditByUserMonth.get(c.userId)!;
      inner.set(k, (inner.get(k) ?? 0) + Number(c.amount));
    }

    const oldestMonthKey = monthKey(start.getFullYear(), start.getMonth());
    const premioPreferencias = getLlaveRosaConfig().premioPreferencias;

    const data = unitSapIdsByDirectora.map(({ dir, sapIds }) => {
      // Combina sales/credito de todos los sapIds de la unidad, mes por mes.
      const monthBruta = new Map<string, number>();
      const allMonthKeys = new Set<string>();
      for (const id of sapIds) {
        for (const k of salesByUserMonth.get(id)?.keys() ?? []) allMonthKeys.add(k);
        for (const k of creditByUserMonth.get(id)?.keys() ?? []) allMonthKeys.add(k);
      }
      for (const k of allMonthKeys) {
        let salesSum = 0, creditSum = 0;
        for (const id of sapIds) {
          salesSum  += salesByUserMonth.get(id)?.get(k) ?? 0;
          creditSum += creditByUserMonth.get(id)?.get(k) ?? 0;
        }
        monthBruta.set(k, Math.max(0, salesSum - creditSum));
      }
      return computeLlaveRosaStatus(dir.sapUserId, dir.name, dir.unitName, monthBruta, oldestMonthKey, now, premioPreferencias[dir.sapUserId]);
    });

    data.sort((a, b) => b.metas.trimestral.pct - a.metas.trimestral.pct);

    res.json({
      quarterLabel: getQuarterInfo(now).label,
      totalDirectoras: data.length,
      nivelA: data.filter(d => d.nivel === 'A').length,
      nivelB: data.filter(d => d.nivel === 'B').length,
      enCalificacion: data.filter(d => d.fase === 'calificacion').length,
      enMantenimiento: data.filter(d => d.fase === 'mantenimiento').length,
      alcanzadas: data.filter(d => d.badge === 'alcanzada' || d.badge === 'manteniendo').length,
      enRiesgo: data.filter(d => d.badge === 'en_riesgo' || d.badge === 'incumplida').length,
      directoras: data,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/llaverosa/config -- fotos reales de los vehiculos (cualquier usuario autenticado puede leerlas)
router.get('/config', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  try {
    res.json(getLlaveRosaConfig());
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// PUT /api/llaverosa/config -- solo Super Admin puede actualizar las fotos/nombres de los vehiculos
router.put('/config', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      res.status(403).json({ error: 'Acceso restringido a Super Admin' });
      return;
    }
    const { carImageA, carImageB, vehicleNameA, vehicleNameB } = req.body ?? {};
    const updated = saveLlaveRosaConfig({
      ...(carImageA !== undefined ? { carImageA } : {}),
      ...(carImageB !== undefined ? { carImageB } : {}),
      ...(vehicleNameA !== undefined ? { vehicleNameA } : {}),
      ...(vehicleNameB !== undefined ? { vehicleNameB } : {}),
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// PUT /api/llaverosa/premio/:sapUserId -- solo Super Admin define si el premio
// de esa directora es el auto o el equivalente en efectivo. La directora ve
// esta preferencia en su propia vista pero no la puede cambiar ella misma.
router.put('/premio/:sapUserId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.isSuperAdmin) {
      res.status(403).json({ error: 'Acceso restringido a Super Admin' });
      return;
    }
    const sapUserId = String(req.params.sapUserId);
    const { tipo } = req.body as { tipo: 'auto' | 'efectivo' | null };
    if (tipo !== 'auto' && tipo !== 'efectivo' && tipo !== null) {
      res.status(400).json({ error: 'tipo debe ser "auto", "efectivo" o null' });
      return;
    }
    const current = getLlaveRosaConfig();
    const premioPreferencias = { ...current.premioPreferencias };
    if (tipo === null) delete premioPreferencias[sapUserId];
    else premioPreferencias[sapUserId] = tipo;
    const updated = saveLlaveRosaConfig({ premioPreferencias });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
