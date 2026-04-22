import { getCalendar } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const calendar = getCalendar();

// 모든 이벤트 가져오기
const response = await calendar.events.list({
  calendarId: config.google.calendarId,
  timeMin: '2026-04-15T00:00:00Z',
  timeMax: '2026-05-20T23:59:59Z',
  singleEvents: true,
  orderBy: 'startTime',
});

const events = response.data.items || [];

// topic별로 날짜순 정렬 후 그룹핑
const groups = new Map<string, typeof events>();

for (const e of events) {
  // topic 추출 (앞의 [아임웹] 또는 [블로그] 제거)
  const topic = (e.summary || '').replace(/^\[(아임웹|블로그)\]\s*/, '');
  if (!groups.has(topic)) groups.set(topic, []);
  groups.get(topic)!.push(e);
}

// 각 그룹에서 첫 번째 = 아임웹, 두 번째 = 블로그
for (const [topic, items] of groups) {
  // 날짜순 정렬
  items.sort((a, b) => (a.start?.date || '').localeCompare(b.start?.date || ''));

  for (let i = 0; i < items.length; i++) {
    const platform = i === 0 ? '아임웹' : '블로그';
    const newTitle = `[${platform}] ${topic}`;
    const e = items[i];

    if (e.summary !== newTitle && e.id) {
      await calendar.events.patch({
        calendarId: config.google.calendarId,
        eventId: e.id,
        requestBody: { summary: newTitle },
      });
      console.log(`${e.start?.date} — ${e.summary} → ${newTitle}`);
    }
  }
}

console.log('\n✅ 완료!');
