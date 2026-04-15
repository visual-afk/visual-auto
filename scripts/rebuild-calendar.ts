import { getCalendar } from '../lib/google-auth.js';
import { getSheets } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const calendar = getCalendar();
const sheets = getSheets();

// 1. 기존 이벤트 전부 삭제
console.log('기존 이벤트 삭제 중...');
const existing = await calendar.events.list({
  calendarId: config.google.calendarId,
  timeMin: '2026-04-01T00:00:00Z',
  timeMax: '2026-06-01T23:59:59Z',
  singleEvents: true,
});

for (const e of existing.data.items || []) {
  if (e.id) {
    await calendar.events.delete({
      calendarId: config.google.calendarId,
      eventId: e.id,
    });
  }
}
console.log(`${existing.data.items?.length || 0}개 삭제 완료\n`);

// 2. 주제 목록 (김지원 단발부터 시작)
const topics = [
  { topic: '김지원 단발', keywords: '김지원 단발, 단발 주문법, 미디엄 단발', postType: '정보형' },
  { topic: '어려보이는 머리', keywords: '어려보이는머리, 동안헤어, 동안 헤어스타일', postType: '정보형' },
  { topic: '두피 리프팅', keywords: '두피 리프팅, 두피관리, 두피케어', postType: '정보형' },
  { topic: '부스스한 머리 관리법', keywords: '부스스한 머리, 머릿결관리, 머리카락관리', postType: '정보형' },
  { topic: '2026 여자머리 트렌드', keywords: '26년 여자머리 트렌드, 헤어트렌드, 여자 헤어스타일', postType: '정보형' },
  { topic: '손질 편한 단발', keywords: '손질편한단발, 헤어손질, 단발 추천', postType: '정보형' },
  { topic: '30대 리프팅', keywords: '30대리프팅, 두피리프팅, 동안헤어', postType: '정보형' },
  { topic: '염색 컬러 추천', keywords: '염색컬러추천, 헤어컬러, 염색 추천', postType: '정보형' },
  { topic: '동안 헤어스타일', keywords: '동안 헤어스타일, 동안헤어, 어려보이는 머리', postType: '정보형' },
  { topic: '머릿결 관리법', keywords: '머릿결관리, 머리카락관리, 머릿결 좋아지는법', postType: '정보형' },
  { topic: '손상모 트리트먼트', keywords: '손상모트리트먼트, 손상모관리, 머릿결관리', postType: '정보형' },
];

// 3. 평일만 계산 (토/일 제외)
function getWeekdays(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const d = new Date(startDate + 'T12:00:00'); // 정오로 설정해서 시간대 이슈 방지
  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) { // 일=0, 토=6
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// 4/16부터 시작, 22개 평일 필요 (11주제 x 2)
const weekdays = getWeekdays('2026-04-16', topics.length * 2);

// 4. 캘린더 이벤트 생성 + 시트 데이터 준비
console.log('새 캘린더 생성 중...\n');

const sheetRows: string[][] = [];

for (let i = 0; i < topics.length; i++) {
  const t = topics[i];
  const imwebDate = weekdays[i * 2];
  const blogDate = weekdays[i * 2 + 1];

  // 아임웹 이벤트
  await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: `[아임웹] ${t.topic}`,
      description: `키워드: ${t.keywords}\n글유형: ${t.postType}`,
      start: { date: imwebDate },
      end: { date: imwebDate },
      colorId: '9', // 블루베리
    },
  });
  console.log(`${imwebDate}  [아임웹] ${t.topic}`);

  // 블로그 이벤트
  await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: `[블로그] ${t.topic}`,
      description: `키워드: ${t.keywords}\n글유형: ${t.postType}`,
      start: { date: blogDate },
      end: { date: blogDate },
      colorId: '7', // 라벤더
    },
  });
  console.log(`${blogDate}  [블로그] ${t.topic}`);

  // 시트 데이터
  const month1 = imwebDate.slice(0, 7);
  const month2 = blogDate.slice(0, 7);
  const week1 = Math.ceil(new Date(imwebDate + 'T12:00:00').getDate() / 7).toString();
  const week2 = Math.ceil(new Date(blogDate + 'T12:00:00').getDate() / 7).toString();

  sheetRows.push([month1, week1, t.topic, t.keywords, t.postType, 'planned', imwebDate]);
  sheetRows.push([month2, week2, t.topic, t.keywords, t.postType, 'planned', blogDate]);
}

// 5. 시트 업데이트 (A2:G23 — 22행)
await sheets.spreadsheets.values.update({
  spreadsheetId: config.google.sheetId,
  range: '시트1!A2:G23',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: sheetRows },
});

// 기존 24~25행 데이터 삭제 (빈 값으로 덮기)
await sheets.spreadsheets.values.update({
  spreadsheetId: config.google.sheetId,
  range: '시트1!A24:G25',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [['','','','','','',''], ['','','','','','','']] },
});

console.log('\n✅ 캘린더 + 시트 모두 완료!');
