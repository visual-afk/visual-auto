import { getCalendar } from './google-auth.js';
import { config } from './config.js';
import type { SheetRow, ContentPurpose } from './types.js';

const PURPOSE_LABELS: Record<ContentPurpose, string> = {
  '노출용': '노출',
  '유입용': '유입',
  '전환용': '전환',
};

const PURPOSE_COLORS: Record<ContentPurpose, string> = {
  '노출용': '9',   // 블루베리 (파랑)
  '유입용': '5',   // 바나나 (노랑)
  '전환용': '11',  // 토마토 (빨강)
};

function getPurposeLabel(purpose?: ContentPurpose): string {
  return PURPOSE_LABELS[purpose || '노출용'] || '노출';
}

function getPurposeColor(purpose?: ContentPurpose): string {
  return PURPOSE_COLORS[purpose || '노출용'] || '9';
}

export async function createBlogEvent(row: SheetRow): Promise<string> {
  const calendar = getCalendar();
  const purposeTag = getPurposeLabel(row.contentPurpose);
  const branchTag = row.branch ? `-${row.branch}` : '';

  const event = await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: `[블로그${branchTag}/${purposeTag}] ${row.topic}`,
      description: [
        `키워드: ${row.keywords}`,
        `글유형: ${row.postType}`,
        `글목적: ${row.contentPurpose || '노출용'}`,
        ...(row.branch ? [`지점: ${row.branch}`] : []),
        `상태: ${row.status}`,
        row.docUrl ? `독스: ${row.docUrl}` : '',
      ].filter(Boolean).join('\n'),
      start: { date: row.scheduledDate },
      end: { date: row.scheduledDate },
      colorId: getPurposeColor(row.contentPurpose),
    },
  });

  return event.data.id || '';
}

export async function findExistingEvent(topic: string, date: string): Promise<string | null> {
  const calendar = getCalendar();

  const response = await calendar.events.list({
    calendarId: config.google.calendarId,
    timeMin: `${date}T00:00:00Z`,
    timeMax: `${date}T23:59:59Z`,
    q: `[블로그] ${topic}`,
    singleEvents: true,
  });

  const events = response.data.items || [];
  const match = events.find(e => e.summary?.includes(topic));
  return match?.id || null;
}

export async function updateBlogEvent(eventId: string, row: SheetRow): Promise<void> {
  const calendar = getCalendar();

  const purposeTag = getPurposeLabel(row.contentPurpose);
  const branchTag = row.branch ? `-${row.branch}` : '';

  await calendar.events.patch({
    calendarId: config.google.calendarId,
    eventId,
    requestBody: {
      summary: `[블로그${branchTag}/${purposeTag}] ${row.topic}`,
      description: [
        `키워드: ${row.keywords}`,
        `글유형: ${row.postType}`,
        `글목적: ${row.contentPurpose || '노출용'}`,
        ...(row.branch ? [`지점: ${row.branch}`] : []),
        `상태: ${row.status}`,
        row.docUrl ? `독스: ${row.docUrl}` : '',
      ].filter(Boolean).join('\n'),
      start: { date: row.scheduledDate },
      end: { date: row.scheduledDate },
      colorId: getPurposeColor(row.contentPurpose),
    },
  });
}

export async function syncRowToCalendar(row: SheetRow): Promise<void> {
  if (!row.scheduledDate || !row.topic) return;

  const existingId = await findExistingEvent(row.topic, row.scheduledDate);

  if (existingId) {
    await updateBlogEvent(existingId, row);
    console.log(`캘린더 업데이트: ${row.topic} (${row.scheduledDate})`);
  } else {
    await createBlogEvent(row);
    console.log(`캘린더 생성: ${row.topic} (${row.scheduledDate})`);
  }
}
