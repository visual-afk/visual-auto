import { getCalendar } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const calendar = getCalendar();

console.log('기존 이벤트 삭제 중...');
const existing = await calendar.events.list({
  calendarId: config.google.calendarId,
  timeMin: '2026-04-01T00:00:00Z',
  timeMax: '2026-07-01T23:59:59Z',
  singleEvents: true,
  maxResults: 200,
});

const items = existing.data.items || [];
console.log(`${items.length}개 이벤트 발견`);

for (const e of items) {
  if (e.id) {
    await calendar.events.delete({ calendarId: config.google.calendarId, eventId: e.id });
    console.log(`  삭제: ${e.summary}`);
  }
}
console.log('\n삭제 완료!');
