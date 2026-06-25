import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// ─── Constantes ──────────────────────────────────────────────────────────────

const ITBIS = 1.18; // IVA dominicano 18%

// Tipo A — Comisión por Producción de Unidad
// Base: Compra Neta (Bruta / 1.18) de toda la unidad en el mes
const UNIT_TIERS = [
  { min: 550_000, rate: 0.14 },
  { min: 450_000, rate: 0.08 },
  { min: 1,       rate: 0.06 },
];

// Tipo B — Comisión por Unidades Descendientes
// Base: Compra Neta de cada unidad descendiente DIRECTA
const DESCENDANT_TIERS = [
  { min: 5, rate: 0.045 },
  { min: 2, rate: 0.04  },
  { min: 1, rate: 0.03  },
];

// Tipo C — Comisión por Asociadas Personales (Iniciadora)
// Base: Compra Neta de reclutas con al menos 1 compra en el período (proxy de "activa")
const INICIADORA_TIERS = [
  { min: 8,  rate: 0.08 },
  { min: 5,  rate: 0.06 },
  { min: 3,  rate: 0.04 },
  { min: 1,  rate: 0.02 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(d: Decimal | number): number {
  return typeof d === 'number' ? d : Number(d.toString());
}

function getRate(tiers: { min: number; rate: number }[], value: number): number {
  for (const tier of tiers) {
    if (value >= tier.min) return tier.rate;
  }
  return 0;
}

/** Rango de fechas para un mes dado */
function monthRange(month: number, year: number): { gte: Date; lt: Date } {
  const gte = new Date(year, month - 1, 1);
  const lt  = new Date(year, month, 1);
  return { gte, lt };
}

/** Suma de ventas (brutas) de un usuario en el período, excluyendo canceladas */
async function getUserGrossSales(sapUserId: string, month: number, year: number): Promise<number> {
  const range = monthRange(month, year);
  const result = await prisma.sale.aggregate({
    where: {
      userId: sapUserId,
      saleDate: range,
      status: { not: 'cancelled' },
    },
    _sum: { amount: true },
  });
  return toNumber(result._sum.amount ?? 0);
}

// ─── Tipo A: Producción de Unidad ────────────────────────────────────────────

export interface TipoAResult {
  compraBruta: number;
  compraNeta: number;
  rate: number;
  comision: number;
  consultoras: { name: string; sapUserId: string; ventas: number }[];
}

export async function calcTipoA(
  userId: string,
  month: number,
  year: number,
): Promise<TipoAResult> {
  // Obtener todas las consultoras de la unidad (subordinadas directas)
  const subordinates = await prisma.user.findMany({
    where: { supervisorId: userId },
    select: { id: true, sapUserId: true, name: true },
  });

  // Incluir a la propia directora si también compra
  const directora = await prisma.user.findUnique({
    where: { id: userId },
    select: { sapUserId: true, name: true },
  });

  const members = directora
    ? [{ id: userId, sapUserId: directora.sapUserId, name: directora.name }, ...subordinates]
    : subordinates;

  const range = monthRange(month, year);

  // Ventas brutas por miembro
  const detalle: { name: string; sapUserId: string; ventas: number }[] = [];
  let totalBruto = 0;

  for (const m of members) {
    const result = await prisma.sale.aggregate({
      where: { userId: m.sapUserId, saleDate: range, status: { not: 'cancelled' } },
      _sum: { amount: true },
    });
    const ventas = toNumber(result._sum.amount ?? 0);
    if (ventas > 0) detalle.push({ name: m.name, sapUserId: m.sapUserId, ventas });
    totalBruto += ventas;
  }

  const compraNeta = totalBruto / ITBIS;
  const rate = getRate(UNIT_TIERS, totalBruto); // tier se determina por Bruta, comisión se paga sobre Neta
  const comision = compraNeta * rate;

  return { compraBruta: totalBruto, compraNeta, rate, comision, consultoras: detalle };
}

// ─── Tipo B: Unidades Descendientes ──────────────────────────────────────────

export interface TipoBUnit {
  unitName: string;
  directoraName: string;
  directoraSapUserId: string;
  compraBruta: number;
  compraNeta: number;
  comision: number;
}

export interface TipoBResult {
  rate: number;
  totalComision: number;
  descendantCount: number;
  unidades: TipoBUnit[];
}

export async function calcTipoB(
  userId: string,
  month: number,
  year: number,
): Promise<TipoBResult> {
  // Directoras descendientes directas (supervisorId = este userId Y son directoras)
  const descendantDirectoras = await prisma.user.findMany({
    where: { supervisorId: userId, role: 'directora' },
    select: { id: true, sapUserId: true, name: true, unitName: true },
  });

  if (descendantDirectoras.length === 0) {
    return { rate: 0, totalComision: 0, descendantCount: 0, unidades: [] };
  }

  const rate = getRate(DESCENDANT_TIERS, descendantDirectoras.length);
  const range = monthRange(month, year);
  const unidades: TipoBUnit[] = [];
  let totalComision = 0;

  for (const dir of descendantDirectoras) {
    // Ventas de TODA su unidad (la directora + sus subordinadas)
    const subIds = await prisma.user.findMany({
      where: { supervisorId: dir.id },
      select: { sapUserId: true },
    });
    const allSapIds = [dir.sapUserId, ...subIds.map(s => s.sapUserId)];

    const result = await prisma.sale.aggregate({
      where: { userId: { in: allSapIds }, saleDate: range, status: { not: 'cancelled' } },
      _sum: { amount: true },
    });

    const compraBruta = toNumber(result._sum.amount ?? 0);
    const compraNeta = compraBruta / ITBIS;
    const comision = compraNeta * rate;
    totalComision += comision;

    unidades.push({
      unitName: dir.unitName ?? dir.name,
      directoraName: dir.name,
      directoraSapUserId: dir.sapUserId,
      compraBruta,
      compraNeta,
      comision,
    });
  }

  return { rate, totalComision, descendantCount: descendantDirectoras.length, unidades };
}

// ─── Tipo C: Asociadas Personales (Iniciadora) ───────────────────────────────

export interface TipoCRecluta {
  name: string;
  sapUserId: string;
  compraBruta: number;
  compraNeta: number;
  activa: boolean; // tiene al menos 1 compra en el período
}

export interface TipoCResult {
  rate: number;
  totalComision: number;
  totalReclutas: number;
  reclutasActivas: number;
  reclutas: TipoCRecluta[];
}

export async function calcTipoC(
  userId: string,
  month: number,
  year: number,
): Promise<TipoCResult> {
  // Reclutas personales directas (inciadoraId = este userId)
  const reclutas = await prisma.user.findMany({
    where: { inciadoraId: userId },
    select: { sapUserId: true, name: true },
  });

  if (reclutas.length === 0) {
    return { rate: 0, totalComision: 0, totalReclutas: 0, reclutasActivas: 0, reclutas: [] };
  }

  const range = monthRange(month, year);
  const detalle: TipoCRecluta[] = [];
  let reclutasActivas = 0;

  for (const r of reclutas) {
    const result = await prisma.sale.aggregate({
      where: { userId: r.sapUserId, saleDate: range, status: { not: 'cancelled' } },
      _sum: { amount: true },
    });
    const compraBruta = toNumber(result._sum.amount ?? 0);
    const activa = compraBruta > 0;
    if (activa) reclutasActivas++;
    detalle.push({
      name: r.name,
      sapUserId: r.sapUserId,
      compraBruta,
      compraNeta: compraBruta / ITBIS,
      activa,
    });
  }

  // Tasa basada en reclutas activas (proxy: compraron en el mes)
  const rate = getRate(INICIADORA_TIERS, reclutasActivas);

  // Comisión sobre Compra Neta TOTAL de todas las reclutas (activas e inactivas)
  const totalNeta = detalle.reduce((sum, r) => sum + r.compraNeta, 0);
  const totalComision = totalNeta * rate;

  return {
    rate,
    totalComision,
    totalReclutas: reclutas.length,
    reclutasActivas,
    reclutas: detalle,
  };
}

// ─── Resultado completo ───────────────────────────────────────────────────────

export interface CommissionResult {
  userId: string;
  month: number;
  year: number;
  tipoA: TipoAResult;
  tipoB: TipoBResult;
  tipoC: TipoCResult;
  totalComision: number;
}

export async function calcCommissions(
  userId: string,
  month: number,
  year: number,
): Promise<CommissionResult> {
  logger.info(`COMMISSIONS: calculando para userId=${userId} mes=${month}/${year}`);

  const [tipoA, tipoB, tipoC] = await Promise.all([
    calcTipoA(userId, month, year),
    calcTipoB(userId, month, year),
    calcTipoC(userId, month, year),
  ]);

  const totalComision = tipoA.comision + tipoB.totalComision + tipoC.totalComision;

  return { userId, month, year, tipoA, tipoB, tipoC, totalComision };
}
