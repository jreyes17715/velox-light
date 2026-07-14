// Script de diagnóstico: compara Compra Bruta/Neta calculada por nuestro sistema
// contra el reporte real de SAP, para UNA unidad específica.
//
// No toca la base de datos local — consulta SAP directamente, igual que el sync,
// para poder ver el detalle línea por línea de cada orden.
//
// Ademas exporta un CSV con el detalle completo de cada linea de cada orden
// (scripts/debug-lines.csv) para poder inspeccionar exactamente que se esta
// contando y que no.
//
// Uso:
//   cd backend
//   npx ts-node scripts/debug-unit.ts B00838 2026-06-01 2026-06-30

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { sapGet } from '../src/utils/sapClient';

const ITBIS = 1.18;

interface SapOrderLine {
  LineNum?: number;
  ItemCode?: string;
  ItemDescription?: string;
  Quantity?: number;
  Price?: number;
  LineTotal: number;
  DiscountPercent: number;
}
interface SapOrder {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  DocDate: string;
  DocTotal: number;
  DocumentStatus: string;
  Cancelled: string;
  DocumentLines?: SapOrderLine[];
}
interface SapBP {
  CardCode: string;
  CardName: string;
  GroupCode?: number;
}
interface SapGroup {
  Code: number;
  Name: string;
  U_CardCode?: string;
}
interface SapCreditNote {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  DocDate: string;
  DocTotal: number;
  Cancelled: string;
}

