import { updateCell, fetchAllRows } from '../lib/google-sheets.js';
import { SHEET_COLUMNS } from '../lib/config.js';

const rows = await fetchAllRows();

let fixed = 0;
for (const row of rows) {
  // "skip" 텍스트 비우기
  if (row.naverUrl === 'skip') {
    await updateCell(row.rowIndex, SHEET_COLUMNS.NAVER_URL, '');
    console.log(`행 ${row.rowIndex} naver_url "skip" 제거`);
    fixed++;
  }
  if (row.imwebUrl === 'skip') {
    await updateCell(row.rowIndex, SHEET_COLUMNS.IMWEB_URL, '');
    console.log(`행 ${row.rowIndex} imweb_url "skip" 제거`);
    fixed++;
  }
  // 아임웹 admin URL을 일반 URL로 변환은 정보 부족으로 어려움, 그대로 둠
}

console.log(`\n✅ ${fixed}건 정리 완료`);
