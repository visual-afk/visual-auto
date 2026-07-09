/**
 * 성과 집계 + 퍼널 + 진단 — python/dashboard.py 수식 이식 + 강의 7·8강 진단 로직.
 * 데이터: metrics_daily(HandSOS) + posts.views(앱 조회수) + marketing_daily(아임웹/아카데미).
 */

import { getAdminSupabase } from '@/lib/supabase/admin';

export type PeriodType = 'month' | 'week';

export interface DateRange {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  label: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 기간 + 직전 동기간 범위(증감용). ref 기본 오늘(UTC). */
export function resolveRange(type: PeriodType, ref?: string): DateRange {
  const base = ref ? new Date(ref + 'T00:00:00Z') : new Date();
  if (type === 'week') {
    const end = new Date(base);
    const start = new Date(base);
    start.setUTCDate(start.getUTCDate() - 6);
    const prevEnd = new Date(start);
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setUTCDate(prevStart.getUTCDate() - 6);
    return { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd), label: '최근 7일' };
  }
  // month
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  const prevStart = new Date(Date.UTC(y, m - 1, 1));
  const prevEnd = new Date(Date.UTC(y, m, 0));
  return { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd), label: `${m + 1}월` };
}

interface RawSums {
  cut: number; perm: number; recovery: number; clinic: number; dye: number; etc: number;
  new_sales: number; repeat_sales: number; guest_count: number;
}
const emptySums = (): RawSums => ({ cut: 0, perm: 0, recovery: 0, clinic: 0, dye: 0, etc: 0, new_sales: 0, repeat_sales: 0, guest_count: 0 });

async function sumBranch(branchId: string, start: string, end: string): Promise<RawSums> {
  const { data } = await getAdminSupabase()
    .from('metrics_daily')
    .select('cut,perm,recovery,clinic,dye,etc,new_sales,repeat_sales,guest_count')
    .eq('branch_id', branchId)
    .eq('scope', 'branch')
    .gte('date', start)
    .lte('date', end);
  const s = emptySums();
  for (const r of data || []) {
    s.cut += r.cut; s.perm += r.perm; s.recovery += r.recovery; s.clinic += r.clinic;
    s.dye += r.dye; s.etc += r.etc; s.new_sales += r.new_sales; s.repeat_sales += r.repeat_sales;
    s.guest_count += r.guest_count;
  }
  return s;
}

/** 앱 콘텐츠 조회수(노출 프록시): 기간 내 발행 글 views 합 */
async function sumBlogViews(branchId: string, start: string, end: string): Promise<number> {
  const { data } = await getAdminSupabase()
    .from('posts')
    .select('views, created_at')
    .eq('branch_id', branchId)
    .not('views', 'is', null)
    .gte('created_at', start)
    .lte('created_at', end + 'T23:59:59');
  return (data || []).reduce((a, p) => a + (p.views || 0), 0);
}

const pct = (cur: number, prev: number): number | null => (prev > 0 ? (cur - prev) / prev : null);

export interface BranchDashboard {
  hasData: boolean;
  range: { label: string };
  sales: { total: number; new: number; repeat: number; totalDelta: number | null; newDelta: number | null; repeatDelta: number | null };
  guestCount: number;
  avgPrice: number;
  treatments: { cut: number; perm: number; recovery: number; clinic: number; dye: number; etc: number };
  totalTreatments: number;
  recoveryRatio: number;
  funnel: { exposure: number; conversion: number; exposureToConversion: number | null };
  diagnosis: { tone: 'good' | 'warn' | 'neutral'; title: string; body: string };
}

