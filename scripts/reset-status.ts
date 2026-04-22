import { updateCell } from '../lib/google-sheets.js';
import { SHEET_COLUMNS } from '../lib/config.js';

const rowIndex = parseInt(process.argv[2]);
if (!rowIndex) {
  console.log('사용법: npx tsx scripts/reset-status.ts [행번호]');
  process.exit(1);
}

await updateCell(rowIndex, SHEET_COLUMNS.STATUS, 'planned');
await updateCell(rowIndex, SHEET_COLUMNS.DOC_URL, '');
await updateCell(rowIndex, SHEET_COLUMNS.GENERATED_AT, '');
console.log(`행 ${rowIndex} → planned 으로 초기화 완료`);
