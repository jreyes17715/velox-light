// Verifica la hipotesis real confirmada por el contacto de SAP:
// "Seccion 1" = tabla OITM, campo QryGroup1 = 'Y'.
// En el Service Layer, QryGroup1..QryGroup64 de OITM se exponen como
// Properties1..Properties64 en el JSON de /Items.
//
// Cruza cada ItemCode del CSV generado por debug-unit.ts contra su Properties1
// real en SAP, y recalcula la Bruta usando ese criterio en vez de DiscountPercent > 0.
//
// Trae los articulos en LOTES (no uno por uno) para minimizar los round-trips
// contra un servidor SAP con conexion inestable.
//
// Uso:
//   cd backend
//   npx ts-node scripts/verify-linea.ts

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { sapGet } from '../src/utils/sapClient';

const ITBIS = 1.18;
const BATCH_SIZE = 12;

interface CsvRow {
  DocNum: string;
  CardCode: string;
  DocDate: string;
  DocTotal: number;
  LineNum: string;
  ItemCode: string;
  ItemDescription: string;
  Quantity: string;
  Price: string;
  LineTotal: number;
  DiscountPercent: number;
}

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const header = lines[0].split(',');
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < header.length) continue;
    rows.push({
      DocNum: cols[0],
      CardCode: cols[1],
      DocDate: cols[2],
      DocTotal: parseFloat(cols[3]),
      LineNum: cols[4],
      ItemCode: cols[5],
      ItemDescription: cols[6],
      Quantity: cols[7],
      Price: cols[8],
      LineTotal: parseFloat(cols[cols.length - 2]),
      DiscountPercent: parseFloat(cols[cols.length - 1]),
    });
  }
  return rows;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const csvPath = path.join(__dirname, 'debug-lines.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`No existe ${csvPath}. Corre primero: npx ts-node scripts/debug-unit.ts B00838 2026-06-01 2026-06-30`);
    process.exit(1);
  }
  const rows = parseCsv(csvPath);
  console.log(`Lineas leidas del CSV: ${rows.length}`);

  const itemCodes = Array.from(new Set(rows.map(r => r.ItemCode))).filter(Boolean);
  console.log(`Articulos distintos: ${itemCodes.length}`);

  const propsMap = new Map<string, { p1: string; p2: string }>();
  const batches = chunk(itemCodes, BATCH_SIZE);
  console.log(`Trayendo en ${batches.length} lotes de hasta ${BATCH_SIZE} articulos...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const filter = batch.map(code => `ItemCode eq '${code}'`).join(' or ');
    console.log(`  Lote ${i + 1}/${batches.length} (${batch.length} articulos)...`);
    try {
      const data = await sapGet<{ value: any[] }>('/Items', {
        $filter: filter,
        $select: 'ItemCode,Properties1,Properties2',
        $top: '100',
      });
      for (const item of data.value ?? []) {
        propsMap.set(item.ItemCode, { p1: item.Properties1, p2: item.Properties2 });
      }
    } catch (err: any) {
      console.log(`    ERROR en lote ${i + 1}: ${err.message}`);
    }
  }

  console.log(`\nArticulos con datos obtenidos: ${propsMap.size} / ${itemCodes.length}`);
  const faltantes = itemCodes.filter(c => !propsMap.has(c));
  if (faltantes.length > 0) {
    console.log(`Articulos SIN datos (fallo el lote): ${faltantes.join(', ')}`);
  }

  console.log('\n=== Cruce: DiscountPercent vs Properties1 (QryGroup1 = Seccion 1) ===');
  let coinciden = 0;
  let noCoinciden = 0;
  const discrepancias: string[] = [];

  for (const r of rows) {
    const props = propsMap.get(r.ItemCode);
    if (!props) continue;
    const esSeccion1 = props.p1 === 'tYES';
    const tieneDescuento = r.DiscountPercent > 0;
    if (esSeccion1 === tieneDescuento) {
      coinciden++;
    } else {
      noCoinciden++;
      discrepancias.push(`DocNum=${r.DocNum} ItemCode=${r.ItemCode} "${r.ItemDescription}" DiscountPercent=${r.DiscountPercent} Properties1=${props.p1} Properties2=${props.p2} LineTotal=${r.LineTotal}`);
    }
  }

  console.log(`Coinciden (DiscountPercent>0 <=> Properties1=tYES): ${coinciden}`);
  console.log(`NO coinciden: ${noCoinciden}`);
  if (discrepancias.length > 0) {
    console.log('\nLineas donde DiscountPercent y Properties1 DISCREPAN:');
    for (const d of discrepancias) console.log('  ' + d);
  }

  const sumPorSeccion1 = rows
    .filter(r => propsMap.get(r.ItemCode)?.p1 === 'tYES')
    .reduce((s, r) => s + r.LineTotal, 0);

  const sumPorDiscount = rows
    .filter(r => r.DiscountPercent > 0)
    .reduce((s, r) => s + r.LineTotal, 0);

  console.log('\n=== Comparación de totales ===');
  console.log(`Suma LineTotal con criterio DiscountPercent>0:    RD$${sumPorDiscount.toFixed(2)} (bruta x ITBIS = RD$${(sumPorDiscount * ITBIS).toFixed(2)})`);
  console.log(`Suma LineTotal con criterio Properties1=Seccion1: RD$${sumPorSeccion1.toFixed(2)} (bruta x ITBIS = RD$${(sumPorSeccion1 * ITBIS).toFixed(2)})`);
  console.log(`\nReporte real (Compra Bruta):                     RD$805,607.50`);
  console.log(`Reporte real (Compra Neta):                       RD$682,718.22`);

  console.log('\n=== Mapa completo ItemCode -> Properties1 / Properties2 ===');
  for (const [code, props] of propsMap.entries()) {
    console.log(`  ${code} -> Properties1=${props.p1}  Properties2=${props.p2}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err.message ?? err);
  process.exit(1);
});
