import { fetchAllRows, updateCell } from '../lib/google-sheets.js';
import { SHEET_COLUMNS } from '../lib/config.js';

// 주제별 올바른 퍼널 단계 매핑
const FUNNEL_MAP: Record<string, string> = {
  '김지원 단발': '2.검색',
  '어려보이는 머리': '2.검색',
  '두피 리프팅': '1.인식',
  '부스스한 머리 관리법': '1.인식',
  '2026 여자머리 트렌드': '2.검색',
  '손질 편한 단발': '2.검색',
  '30대 리프팅': '1.인식',
  '염색 컬러 추천': '2.검색',
  '동안 헤어스타일': '2.검색',
  '머릿결 관리법': '1.인식',
  '손상모 트리트먼트': '3.비교',
};

const rows = await fetchAllRows();
console.log(`총 ${rows.length}행 수정 시작\n`);

for (const row of rows) {
  const funnel = FUNNEL_MAP[row.topic];
  if (funnel) {
    await updateCell(row.rowIndex, SHEET_COLUMNS.FUNNEL, funnel);
    console.log(`✅ 행 ${row.rowIndex} "${row.topic}" → funnel: ${funnel}`);
  } else {
    console.log(`⚠️ 행 ${row.rowIndex} "${row.topic}" — 매핑 없음, 건너뜀`);
  }
}

console.log('\n완료!');
