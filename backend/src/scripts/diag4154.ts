import dotenv from 'dotenv';
dotenv.config();
import { sapGet } from '../utils/sapClient';
import { fetchSection1ItemCodes } from '../services/sapService';

async function main() {
  console.log('=== 1) Section1 codes ===');
  const codes = await fetchSection1ItemCodes();
  console.log('Total Section1 codes:', codes.size);
  console.log('Tiene 10217391?', codes.has('10217391'));

  console.log('=== 2) Orden 4154 directa ===');
  const data: any = await sapGet('/Orders', {
    $filter: 'DocEntry eq 4154',
    $select: 'DocEntry,DocNum,CardCode,DocDate,DocTotal,DocumentStatus,Cancelled,DocumentLines',
  });
  console.log(JSON.stringify(data, null, 2));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