/** 지점 대시보드 집계 */
export async function aggregateBranch(branchId: string, type: PeriodType, ref?: string): Promise<BranchDashboard> {
  const range = resolveRange(type, ref);
  const [cur, prev, exposure] = await Promise.all([
    sumBranch(branchId, range.start, range.end),
    sumBranch(branchId, range.prevStart, range.prevEnd),
    sumBlogViews(branchId, range.start, range.end),
  ]);

  const total = cur.new_sales + cur.repeat_sales;
  const prevTotal = prev.new_sales + prev.repeat_sales;
  const totalTreatments = cur.cut + cur.perm + cur.recovery + cur.clinic + cur.dye + cur.etc;
  const conversion = cur.guest_count;
  const e2c = exposure > 0 ? conversion / exposure : null;

  const hasData = cur.guest_count > 0 || total > 0 || totalTreatments > 0;

  return {
    hasData,
    range: { label: range.label },
    sales: {
      total, new: cur.new_sales, repeat: cur.repeat_sales,
      totalDelta: pct(total, prevTotal), newDelta: pct(cur.new_sales, prev.new_sales), repeatDelta: pct(cur.repeat_sales, prev.repeat_sales),
    },
    guestCount: cur.guest_count,
    avgPrice: cur.guest_count > 0 ? Math.round(total / cur.guest_count) : 0,
    treatments: { cut: cur.cut, perm: cur.perm, recovery: cur.recovery, clinic: cur.clinic, dye: cur.dye, etc: cur.etc },
    totalTreatments,
    recoveryRatio: totalTreatments > 0 ? cur.recovery / totalTreatments : 0,
    funnel: { exposure, conversion, exposureToConversion: e2c },
    diagnosis: buildDiagnosis({ exposure, conversion, e2c, totalDelta: pct(total, prevTotal) }),
  };
}

/** 강의 7·8강 규칙 기반 한국어 진단 카드 (LLM 불필요) */
function buildDiagnosis(x: { exposure: number; conversion: number; e2c: number | null; totalDelta: number | null }): BranchDashboard['diagnosis'] {
  if (x.exposure === 0 && x.conversion === 0) {
    return { tone: 'neutral', title: '데이터가 더 쌓이면 보여드릴게요', body: '블로그·릴스를 올리고 HandSOS가 동기화되면 노출→전환 흐름이 채워져요.' };
  }
  if (x.exposure === 0) {
    return { tone: 'warn', title: '손님은 오는데, 콘텐츠 노출이 안 잡혀요', body: '블로그·릴스를 꾸준히 올리고 조회수를 기록하면 어디서 새는지 보여요(2·3·4강).' };
  }
  const rate = x.e2c ?? 0;
  if (rate < 0.3) {
    return {
      tone: 'warn',
      title: '새는 파이프부터 고치세요',
      body: '콘텐츠는 보이는데 예약으로 잘 안 와요. 노출을 더 늘리기보다, 예약하고 싶게 만드는 걸 손봐야 해요 — 리뷰·예약 동선 점검(5강).',
    };
  }
  if (x.totalDelta != null && x.totalDelta < -0.05) {
    return { tone: 'warn', title: '전환은 좋은데 매출이 줄었어요', body: '객단가·재방을 점검하세요. 관리(결마지) 비중을 올리면 선순환이 시작돼요(9강).' };
  }
  return { tone: 'good', title: '잘 돌아가고 있어요 — 물을 더 부으세요', body: '노출→전환이 건강해요. 이럴 땐 콘텐츠 양을 늘리거나 광고를 태워 전체 숫자를 키울 때예요(7·15·16강).' };
}

// ── 비교 그래프 (저번달/지난 분기/작년) ──

export type CompareType = 'prev_month' | 'prev_quarter' | 'last_year';

export interface TrendPoint {
  /** x축 라벨: '1일'(일별) | '1주차'(분기 주별) */
  label: string;
  curSales: number | null;
  cmpSales: number | null;
  curGuests: number | null;
  cmpGuests: number | null;
}

export interface ComparisonSeries {
  compare: CompareType;
  currentLabel: string;
  compareLabel: string;
  points: TrendPoint[];
  /** cur*는 현재 진행분 합, cmp*는 비교 기간 전체 합 (차트 문맥용) */
  totals: { curSales: number; cmpSales: number; curGuests: number; cmpGuests: number };
  /** 증감은 비교 기간을 현재 경과 일수만큼 잘라서 계산 (진행 중인 달 왜곡 방지) */
  salesDelta: number | null;
  guestsDelta: number | null;
  hasCurrentData: boolean;
  hasCompareData: boolean;
}

export interface ComparisonBundle {
  prevMonth: ComparisonSeries;
  prevQuarter: ComparisonSeries;
  lastYear: ComparisonSeries;
}

type DayValue = { sales: number; guests: number };

