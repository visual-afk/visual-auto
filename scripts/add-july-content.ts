import { getSheets } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const sheets = getSheets();

const julyTopics = [
  // 1주차: 7월 시즌 시작, 시즌 키워드
  { topic: '바캉스 헤어 추천', keywords: '바캉스헤어, 휴가머리, 여름헤어스타일', postType: '시즌형', funnel: '2.검색', brain: '뇌1,2', persona: 'P05,P06', purpose: '노출용', branch: '성수점', dates: ['2026-07-01', '2026-07-02'] },
  { topic: '여름 휴가 가기 전 머리 관리', keywords: '휴가전머리, 휴가머리관리, 여름머리관리법', postType: '정보형', funnel: '1.인식', brain: '뇌2,3', persona: 'P05', purpose: '유입용', branch: '강남신사점', dates: ['2026-07-03', '2026-07-06'] },
  // 2주차
  { topic: 'U뱅 앞머리 트렌드', keywords: 'U뱅, U뱅앞머리, 앞머리트렌드', postType: '시즌형', funnel: '2.검색', brain: '뇌1,2', persona: 'P06', purpose: '노출용', branch: '사가정점', dates: ['2026-07-07', '2026-07-08'] },
  { topic: '여름 단발 추천', keywords: '여름단발, 여름단발추천, 단발스타일링', postType: '시즌형', funnel: '2.검색', brain: '뇌1,2', persona: 'P01,P06', purpose: '노출용', branch: '사가정점', dates: ['2026-07-09', '2026-07-10'] },
  // 3주차: 휴가 시즌 본격, 손상 케어
  { topic: '바닷물 자외선 손상 후 머릿결 복구', keywords: '바닷물머리손상, 자외선머리손상, 휴가후머리복구', postType: '정보형', funnel: '3.비교', brain: '뇌2,3', persona: 'P03,P05', purpose: '유입용', branch: '마곡나루점', dates: ['2026-07-13', '2026-07-14'] },
  { topic: '여름 두피 트러블 해결', keywords: '여름두피, 두피땀, 두피트러블', postType: '정보형', funnel: '1.인식', brain: '뇌2', persona: 'P01,P05', purpose: '유입용', branch: '강남신사점', dates: ['2026-07-15', '2026-07-16'] },
  // 4주차: 트렌드 + 컬러
  { topic: '컬러멜팅 염색 추천', keywords: '컬러멜팅, 컬러멜팅염색, 자연스러운염색', postType: '시즌형', funnel: '2.검색', brain: '뇌1,2', persona: 'P06', purpose: '노출용', branch: '성수점', dates: ['2026-07-17', '2026-07-20'] },
  { topic: '습한 여름 곱슬머리 매직 추천', keywords: '여름곱슬머리, 곱슬머리매직, 장마곱슬', postType: '정보형', funnel: '3.비교', brain: '뇌2,3', persona: 'P03', purpose: '전환용', branch: '마곡나루점', dates: ['2026-07-21', '2026-07-22'] },
  // 5주차: 7월 마무리, 전환
  { topic: '극손상모 결마지 후기', keywords: '결마지후기, 극손상모복구, 결마지실제후기', postType: '스토리형', funnel: '4.불안', brain: '뇌2,3', persona: 'P03', purpose: '전환용', branch: '마곡나루점', dates: ['2026-07-23', '2026-07-24'] },
  { topic: '8월 휴가 시즌 결마지 미리 받기', keywords: '결마지타이밍, 휴가전결마지, 결마지예약', postType: '시즌형', funnel: '5.예약', brain: '뇌2,3', persona: 'P05', purpose: '전환용', branch: '성수점', dates: ['2026-07-27', '2026-07-28'] },
  // 6주차: 7월 끝, 8월 준비
  { topic: '남자 여름 헤어스타일', keywords: '남자여름머리, 남자여름헤어, 남자댄디펌', postType: '시즌형', funnel: '2.검색', brain: '뇌1,2', persona: 'P06', purpose: '노출용', branch: '성수점', dates: ['2026-07-29', '2026-07-30'] },
];

const rows: string[][] = [];

for (const t of julyTopics) {
  for (const date of t.dates) {
    const week = Math.ceil(new Date(date + 'T12:00:00').getDate() / 7).toString();
    rows.push([
      '2026-07',
      week,
      t.topic,
      t.keywords,
      t.postType,
      'planned',
      date,
      '',
      '',
      '',
      '',
      '',
      '',
      t.funnel,
      t.brain,
      t.persona,
      t.purpose,
      t.branch,
    ]);
  }
}

await sheets.spreadsheets.values.append({
  spreadsheetId: config.google.sheetId,
  range: '시트1!A:R',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: rows },
});

console.log(`✅ 7월 콘텐츠 ${rows.length}건 시트에 추가 완료!`);
for (const t of julyTopics) {
  console.log(`  ${t.dates[0]}~${t.dates[1]}  ${t.topic} (${t.purpose}, ${t.branch})`);
}
