/**
 * 콘텐츠 캘린더 데이터 조립 + 월 리포트 집계.
 * 계획 레이어 = content_schedule, 실적 레이어 = posts/reels(published).
 * 날짜는 전부 KST 기준 (lib/kst.ts). 델타 계산 관례는 lib/metrics.ts 의 pct 와 동일.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstMonthRangeUtc, kstThisMonth } from '@/lib/kst';

export type ScheduleStatus = 'planned' | 'done' | 'canceled';
export type ContentType = 'blog' | 'reels' | 'etc';

export interface ScheduleItem {
  id: string;
  branch_id: string;
  branchName: string;
  content_type: ContentType;
  title: string;
  scheduled_date: string; // YYYY-MM-DD
  assignee_id: string | null;
  assigneeName: string | null;
  status: ScheduleStatus;
  memo: string | null;
  post_id: string | null;
  reel_id: string | null;
}

export interface PublishedItem {
  id: string;
  kind: 'post' | 'reel';
  branch_id: string;
  branchName: string;
  title: string;
  date: string; // KST YYYY-MM-DD (published_at ?? created_at)
  views: number | null;
  url: string | null;
  author_id: string | null; // auth.users id (branch_users.user_id 로 매핑)
  authorName: string | null;
}

export interface CalendarDay {
  schedule: ScheduleItem[];
  published: PublishedItem[];
}

export interface CalendarMonthData {
  days: Record<string, CalendarDay>;
}

export interface CalendarReportData {
  monthLabel: string; // '7월'
  plan: { planned: number; done: number; rate: number | null; publishedActual: number };
  exposure: { views: number; delta: number | null }; // 그 달 발행 콘텐츠의 누적 조회수
  inflow: {
    placeViews: number | null; // null = 기록 없음
    delta: number | null;
    topKeywords: { name: string; count: number }[];
  };
  byBranch: { branchId: string; name: string; planned: number; done: number; published: number }[] | null;
}

const pct = (cur: number, prev: number): number | null => (prev > 0 ? (cur - prev) / prev : null);

/** 기한 지난 미완료 계획 (todayStr = KST 'YYYY-MM-DD') */
export const isOverdue = (s: Pick<ScheduleItem, 'status' | 'scheduled_date'>, todayStr: string): boolean =>
  s.status === 'planned' && s.scheduled_date < todayStr;

/** UTC ISO → KST 날짜 문자열 */
function kstDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function prevMonthOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export function monthLabelOf(month: string): string {
  return `${Number(month.split('-')[1])}월`;
}

async function fetchBranchNames(): Promise<Map<string, string>> {
  const { data } = await getAdminSupabase().from('branches').select('id, name');
  return new Map((data ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
}

async function fetchSchedule(branchIds: string[] | null, month: string): Promise<ScheduleItem[]> {
  const admin = getAdminSupabase();
  let q = admin
    .from('content_schedule')
    .select('id, branch_id, content_type, title, scheduled_date, assignee_id, status, memo, post_id, reel_id')
    .gte('scheduled_date', `${month}-01`)
    .lt('scheduled_date', nextMonthStart(month))
    .order('scheduled_date');
  if (branchIds) q = q.in('branch_id', branchIds);
  const { data } = await q;
  const rows = (data ?? []) as Omit<ScheduleItem, 'branchName' | 'assigneeName'>[];

  // 담당자 이름 (branch_users.id 기준)
  const assigneeIds = [...new Set(rows.map((r) => r.assignee_id).filter(Boolean))] as string[];
  const nameMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: users } = await admin.from('branch_users').select('id, display_name').in('id', assigneeIds);
    for (const u of (users ?? []) as { id: string; display_name: string }[]) nameMap.set(u.id, u.display_name);
  }
  return rows.map((r) => ({
    ...r,
    branchName: '', // 호출부에서 채움
    assigneeName: r.assignee_id ? (nameMap.get(r.assignee_id) ?? null) : null,
  }));
}

