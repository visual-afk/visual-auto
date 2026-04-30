import { getSheets } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const sheets = getSheets();

const juneTopics = [
  { topic: '장마철 곱슬머리 관리법', keywords: '장마철곱슬머리, 곱슬머리관리법, 습기머리관리', postType: '정보형', funnel: '1.인식', brain: '뇌2,3', persona: 'P01,P03', purpose: '노출용', branch: '사가정점', dates: ['2026-06-03', '2026-06-04'] },
  { topic: '여름 머릿결 관리', keywords: '여름머릿결관리, 여름모발관리, 머릿결좋아지는법', postType: '정보형', funnel: '1.인식', brain: '뇌2', persona: 'P05,P06', purpose: '노출용', branch: '성수점', dates: ['2026-06-05', '2026-06-08'] },
  { topic: '습기에 부스스한 머리 해결법', keywords: '부스스한머리, 습기머리, 장마철헤어', postType: '정보형', funnel: '3.비교', brain: '뇌2,3', persona: 'P03,P05', purpose: '유입용', branch: '마곡나루점', dates: ['2026-06-09', '2026-06-10'] },
  { topic: '여름 두피케어 루틴', keywords: '여름두피케어, 두피관리, 두피리프팅', postType: '정보형', funnel: '1.인식', brain: '뇌2', persona: 'P01,P05', purpose: '유입용', branch: '강남신사점', dates: ['2026-06-11', '2026-06-12'] },
  { topic: '여름 단발 스타일 추천', keywords: '여름단발, 단발스타일추천, 손질편한단발', postType: '시즌형', funnel: '2.검색', brain: '뇌1,2', persona: 'P01,P06', purpose: '노출용', branch: '사가정점', dates: ['2026-06-15', '2026-06-16'] },
  { topic: '여름 염색 추천 컬러', keywords: '여름염색추천, 애쉬브라운, 컬러멜팅', postType: '시즌형', funnel: '2.검색', brain: '뇌1,2', persona: 'P05,P06', purpose: '노출용', branch: '성수점', dates: ['2026-06-17', '2026-06-18'] },
  { topic: '복구매직 잘하는 곳', keywords: '복구매직잘하는곳, 복구매직추천, 극손상모매직', postType: '정보형', funnel: '4.불안', brain: '뇌2,3', persona: 'P03', purpose: '전환용', branch: '마곡나루점', dates: ['2026-06-19', '2026-06-22'] },
  { topic: '셀프염색 망한 머리 복구', keywords: '셀프염색실패, 셀프염색복구, 망한머리복구', postType: '스토리형', funnel: '3.비교', brain: '뇌2,3', persona: 'P03,P06', purpose: '전환용', branch: '사가정점', dates: ['2026-06-23', '2026-06-24'] },
  { topic: '탈색 후 머릿결 복구', keywords: '탈색후머릿결, 탈색모복구, 탈색손상머리', postType: '정보형', funnel: '3.비교', brain: '뇌2', persona: 'P03,P06', purpose: '전환용', branch: '성수점', dates: ['2026-06-25', '2026-06-26'] },
  { topic: '미용실 가서 망한 머리 대처법', keywords: '미용실망한머리, 머리망함, 미용실실패복구', postType: '정보형', funnel: '4.불안', brain: '뇌3', persona: 'P03', purpose: '유입용', branch: '강남신사점', dates: ['2026-06-29', '2026-06-30'] },
];

const rows: string[][] = [];

for (const t of juneTopics) {
  for (const date of t.dates) {
    const week = Math.ceil(new Date(date + 'T12:00:00').getDate() / 7).toString();
    rows.push([
      '2026-06',    // month
      week,          // week
      t.topic,       // topic
      t.keywords,    // keywords
      t.postType,    // post_type
      'planned',     // status
      date,          // scheduled_date
      '',            // generated_at
      '',            // doc_url
      '',            // imweb_url
      '',            // naver_url
      '',            // views
      '',            // conversions
      t.funnel,      // funnel
      t.brain,       // brain_focus
      t.persona,     // target_persona
      t.purpose,     // content_purpose
      t.branch,      // branch
    ]);
  }
}

// 기존 데이터 뒤에 추가 (36행부터)
await sheets.spreadsheets.values.append({
  spreadsheetId: config.google.sheetId,
  range: '시트1!A:R',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: rows },
});

console.log(`✅ 6월 콘텐츠 ${rows.length}건 시트에 추가 완료!`);
for (const t of juneTopics) {
  console.log(`  ${t.dates[0]}~${t.dates[1]}  ${t.topic} (${t.purpose}, ${t.branch})`);
}