/** 기간 내 일별 {매출, 접객} — scope='branch' 행만 */
async function fetchDailySeries(branchId: string, start: string, end: string): Promise<Map<string, DayValue>> {
  const { data } = await getAdminSupabase()
    .from('metrics_daily')
    .select('date,new_sales,repeat_sales,guest_count')
    .eq('branch_id', branchId)
    .eq('scope', 'branch')
    .gte('date', start)
    .lte('date', end);
  const map = new Map<string, DayValue>();
  for (const r of data || []) {
    map.set(r.date as string, { sales: (r.new_sales || 0) + (r.repeat_sales || 0), guests: r.guest_count || 0 });
  }
  return map;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const dayIso = (y: number, m: number, d: number) => iso(new Date(Date.UTC(y, m, d)));

/**
 * 일별 값 배열 생성 (1일~N일).
 * - cutoff(오늘) 이후 날짜 → null (선이 멈춤)
 * - cutoff 이전인데 행이 없으면 0 (휴무/무매출일)
 * - 달 길이보다 큰 날짜(짧은 달 정렬용 패딩) → null
 */
function dailyValues(
  map: Map<string, DayValue>,
  y: number,
  m: number,
  len: number,
  cutoffIso: string | null,
): { sales: (number | null)[]; guests: (number | null)[] } {
  const monthLen = daysInMonth(y, m);
  const sales: (number | null)[] = [];
  const guests: (number | null)[] = [];
  for (let d = 1; d <= len; d++) {
    if (d > monthLen) {
      sales.push(null); guests.push(null); continue;
    }
    const ds = dayIso(y, m, d);
    if (cutoffIso && ds > cutoffIso) {
      sales.push(null); guests.push(null); continue;
    }
    const v = map.get(ds);
    sales.push(v ? v.sales : 0);
    guests.push(v ? v.guests : 0);
  }
  return { sales, guests };
}

/** 분기 일별 → 7일 주차 버킷 합산. 모든 날이 null이면 버킷도 null. */
function weeklyBuckets(days: (number | null)[], bucketCount: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let w = 0; w < bucketCount; w++) {
    const slice = days.slice(w * 7, w * 7 + 7);
    const vals = slice.filter((v): v is number => v != null);
    out.push(vals.length ? vals.reduce((a, b) => a + b, 0) : null);
  }
  return out;
}

const sumNonNull = (arr: (number | null)[]) => arr.reduce<number>((a, v) => a + (v ?? 0), 0);
/** 앞에서 n개까지만 합 (같은 경과 기준 비교용) */
const sumFirst = (arr: (number | null)[], n: number) => sumNonNull(arr.slice(0, n));

function buildSeries(
  compare: CompareType,
  currentLabel: string,
  compareLabel: string,
  labels: string[],
  cur: { sales: (number | null)[]; guests: (number | null)[] },
  cmp: { sales: (number | null)[]; guests: (number | null)[] },
  cmpHasRows: boolean,
): ComparisonSeries {
  const points: TrendPoint[] = labels.map((label, i) => ({
    label,
    curSales: cur.sales[i] ?? null,
    cmpSales: cmpHasRows ? (cmp.sales[i] ?? null) : null,
    curGuests: cur.guests[i] ?? null,
    cmpGuests: cmpHasRows ? (cmp.guests[i] ?? null) : null,
  }));
  const curSales = sumNonNull(cur.sales);
  const curGuests = sumNonNull(cur.guests);
  const cmpSales = sumNonNull(cmp.sales);
  const cmpGuests = sumNonNull(cmp.guests);
  // 현재 데이터가 있는 마지막 지점까지만 비교 기간을 잘라 증감 계산
  const elapsed = cur.sales.reduce<number>((last, v, i) => (v != null ? i + 1 : last), 0);
  const cmpSalesTrunc = sumFirst(cmp.sales, elapsed);
  const cmpGuestsTrunc = sumFirst(cmp.guests, elapsed);
  return {
    compare,
    currentLabel,
    compareLabel,
    points,
    totals: { curSales, cmpSales, curGuests, cmpGuests },
    salesDelta: cmpHasRows ? pct(curSales, cmpSalesTrunc) : null,
    guestsDelta: cmpHasRows ? pct(curGuests, cmpGuestsTrunc) : null,
    hasCurrentData: curSales > 0 || curGuests > 0,
    hasCompareData: cmpHasRows && (cmpSales > 0 || cmpGuests > 0),
  };
}

