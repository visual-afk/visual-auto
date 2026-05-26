import { updateCell, fetchAllRows } from '../lib/google-sheets.js';
import { SHEET_COLUMNS } from '../lib/config.js';

const rows = await fetchAllRows();

// 미용실 상술 구별법 → 5/26, 5/27
// 여름 단발 스타일 추천 → 6/5, 6/8 (미용실 상술이 있던 자리)
const swaps: [string, [string, string]][] = [
  ['미용실 상술 구별법', ['2026-05-26', '2026-05-27']],
  ['여름 단발 스타일 추천', ['2026-06-05', '2026-06-08']],
];

for (const [topic, dates] of swaps) {
  const matched = rows.filter(r => r.topic === topic).sort((a, b) => a.rowIndex - b.rowIndex);
  if (matched.length < 2) {
    console.log(`⚠️ ${topic} 행 부족`);
    continue;
  }
  await updateCell(matched[0].rowIndex, SHEET_COLUMNS.SCHEDULED_DATE, dates[0]);
  await updateCell(matched[1].rowIndex, SHEET_COLUMNS.SCHEDULED_DATE, dates[1]);
  console.log(`✅ ${topic}: ${dates[0]} + ${dates[1]}`);
}

console.log('\n날짜 변경 완료');
