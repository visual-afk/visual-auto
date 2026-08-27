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
  reference_url?: string | null;
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
      item.reference_url ? `레퍼런스: ${item.reference_url}` : '',
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

// ── 카드뉴스 주제 편성 이벤트 ───────────────────────────────────────────

export interface GcalTopicItem {
  id: string;
  topic_date: string; // YYYY-MM-DD
  material: string;
  section?: string | null;
  frame?: string | null;
  fact_seed?: string | null;
  status: 'planning' | 'reference' | 'filmed' | 'uploaded' | 'skipped';
  memo?: string | null;
  reference_url?: string | null;
  gcal_event_id?: string | null;
}

const TOPIC_STATUS_LABEL: Record<GcalTopicItem['status'], string> = {
  planning: '기획중',
  reference: '레퍼런스',
  filmed: '촬영완료',
  uploaded: '업로드완료',
  skipped: '건너뜀',
};

const TOPIC_COLOR = '2'; // 세이지(초록) — 콘텐츠 일정 색과 구분

function buildTopicEventBody(item: GcalTopicItem, brandName: string | null) {
  const statusLabel = TOPIC_STATUS_LABEL[item.status] ?? '기획중';
  return {
    summary: `[${brandName ?? '카드뉴스'}] ${item.material}`,
    description: [
      `CNTOPIC:${item.id}`, // 웹앱 주제 고유 마커
      item.section ? `면: ${item.section}` : '',
      item.frame ? `프레임: ${item.frame}` : '',
      item.fact_seed ? `팩트 시드: ${item.fact_seed}` : '',
      `상태: ${statusLabel}`,
      item.reference_url ? `레퍼런스: ${item.reference_url}` : '',
      item.memo ? `메모: ${item.memo}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    start: { date: item.topic_date },
    end: { date: item.topic_date },
    colorId: TOPIC_COLOR,
  };
}

/**
 * gcal_event_id 가 없을 때, 예전 스크립트가 만든 같은 날짜 이벤트(TFTOPIC:날짜 태그)를 찾아 승계한다.
 * (앱 이관 전에 이미 내보내진 트리필드 이벤트 중복 생성 방지 — 못 찾으면 null)
 */
async function findLegacyTopicEvent(date: string): Promise<string | null> {
  try {
    const res = await getCalendar().events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      q: 'TFTOPIC',
      timeMin: `${date}T00:00:00Z`,
      timeMax: `${date}T23:59:59Z`,
      singleEvents: true,
      maxResults: 10,
    });
    const match = (res.data.items ?? []).find((e) => e.description?.includes(`TFTOPIC:${date}`));
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/** 주제 이벤트 upsert. 성공 시 이벤트 id, 미설정·실패 시 null. */
export async function upsertTopicEvent(item: GcalTopicItem, brandName: string | null): Promise<string | null> {
  if (!isGcalConfigured()) return null;
  const calendar = getCalendar();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const requestBody = buildTopicEventBody(item, brandName);

  try {
    const eventId = item.gcal_event_id || (brandName === '트리필드' ? await findLegacyTopicEvent(item.topic_date) : null);
    if (eventId) {
      try {
        await calendar.events.patch({ calendarId, eventId, requestBody });
        return eventId;
      } catch (e) {
        const status = (e as { code?: number; status?: number }).code ?? (e as { status?: number }).status;
        if (status !== 404 && status !== 410) throw e;
      }
    }
    const res = await calendar.events.insert({ calendarId, requestBody });
    return res.data.id ?? null;
  } catch (e) {
    console.warn('[gcal] 주제 이벤트 내보내기 실패:', e instanceof Error ? e.message : e);
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
