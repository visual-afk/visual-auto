import { getCalendar } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const calendar = getCalendar();

const response = await calendar.events.list({
  calendarId: config.google.calendarId,
  timeMin: '2026-04-15T00:00:00Z',
  timeMax: '2026-05-20T23:59:59Z',
  singleEvents: true,
  orderBy: 'startTime',
});

const events = response.data.items || [];
console.log(`총 ${events.length}개 이벤트\n`);

for (const e of events) {
  const date = e.start?.date || e.start?.dateTime || '?';
  console.log(`${date} — ${e.summary}`);
}
