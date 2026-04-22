import { getCalendar } from '../lib/google-auth.js';
import { config } from '../lib/config.js';
import { fetchAllRows } from '../lib/google-sheets.js';

const calendar = getCalendar();

// 기존 이벤트 전부 가져오기 (중복 방지용)
const existingResponse = await calendar.events.list({
  calendarId: config.google.calendarId,
  timeMin: '2026-04-01T00:00:00Z',
  timeMax: '2026-07-01T00:00:00Z',
  singleEvents: true,
  maxResults: 200,
});
const existingEvents = existingResponse.data.items || [];
const existingSet = new Set(
  existingEvents.map(e => `${e.start?.date}_${e.summary}`)
);

// 시트에서 모든 행 가져오기
const rows = await fetchAllRows();

// 같은 주제끼리 묶어서 첫 번째=아임웹, 두 번째=블로그 판별
const topicCount: Record<string, number> = {};

let created = 0;
let skipped = 0;

for (const row of rows) {
  if (!row.scheduledDate || !row.topic) continue;

  // 이 주제가 몇 번째인지 카운트
  topicCount[row.topic] = (topicCount[row.topic] || 0) + 1;
  const platform = topicCount[row.topic] === 1 ? '아임웹' : '블로그';
  const summary = `[${platform}] ${row.topic}`;

  // 이미 있는 이벤트면 건너뛰기
  const key = `${row.scheduledDate}_${summary}`;
  if (existingSet.has(key)) {
    skipped++;
    continue;
  }

  // 새 이벤트 생성
  await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary,
      description: [
        `키워드: ${row.keywords}`,
        `글유형: ${row.postType}`,
        `퍼널: ${row.funnel}`,
        `뇌: ${row.brainFocus}`,
        `페르소나: ${row.targetPersona}`,
      ].join('\n'),
      start: { date: row.scheduledDate },
      end: { date: row.scheduledDate },
      colorId: platform === '아임웹' ? '7' : '9', // 아임웹=피콕, 블로그=블루베리
    },
  });

  console.log(`✅ ${row.scheduledDate} — ${summary}`);
  created++;
}

console.log(`\n완료! 새로 생성: ${created}개, 이미 있어서 건너뜀: ${skipped}개`);
