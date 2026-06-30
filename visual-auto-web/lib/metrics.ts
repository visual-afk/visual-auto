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