/** 저번달/지난 분기/작년 비교 시리즈 일괄 조회 (성과 페이지 서버 프리페치용) */
export async function fetchComparisonBundle(branchId: string, ref?: string): Promise<ComparisonBundle> {
  const base = ref ? new Date(ref + 'T00:00:00Z') : new Date();
  const todayIso = iso(base);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const q = Math.floor(m / 3); // 0~3

  // 5개 윈도우: 이번달 / 지난달 / 이번분기 / 지난분기 / 작년 같은달
  const curMonth = { y, m };
  const prevMonth = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
  const lastYearMonth = { y: y - 1, m };
  const curQ = { y, m: q * 3 };
  const prevQ = q === 0 ? { y: y - 1, m: 9 } : { y, m: (q - 1) * 3 };

  const monthRange = (w: { y: number; m: number }) => [dayIso(w.y, w.m, 1), dayIso(w.y, w.m, daysInMonth(w.y, w.m))] as const;
  const quarterRange = (w: { y: number; m: number }) => {
    const lastM = w.m + 2;
    return [dayIso(w.y, w.m, 1), dayIso(w.y, lastM, daysInMonth(w.y, lastM))] as const;
  };

  const [cmR, pmR, lyR, cqR, pqR] = [monthRange(curMonth), monthRange(prevMonth), monthRange(lastYearMonth), quarterRange(curQ), quarterRange(prevQ)];
  const [cm, pm, ly, cq, pq] = await Promise.all([
    fetchDailySeries(branchId, cmR[0], cmR[1]),
    fetchDailySeries(branchId, pmR[0], pmR[1]),
    fetchDailySeries(branchId, lyR[0], lyR[1]),
    fetchDailySeries(branchId, cqR[0], cqR[1]),
    fetchDailySeries(branchId, pqR[0], pqR[1]),
  ]);

  // 저번달: 일별, x축 = 두 달 중 긴 쪽
  const monthLen = Math.max(daysInMonth(curMonth.y, curMonth.m), daysInMonth(prevMonth.y, prevMonth.m));
  const dayLabels = Array.from({ length: monthLen }, (_, i) => `${i + 1}일`);
  const prevMonthSeries = buildSeries(
    'prev_month',
    `${curMonth.m + 1}월`,
    `${prevMonth.m + 1}월`,
    dayLabels,
    dailyValues(cm, curMonth.y, curMonth.m, monthLen, todayIso),
    dailyValues(pm, prevMonth.y, prevMonth.m, monthLen, null),
    pm.size > 0,
  );

  // 작년: 일별, 같은 달끼리
  const lyLen = Math.max(daysInMonth(curMonth.y, curMonth.m), daysInMonth(lastYearMonth.y, lastYearMonth.m));
  const lyLabels = Array.from({ length: lyLen }, (_, i) => `${i + 1}일`);
  const lastYearSeries = buildSeries(
    'last_year',
    `올해 ${m + 1}월`,
    `작년 ${m + 1}월`,
    lyLabels,
    dailyValues(cm, curMonth.y, curMonth.m, lyLen, todayIso),
    dailyValues(ly, lastYearMonth.y, lastYearMonth.m, lyLen, null),
    ly.size > 0,
  );

  // 분기: 92일 일별은 모바일에서 안 읽힘 → 7일 주차 버킷
  const quarterDays = (w: { y: number; m: number }, cutoff: string | null) => {
    const sales: (number | null)[] = [];
    const guests: (number | null)[] = [];
    const map = w === curQ ? cq : pq;
    for (let mm = w.m; mm <= w.m + 2; mm++) {
      const v = dailyValues(map, w.y, mm, daysInMonth(w.y, mm), cutoff);
      sales.push(...v.sales);
      guests.push(...v.guests);
    }
    return { sales, guests };
  };
  const curQDays = quarterDays(curQ, todayIso);
  const prevQDays = quarterDays(prevQ, null);
  const bucketCount = Math.ceil(Math.max(curQDays.sales.length, prevQDays.sales.length) / 7);
  const weekLabels = Array.from({ length: bucketCount }, (_, i) => `${i + 1}주차`);
  const prevQuarterSeries = buildSeries(
    'prev_quarter',
    `${q + 1}분기`,
    `${q === 0 ? 4 : q}분기`,
    weekLabels,
    { sales: weeklyBuckets(curQDays.sales, bucketCount), guests: weeklyBuckets(curQDays.guests, bucketCount) },
    { sales: weeklyBuckets(prevQDays.sales, bucketCount), guests: weeklyBuckets(prevQDays.guests, bucketCount) },
    pq.size > 0,
  );
  // 분기 증감은 주차 버킷(마지막 주 부분치 왜곡) 대신 일 단위 경과 기준으로 재계산
  if (pq.size > 0) {
    const elapsedDays = curQDays.sales.reduce<number>((last, v, i) => (v != null ? i + 1 : last), 0);
    prevQuarterSeries.salesDelta = pct(sumNonNull(curQDays.sales), sumFirst(prevQDays.sales, elapsedDays));
    prevQuarterSeries.guestsDelta = pct(sumNonNull(curQDays.guests), sumFirst(prevQDays.guests, elapsedDays));
  }

  return { prevMonth: prevMonthSeries, prevQuarter: prevQuarterSeries, lastYear: lastYearSeries };
}

