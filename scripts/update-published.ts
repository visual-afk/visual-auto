import { updateCell } from '../lib/google-sheets.js';
import { SHEET_COLUMNS } from '../lib/config.js';

const rowIndex = parseInt(process.argv[2]);
const naverUrl = process.argv[3];

if (!rowIndex || !naverUrl) {
  console.log('사용법: npx tsx scripts/update-published.ts [행번호] [네이버URL]');
  process.exit(1);
}

await updateCell(rowIndex, SHEET_COLUMNS.NAVER_URL, naverUrl);
await updateCell(rowIndex, SHEET_COLUMNS.STATUS, 'published');
console.log(`행 ${rowIndex} 업데이트 완료: published + URL 기록`);
