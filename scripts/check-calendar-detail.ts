import { getCalendar } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const calendar = getCalendar();
const response = await calendar.events.list({
  calendarId: config.google.calendarId,
  timeMin: '2026-04-15T00:00:00Z',
  timeMax: '2026-04-25T00:00:00Z',
  singleEvents: true,
  orderBy: 'startTime',
});

const events = response.data.items || [];

// 날짜별로 그룹핑
const byDate: Record<string, string[]> = {};
for (const e of events) {
  const date = e.start?.date || '?';
  if (!byDate[date]) byDate[date] = [];
  byDate[date].push(e.summary || '(제목없음)');
}

for (const [date, titles] of Object.entries(byDate).sort()) {
  if (titles.length > 1) {
    console.log(`⚠️ ${date} — ${titles.length}개 (중복!)`);
  } else {
    console.log(`✅ ${date} — ${titles.length}개`);
  }
  for (const t of titles) {
    console.log(`   ${t}`);
  }
}
