import { getCalendar } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const calendar = getCalendar();
const response = await calendar.events.list({
  calendarId: config.google.calendarId,
  timeMin: '2026-04-16T00:00:00Z',
  timeMax: '2026-04-18T00:00:00Z',
  singleEvents: true,
  orderBy: 'startTime',
});

const events = response.data.items || [];
console.log(`4/16~17 이벤트: 총 ${events.length}개\n`);

for (const e of events) {
  console.log(`제목: ${e.summary}`);
  console.log(`날짜: ${e.start?.date}`);
  console.log(`ID: ${e.id}`);
  console.log(`캘린더: ${e.organizer?.displayName || e.organizer?.email}`);
  console.log(`---`);
}
