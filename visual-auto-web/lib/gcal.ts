/**
 * 구글 캘린더 내보내기 (일방향: 웹앱 → 구글 캘린더).
 * 콘텐츠 일정(content_schedule) 저장 시 종일 이벤트를 upsert 한다.
 * env 3종이 없으면 조용히 no-op — 저장 자체는 export 실패와 무관하게 성공해야 한다(best-effort).
 */

import { google } from 'googleapis';

export interface GcalScheduleItem {
  id: string;
  content_type: 'blog' | 'reels' | 'etc';
  title: string;
  scheduled_date: string; // YYYY-MM-DD
  status: 'planned' | 'done' | 'canceled';
  memo?: string | null;
  gcal_event_id?: string | null;
}

const TYPE_LABEL: Record<GcalScheduleItem['content_type'], string> = {
  blog: '블로그',
  reels: '릴스',
  etc: '콘텐츠',
};

// 구글 캘린더 colorId: 블로그=블루베리(9), 릴스=토마토(11), 기타=바나나(5)
const TYPE_COLOR: Record<GcalScheduleItem['content_type'], string> = {
  blog: '9',
  reels: '11',
  etc: '5',
};

export function isGcalConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_CALENDAR_ID
  );
}

function getCalendar() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar'],
  );
  return google.calendar({ version: 'v3', auth });
}

function buildEventBody(item: GcalScheduleItem, branchName: string | null) {
  const statusLabel = item.status === 'done' ? '완료' : item.status === 'canceled' ? '취소' : '예정';
  return {
    summary: `<${TYPE_LABEL[item.content_type]}> ${item.title}${branchName ? ` - ${branchName}` : ''}`,
    description: [
      `APP:${item.id}`, // 웹앱 일정 고유 마커
      branchName ? `지점: ${branchName}` : '',
      `상태: ${statusLabel}`,
      item.memo ? `메모: ${item.memo}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    start: { date: item.scheduled_date },
    end: { date: item.scheduled_date },
    colorId: TYPE_COLOR[item.content_type],
  };
}

/**
 * 이벤트 upsert. 성공 시 이벤트 id 반환(insert 든 patch 든), 미설정·실패 시 null.
 * gcal_event_id 가 있으면 patch, 이벤트가 사라졌으면(404/410) insert 폴백.
 */
export async function upsertScheduleEvent(
  item: GcalScheduleItem,
  branchName: string | null,
): Promise<string | null> {
  if (!isGcalConfigured()) return null;
  const calendar = getCalendar();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const requestBody = buildEventBody(item, branchName);

  try {
    if (item.gcal_event_id) {
      try {
        await calendar.events.patch({ calendarId, eventId: item.gcal_event_id, requestBody });
        return item.gcal_event_id;
      } catch (e) {
        const status = (e as { code?: number; status?: number }).code ?? (e as { status?: number }).status;
        if (status !== 404 && status !== 410) throw e;
        // 캘린더에서 수동 삭제된 경우 → 새로 생성
      }
    }
    const res = await calendar.events.insert({ calendarId, requestBody });
    return res.data.id ?? null;
  } catch (e) {
    console.warn('[gcal] 이벤트 내보내기 실패:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** 이벤트 삭제 (일정 삭제·취소 시). best-effort — 실패해도 조용히 넘어간다. */
export async function deleteScheduleEvent(eventId: string | null | undefined): Promise<void> {
  if (!eventId || !isGcalConfigured()) return;
  try {
    await getCalendar().events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      eventId,
    });
  } catch (e) {
    console.warn('[gcal] 이벤트 삭제 실패:', e instanceof Error ? e.message : e);
  }
}
