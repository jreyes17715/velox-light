// Compara TODAS las lineas de UNA orden (con y sin descuento) para encontrar
// el campo real que distingue "Seccion 1" (producto puro) de accesorios/kits.
//
// Uso:
//   cd backend
//   npx ts-node scripts/compare-lines.ts 1714

import dotenv from 'dotenv';
dotenv.config();

import { sapGet } from '../src/utils/sapClient';

async function main() {
  const [, , docNum] = process.argv;
  if (!docNum) {
    console.error('Uso: npx ts-node scripts/compare-lines.ts <DocNum>');
    process.exit(1);
  }

  const data = await sapGet<{ value: any[] }>('/Orders', {
    $filter: `DocNum eq ${docNum}`,
    $top: '1',
  });
  const order = data.value?.[0];
  if (!order) {
    console.error(`No se encontró la orden ${docNum}`);
    process.exit(1);
  }

  const lines = order.DocumentLines ?? [];
  console.log(`Orden ${docNum} — ${lines.length} líneas\n`);

  // Campos clave a comparar entre lineas con y sin descuento
  const camposClave = [
    'LineNum', 'ItemCode', 'ItemDescription', 'DiscountPercent', 'LineTotal',
    'AccountCode', 'COGSAccountCode', 'TaxCode', 'TaxType', 'TaxLiable',
    'VatGroup', 'CommisionPercent', 'ItemType', 'LineType',
  ];

  for (const l of lines) {
    console.log(`--- Linea ${l.LineNum}: ${l.ItemCode} (${l.ItemDescription}) ---`);
    for (const campo of camposClave) {
      console.log(`   ${campo} = ${JSON.stringify(l[campo])}`);
    }
    console.log('');
  }

  // Resumen: agrupa por AccountCode
  console.log('=== Resumen por AccountCode ===');
  const porCuenta = new Map<string, { conDescuento: number; sinDescuento: number }>();
  for (const l of lines) {
    const key = String(l.AccountCode);
    const entry = porCuenta.get(key) ?? { conDescuento: 0, sinDescuento: 0 };
    if ((l.DiscountPercent ?? 0) > 0) entry.conDescuento++;
    else entry.sinDescuento++;
    porCuenta.set(key, entry);
  }
  for (const [cuenta, info] of porCuenta.entries()) {
    console.log(`  AccountCode=${cuenta}  -> lineas CON descuento: ${info.conDescuento}, SIN descuento: ${info.sinDescuento}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err.message ?? err);
  process.exit(1);
});