function csvEscape(v: any): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function main() {
  const [, , directorCardCode, startDate, endDate] = process.argv;
  if (!directorCardCode || !startDate || !endDate) {
    console.error('Uso: npx ts-node scripts/debug-unit.ts <CardCode directora> <YYYY-MM-DD desde> <YYYY-MM-DD hasta>');
    process.exit(1);
  }

  console.log(`\n=== Buscando unidad de ${directorCardCode} ===`);

  // 1. Encontrar el grupo (unidad) de esta directora
  const groupsData = await sapGet<{ value: SapGroup[] }>('/BusinessPartnerGroups', {
    $select: 'Code,Name,U_CardCode',
    $filter: "Type eq 'bbpgt_CustomerGroup'",
    $top: '500',
  });
  const group = groupsData.value.find(g => g.U_CardCode === directorCardCode);
  if (!group) {
    console.error(`No se encontró grupo con U_CardCode = ${directorCardCode}`);
    process.exit(1);
  }
  console.log(`Unidad: "${group.Name}" (GroupCode=${group.Code})`);

  // 2. Traer todos los miembros de ese grupo
  const bpData = await sapGet<{ value: SapBP[] }>('/BusinessPartners', {
    $select: 'CardCode,CardName,GroupCode',
    $filter: `CardType eq 'cCustomer' and GroupCode eq ${group.Code}`,
    $top: '500',
  });
  const memberCodes = new Set(bpData.value.map(b => b.CardCode));
  memberCodes.add(directorCardCode);
  console.log(`Miembros del grupo: ${memberCodes.size}`);

  // 3. Traer todas las órdenes del rango de fechas y filtrar por miembros del grupo
  console.log(`\nTrayendo órdenes de SAP entre ${startDate} y ${endDate}...`);
  const allOrders: SapOrder[] = [];
  let skip = 0;
  const PAGE = 50;
  while (true) {
    const data = await sapGet<{ value: SapOrder[] }>('/Orders', {
      $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,DocumentStatus,Cancelled,DocumentLines',
      $filter: `DocDate ge '${startDate}' and DocDate le '${endDate}'`,
      $orderby: 'DocDate asc',
      $top: String(PAGE),
      $skip: String(skip),
    });
    const items = data.value || [];
    allOrders.push(...items);
    if (items.length < PAGE) break;
    skip += PAGE;
  }
  console.log(`Total órdenes en el rango (todas las unidades): ${allOrders.length}`);

  const unitOrders = allOrders.filter(o => memberCodes.has(o.CardCode) && o.Cancelled !== 'Y');
  console.log(`Órdenes de esta unidad (no canceladas): ${unitOrders.length}\n`);

  // 4. Analizar línea por línea + exportar CSV completo
  let sumDocTotal = 0;
  let sumProportional = 0;
  let sumDirect = 0;
  let ordersWithNoLines = 0;
  let ordersWithLines = 0;

  const csvRows: string[] = [
    'DocNum,CardCode,DocDate,DocTotal,LineNum,ItemCode,ItemDescription,Quantity,Price,LineTotal,DiscountPercent',
  ];

  // Para detectar cargos a nivel de documento (flete, redondeo) que no estan en las lineas
  let orderesConDiferenciaHeader = 0;
  let sumDiferenciaHeader = 0;

  // Para agrupar lineas SIN descuento por producto (ver que son)
  const zeroDiscountByItem = new Map<string, { desc: string; count: number; total: number }>();

  for (const order of unitOrders) {
    sumDocTotal += order.DocTotal;

    const lines = order.DocumentLines ?? [];
    if (lines.length === 0) {
      ordersWithNoLines++;
      sumProportional += order.DocTotal;
      sumDirect += order.DocTotal;
      continue;
    }
    ordersWithLines++;

    for (const l of lines) {
      csvRows.push([
        order.DocNum, order.CardCode, order.DocDate, order.DocTotal,
        l.LineNum ?? '', l.ItemCode ?? '', csvEscape(l.ItemDescription ?? ''),
        l.Quantity ?? '', l.Price ?? '', l.LineTotal ?? 0, l.DiscountPercent ?? 0,
      ].join(','));

      if (!((l.DiscountPercent ?? 0) > 0)) {
        const key = l.ItemCode ?? '(sin codigo)';
        const entry = zeroDiscountByItem.get(key) ?? { desc: l.ItemDescription ?? '', count: 0, total: 0 };
        entry.count++;
        entry.total += l.LineTotal ?? 0;
        zeroDiscountByItem.set(key, entry);
      }
    }

    const discountedLines = lines.filter(l => (l.DiscountPercent ?? 0) > 0);
    const totalAllLines = lines.reduce((s, l) => s + (l.LineTotal ?? 0), 0);
    const totalDiscountedLines = discountedLines.reduce((s, l) => s + (l.LineTotal ?? 0), 0);

    // Chequeo: sum(todas las lineas) * ITBIS deberia ser ~= DocTotal.
    // Si no, hay un cargo a nivel de documento (flete, redondeo, gastos) fuera de las lineas.
    const expectedDocTotal = totalAllLines * ITBIS;
    const diff = order.DocTotal - expectedDocTotal;
    if (Math.abs(diff) > 1) {
      orderesConDiferenciaHeader++;
      sumDiferenciaHeader += diff;
    }

    sumDirect += discountedLines.length === 0 ? 0 : totalDiscountedLines * ITBIS;

    if (discountedLines.length === 0) {
      sumProportional += 0;
    } else if (totalAllLines <= 0) {
      sumProportional += 0;
    } else {
      const ratio = totalDiscountedLines / totalAllLines;
      sumProportional += order.DocTotal * ratio;
    }
  }

  const csvPath = path.join(__dirname, 'debug-lines.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf-8');
  console.log(`\nCSV exportado: ${csvPath} (${csvRows.length - 1} lineas)`);

  console.log(`\nÓrdenes CON DocumentLines pobladas: ${ordersWithLines}`);
  console.log(`Órdenes SIN DocumentLines (fallback a DocTotal completo): ${ordersWithNoLines}`);

  console.log(`\n=== Chequeo de cargos a nivel de documento (flete/redondeo fuera de las lineas) ===`);
  console.log(`Órdenes donde DocTotal != suma(lineas)*ITBIS (diferencia > RD$1): ${orderesConDiferenciaHeader}`);
  console.log(`Suma total de esas diferencias: RD$${sumDiferenciaHeader.toFixed(2)}`);

  console.log(`\n=== Líneas SIN descuento (DiscountPercent = 0), agrupadas por producto ===`);
  const sortedZero = Array.from(zeroDiscountByItem.entries()).sort((a, b) => b[1].total - a[1].total);
  for (const [itemCode, info] of sortedZero.slice(0, 20)) {
    console.log(`  ${itemCode} | ${info.desc} | ${info.count} lineas | total RD$${info.total.toFixed(2)}`);
  }
  const sumZeroDiscount = sortedZero.reduce((s, [, v]) => s + v.total, 0);
  console.log(`  TOTAL líneas sin descuento: RD$${sumZeroDiscount.toFixed(2)} (neto, sin ITBIS)`);

  // 5. Notas de crédito del mismo periodo/unidad
  const allCreditNotes: SapCreditNote[] = [];
  let cnSkip = 0;
  while (true) {
    const data = await sapGet<{ value: SapCreditNote[] }>('/CreditNotes', {
      $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,Cancelled',
      $filter: `DocDate ge '${startDate}' and DocDate le '${endDate}'`,
      $top: '50',
      $skip: String(cnSkip),
    });
    const items = data.value || [];
    allCreditNotes.push(...items);
    if (items.length < 50) break;
    cnSkip += 50;
  }
  const unitCreditNotes = allCreditNotes.filter(cn => memberCodes.has(cn.CardCode) && cn.Cancelled !== 'tYES' && cn.Cancelled !== 'Y');
  const sumCreditNotes = unitCreditNotes.reduce((s, cn) => s + cn.DocTotal, 0);
  console.log(`\nNotas de crédito de la unidad en el periodo: ${unitCreditNotes.length} por RD$${sumCreditNotes.toFixed(2)}`);

  console.log(`\n=== RESULTADOS (Compra Bruta) ===`);
  console.log(`Método viejo (DocTotal completo, sin filtro):       RD$${sumDocTotal.toFixed(2)}`);
  console.log(`Método PROPORTIONAL:                                RD$${sumProportional.toFixed(2)}`);
  console.log(`Método DIRECT (corregido, x ITBIS):                 RD$${sumDirect.toFixed(2)}`);
  console.log(`\n=== Comparar contra el reporte real de SAP ===`);
  console.log(`Reporte real (Compra Bruta):                        RD$805,607.50`);
  console.log(`Reporte real (Compra Neta):                         RD$682,718.22`);
  console.log(`\nNeta (proportional / ITBIS): RD$${(sumProportional / ITBIS).toFixed(2)}`);
  console.log(`Neta (direct / ITBIS):       RD$${(sumDirect / ITBIS).toFixed(2)}`);

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err.message ?? err);
  process.exit(1);
});
