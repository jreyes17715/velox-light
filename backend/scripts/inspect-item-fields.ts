// Script de inspección: busca el campo real de "Seccion" en SAP.
// El contacto de SAP confirmó que el reporte oficial de comisiones filtra
// por articulos que pertenecen a "Seccion 1" (no por DiscountPercent).
// Este script imprime el JSON completo de una orden y de varios articulos
// (con y sin descuento) para encontrar el campo exacto.
//
// Uso:
//   cd backend
//   npx ts-node scripts/inspect-item-fields.ts

import dotenv from 'dotenv';
dotenv.config();

import { sapGet } from '../src/utils/sapClient';

async function main() {
  console.log('=== 1. Orden completa (DocNum=1714), sin restringir campos ===\n');
  const orderData = await sapGet<{ value: any[] }>('/Orders', {
    $filter: 'DocNum eq 1714',
    $top: '1',
  });
  const order = orderData.value?.[0];
  if (order) {
    console.log('Campos del documento (nivel orden):');
    console.log(Object.keys(order).filter(k => k !== 'DocumentLines').join(', '));
    console.log('\nPrimera linea completa (todos los campos):');
    console.log(JSON.stringify(order.DocumentLines?.[0], null, 2));
  } else {
    console.log('No se encontró la orden 1714');
  }

  console.log('\n\n=== 2. Ficha de artículos (Items) — con descuento vs sin descuento ===\n');
  // Uno con descuento (producto real) y uno sin descuento (kit/bolsa) del CSV anterior
  const itemCodes = ['10217385', '90000001', 'EVE001', '10072825'];

  for (const code of itemCodes) {
    try {
      const item = await sapGet<any>(`/Items('${code}')`);
      console.log(`--- Item ${code} ---`);
      console.log(`ItemName: ${item.ItemName}`);
      console.log(`ItemsGroupCode: ${item.ItemsGroupCode}`);
      // Imprime cualquier campo que empiece con U_ (campos personalizados/UDF)
      const udfFields = Object.keys(item).filter(k => k.startsWith('U_'));
      console.log(`Campos U_ (personalizados): ${udfFields.length ? udfFields.join(', ') : '(ninguno)'}`);
      for (const f of udfFields) {
        console.log(`   ${f} = ${item[f]}`);
      }
      // Campos que contengan "secc", "group", "categ" en el nombre (por si acaso)
      const suspects = Object.keys(item).filter(k =>
        /secc|group|categ|section|clase|tipo/i.test(k)
      );
      console.log(`Campos sospechosos (secc/group/categ/section/clase/tipo): ${suspects.join(', ')}`);
      for (const f of suspects) {
        console.log(`   ${f} = ${JSON.stringify(item[f])}`);
      }
      console.log('');
    } catch (err: any) {
      console.log(`--- Item ${code}: ERROR ${err.message} ---\n`);
    }
  }

  console.log('\n=== 3. Grupos de artículos (ItemGroups) — para ver nombres/codigos ===\n');
  try {
    const groups = await sapGet<{ value: any[] }>('/ItemGroups', { $top: '50' });
    for (const g of groups.value ?? []) {
      console.log(`  Number=${g.Number}  GroupName=${g.GroupName}`);
    }
  } catch (err: any) {
    console.log(`ERROR trayendo ItemGroups: ${err.message}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err.message ?? err);
  process.exit(1);
});