async function fetchPublished(
  branchIds: string[] | null,
  month: string,
  withAuthors = false,
): Promise<PublishedItem[]> {
  const admin = getAdminSupabase();
  const { gte, lt } = kstMonthRangeUtc(month);
  // published_at 우선, null 이면 created_at 기준 (metrics.ts 와 동일한 폴백)
  const rangeOr = `and(published_at.gte.${gte},published_at.lt.${lt}),and(published_at.is.null,created_at.gte.${gte},created_at.lt.${lt})`;

  const buildQuery = (table: 'posts' | 'reels') => {
    let q = admin
      .from(table)
      .select('id, branch_id, author_id, title, views, published_at, created_at, published_url')
      .eq('status', 'published')
      .or(rangeOr);
    if (branchIds) q = q.in('branch_id', branchIds);
    return q;
  };

  const [{ data: posts }, { data: reels }] = await Promise.all([buildQuery('posts'), buildQuery('reels')]);
  type Row = {
    id: string;
    branch_id: string;
    author_id: string | null;
    title: string | null;
    views: number | null;
    published_at: string | null;
    created_at: string;
    published_url: string | null;
  };
  const postRows = (posts ?? []) as Row[];
  const reelRows = (reels ?? []) as Row[];

  // 작성자 이름: author_id(auth uid) → branch_users.user_id 매핑 (assignee의 branch_users.id 와 다름!)
  const authorNames = new Map<string, string>();
  if (withAuthors) {
    const ids = [...new Set([...postRows, ...reelRows].map((r) => r.author_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: users } = await admin.from('branch_users').select('user_id, display_name').in('user_id', ids);
      for (const u of (users ?? []) as { user_id: string; display_name: string }[]) {
        authorNames.set(u.user_id, u.display_name);
      }
    }
  }

  const toItem = (kind: 'post' | 'reel') => (r: Row): PublishedItem => ({
    id: r.id,
    kind,
    branch_id: r.branch_id,
    branchName: '',
    title: r.title || (kind === 'post' ? '제목 없는 글' : '제목 없는 릴스'),
    date: kstDateOf(r.published_at || r.created_at),
    views: r.views,
    url: r.published_url,
    author_id: r.author_id,
    authorName: r.author_id ? (authorNames.get(r.author_id) ?? null) : null,
  });
  return [...postRows.map(toItem('post')), ...reelRows.map(toItem('reel'))];
}

/** 캘린더 한 달치: 날짜별 계획 + 발행물. branchIds=null 이면 전사. */
export async function fetchCalendarMonth(
  branchIds: string[] | null,
  month?: string,
): Promise<CalendarMonthData> {
  const m = month ?? kstThisMonth();
  const [names, schedule, published] = await Promise.all([
    fetchBranchNames(),
    fetchSchedule(branchIds, m),
    fetchPublished(branchIds, m, true), // 캘린더 표시용은 작성자 포함
  ]);

  const days: Record<string, CalendarDay> = {};
  const dayOf = (date: string) => (days[date] ??= { schedule: [], published: [] });
  for (const s of schedule) {
    s.branchName = names.get(s.branch_id) ?? '';
    dayOf(s.scheduled_date).schedule.push(s);
  }
  for (const p of published) {
    p.branchName = names.get(p.branch_id) ?? '';
    dayOf(p.date).published.push(p);
  }
  return { days };
}

/**
 * 지점·월의 플레이스 유입 합계. period 혼재 이중집계 방지:
 * month 행이 있으면 그것만, 없으면 week 합, 없으면 day 합.
 */
function sumPlaceStats(
  rows: { branch_id: string; period: string; place_views: number | null; inflows: unknown }[],
): { placeViews: number | null; keywords: Map<string, number> } {
  const byBranch = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byBranch.get(r.branch_id) ?? [];
    arr.push(r);
    byBranch.set(r.branch_id, arr);
  }
  let total = 0;
  let hasAny = false;
  const keywords = new Map<string, number>();
  for (const branchRows of byBranch.values()) {
    const pick =
      branchRows.filter((r) => r.period === 'month').length > 0
        ? branchRows.filter((r) => r.period === 'month')
        : branchRows.filter((r) => r.period === 'week').length > 0
          ? branchRows.filter((r) => r.period === 'week')
          : branchRows.filter((r) => r.period === 'day');
    for (const r of pick) {
      hasAny = true;
      total += r.place_views ?? 0;
      const inflows = Array.isArray(r.inflows) ? (r.inflows as { name?: string; count?: number }[]) : [];
      for (const k of inflows) {
        if (!k?.name) continue;
        keywords.set(k.name, (keywords.get(k.name) ?? 0) + (k.count ?? 0));
      }
    }
  }
  return { placeViews: hasAny ? total : null, keywords };
}

async function fetchPlaceStats(branchIds: string[] | null, month: string) {
  let q = getAdminSupabase()
    .from('place_stats')
    .select('branch_id, period, place_views, inflows')
    .gte('stat_date', `${month}-01`)
    .lt('stat_date', nextMonthStart(month));
  if (branchIds) q = q.in('branch_id', branchIds);
  const { data } = await q;
  return sumPlaceStats(
    (data ?? []) as { branch_id: string; period: string; place_views: number | null; inflows: unknown }[],
  );
}

/** 월 리포트: 계획 이행 + 노출(조회수) + 유입(플레이스). branchIds=null 이면 전사(지점별 브레이크다운 포함). */
export async function buildCalendarReport(
  branchIds: string[] | null,
  month?: string,
): Promise<CalendarReportData> {
  const m = month ?? kstThisMonth();
  const prevM = prevMonthOf(m);

  const [names, schedule, published, prevPublished, place, prevPlace] = await Promise.all([
    fetchBranchNames(),
    fetchSchedule(branchIds, m),
    fetchPublished(branchIds, m),
    fetchPublished(branchIds, prevM),
    fetchPlaceStats(branchIds, m),
    fetchPlaceStats(branchIds, prevM),
  ]);

  const active = schedule.filter((s) => s.status !== 'canceled');
  const done = active.filter((s) => s.status === 'done').length;
  const sumViews = (items: PublishedItem[]) => items.reduce((a, p) => a + (p.views ?? 0), 0);
  const views = sumViews(published);
  const prevViews = sumViews(prevPublished);

  const topKeywords = [...place.keywords.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  let byBranch: CalendarReportData['byBranch'] = null;
  if (!branchIds) {
    const agg = new Map<string, { planned: number; done: number; published: number }>();
    const rowOf = (bid: string) => {
      const r = agg.get(bid) ?? { planned: 0, done: 0, published: 0 };
      agg.set(bid, r);
      return r;
    };
    for (const s of active) {
      const r = rowOf(s.branch_id);
      r.planned += 1;
      if (s.status === 'done') r.done += 1;
    }
    for (const p of published) rowOf(p.branch_id).published += 1;
    byBranch = [...agg.entries()]
      .map(([branchId, v]) => ({ branchId, name: names.get(branchId) ?? '?', ...v }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  return {
    monthLabel: monthLabelOf(m),
    plan: {
      planned: active.length,
      done,
      rate: active.length > 0 ? done / active.length : null,
      publishedActual: published.length,
    },
    exposure: { views, delta: pct(views, prevViews) },
    inflow: {
      placeViews: place.placeViews,
      delta:
        place.placeViews != null && prevPlace.placeViews != null
          ? pct(place.placeViews, prevPlace.placeViews)
          : null,
      topKeywords,
    },
    byBranch,
  };
}