// ── 전사 롤업 (본사 회사 현황) ──
export interface CompanyRollup {
  hasData: boolean;
  range: { label: string };
  sales: {
    total: number; new: number; repeat: number;
    totalDelta: number | null; newDelta: number | null; repeatDelta: number | null;
  };
}

/** 전 지점 metrics_daily 합산 (매출/신규/재방 + 직전 동기간 증감) */
export async function aggregateCompany(type: PeriodType, ref?: string): Promise<CompanyRollup> {
  const range = resolveRange(type, ref);
  const admin = getAdminSupabase();
  const q = (start: string, end: string) =>
    admin
      .from('metrics_daily')
      .select('new_sales,repeat_sales')
      .eq('scope', 'branch')
      .gte('date', start)
      .lte('date', end);
  const [{ data: cur }, { data: prev }] = await Promise.all([
    q(range.start, range.end),
    q(range.prevStart, range.prevEnd),
  ]);
  const sum = (rows: { new_sales: number; repeat_sales: number }[] | null) =>
    (rows || []).reduce((a, r) => ({ n: a.n + r.new_sales, rp: a.rp + r.repeat_sales }), { n: 0, rp: 0 });
  const c = sum(cur);
  const p = sum(prev);
  const total = c.n + c.rp;
  const prevTotal = p.n + p.rp;
  return {
    hasData: total > 0,
    range: { label: range.label },
    sales: {
      total, new: c.n, repeat: c.rp,
      totalDelta: pct(total, prevTotal), newDelta: pct(c.n, p.n), repeatDelta: pct(c.rp, p.rp),
    },
  };
}

// ── 아카데미 마케팅 (아임웹) ──
export interface AcademyDashboard {
  hasData: boolean;
  range: { label: string };
  totals: { visits: number; visitors: number; signups: number; buyers: number; purchaseAmount: number };
  funnel: { signupRate: number | null; purchaseRate: number | null; avgOrder: number };
  channels: { channel: string; visitors: number; ratio: number }[];
}

export async function aggregateMarketing(type: PeriodType, ref?: string): Promise<AcademyDashboard> {
  const range = resolveRange(type, ref);
  const { data } = await getAdminSupabase()
    .from('marketing_daily')
    .select('channel,total_visits,visitors,signups,buyers,purchase_amount')
    .gte('date', range.start)
    .lte('date', range.end);

  const byChannel = new Map<string, number>();
  let visits = 0, visitors = 0, signups = 0, buyers = 0, purchaseAmount = 0;
  for (const r of data || []) {
    visits += r.total_visits; visitors += r.visitors; signups += r.signups;
    buyers += r.buyers; purchaseAmount += r.purchase_amount;
    byChannel.set(r.channel, (byChannel.get(r.channel) || 0) + r.visitors);
  }
  const channels = [...byChannel.entries()]
    .map(([channel, v]) => ({ channel, visitors: v, ratio: visitors > 0 ? v / visitors : 0 }))
    .sort((a, b) => b.visitors - a.visitors);

  return {
    hasData: visitors > 0 || visits > 0,
    range: { label: range.label },
    totals: { visits, visitors, signups, buyers, purchaseAmount },
    funnel: {
      signupRate: visitors > 0 ? signups / visitors : null,
      purchaseRate: visitors > 0 ? buyers / visitors : null,
      avgOrder: buyers > 0 ? Math.round(purchaseAmount / buyers) : 0,
    },
    channels,
  };
}
