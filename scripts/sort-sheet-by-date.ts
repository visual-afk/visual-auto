import { getSheets } from '../lib/google-auth.js';
import { config, SHEET_COLUMNS, SHEET_RANGE } from '../lib/config.js';

const sheets = getSheets();

// 1. 시트 전체 데이터 가져오기
const response = await sheets.spreadsheets.values.get({
  spreadsheetId: config.google.sheetId,
  range: SHEET_RANGE,
});

const rows = response.data.values || [];
console.log(`총 ${rows.length}행 발견`);

// 2. 빈 날짜는 맨 뒤로, 나머지는 scheduled_date 오름차순 정렬
const dateCol = SHEET_COLUMNS.SCHEDULED_DATE;
const sorted = [...rows].sort((a, b) => {
  const dateA = a[dateCol] || '9999-99-99';
  const dateB = b[dateCol] || '9999-99-99';
  return dateA.localeCompare(dateB);
});

// 3. 컬럼 R(인덱스 17)까지 채우기 (빈 셀 처리)
const padded = sorted.map(row => {
  const r = [...row];
  while (r.length < 18) r.push('');
  return r;
});

// 4. 시트에 다시 쓰기
await sheets.spreadsheets.values.update({
  spreadsheetId: config.google.sheetId,
  range: SHEET_RANGE,
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: padded },
});

console.log(`✅ ${padded.length}행 날짜순으로 정렬 완료`);
console.log('\n정렬 결과 미리보기 (처음 10행):');
for (const r of padded.slice(0, 10)) {
  console.log(`  ${r[dateCol]} | ${r[SHEET_COLUMNS.TOPIC]} | ${r[SHEET_COLUMNS.BRANCH]}`);
}
