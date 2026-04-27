import { updateCell } from '../lib/google-sheets.js';
import { SHEET_COLUMNS } from '../lib/config.js';

const rowIndex = parseInt(process.argv[2]);
const url = process.argv[3];

if (!rowIndex) {
  console.log('사용법:');
  console.log('  npx tsx scripts/update-published.ts [행번호]              # status만 published로');
  console.log('  npx tsx scripts/update-published.ts [행번호] [네이버URL]  # status + naver_url');
  process.exit(1);
}

await updateCell(rowIndex, SHEET_COLUMNS.STATUS, 'published');
if (url) {
  await updateCell(rowIndex, SHEET_COLUMNS.NAVER_URL, url);
  console.log(`행 ${rowIndex} 업데이트 완료: published + URL 기록`);
} else {
  console.log(`행 ${rowIndex} 업데이트 완료: published (URL 변경 없음)`);
}
