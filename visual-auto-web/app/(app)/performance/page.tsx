import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { fetchMemberBranchMap, effectiveBranchIds } from '@/lib/memberBranches';
import { aggregateBranch, aggregateCompany, fetchComparisonBundle, type PeriodType } from '@/lib/metrics';
import PerformanceDashboard, { type BranchOpt } from '@/components/PerformanceDashboard';
import ComparisonChartSection from '@/components/ComparisonChartSection';
import CompanyStatusBoard, { type BranchChip, type Crisis, type Kpi } from '@/components/CompanyStatusBoard';
import DesignerBreakdown from '@/components/DesignerBreakdown';
import PlaceStatsSection, { type PlaceStatRow } from '@/components/PlaceStatsSection';

export const dynamic = 'force-dynamic';

/** 원(won) → "3억 1,200만" 컴팩트 표기 */
function formatKRW(won: number): string {
  const eok = Math.floor(won / 100_000_000);
  const man = Math.round((won % 100_000_000) / 10_000);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString()}만` : `${eok}억`;
  return `${man.toLocaleString()}만`;
}

/** 본사 회사 현황 보드 데이터 조립 — 실데이터(원장 공석·지점 목록·매출 롤업) + 부족분 목업 */
async function CompanyBoard({ period, refDate }: { period: PeriodType; refDate?: string }) {
  const admin = getAdminSupabase();
  const [{ data: branchesData }, { data: membersData }, memberBranchMap, rollup] = await Promise.all([
    // 글쓰기 전용 브랜드(kind='brand')는 성과 보드 대상 아님
    admin.from('branches').select('id, name').eq('kind', 'salon').order('name'),
    admin.from('branch_users').select('user_id, branch_id, role, is_active').eq('is_active', true),
    fetchMemberBranchMap(admin),
    aggregateCompany(period, refDate),
  ]);
  const branches = branchesData ?? [];
  const members = (membersData ?? []) as { user_id: string; branch_id: string | null; role: string }[];
  const hasOwner = (bid: string) =>
    members.some(
      (m) => m.role === 'branch_owner' && effectiveBranchIds(memberBranchMap, m.user_id, m.branch_id).includes(bid),
    );

  // 지점 상태: 원장 공석 → 위기(실데이터), 그 외 정상
  const branchChips: BranchChip[] = branches.map((b) => ({
    id: b.id,
    name: b.name,
    status: (hasOwner(b.id) ? 'ok' : 'crisis') as BranchChip['status'],
  }));

  // 위기: 원장 공석(실데이터 트리거) + 부가 수치는 목업
  const crises: Crisis[] = [];
  for (const b of branches) {
    if (!hasOwner(b.id)) crises.push({ title: `${b.name} 원장 공석`, detail: '3주째 — 이행률 40%로 추락' });
  }

  // KPI: metrics_daily 있으면 실집계, 없으면 목업 폴백
  const kpis: Kpi[] = rollup.hasData
    ? [
        { label: '전사 매출', value: formatKRW(rollup.sales.total), delta: rollup.sales.totalDelta },
        { label: '신규', value: formatKRW(rollup.sales.new), delta: rollup.sales.newDelta },
        { label: '재방', value: formatKRW(rollup.sales.repeat), delta: rollup.sales.repeatDelta },
      ]
    : [
        { label: '전사 매출', value: '3억 1,200만', delta: 0.04 },
        { label: '신규', value: '9,400만', delta: 0.09 },
        { label: '재방', value: '2억 1,800만', delta: -0.03 },
      ];

  return (
    <CompanyStatusBoard monthLabel={rollup.range.label} crises={crises} kpis={kpis} branches={branchChips} />
  );
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** 기간 네비게이션 — 월간은 달 단위, 주간은 월~일 주 단위로 이전/다음 ref 계산 */
function buildPeriodNav(period: PeriodType, refDate: string) {
  const base = new Date(refDate + 'T00:00:00Z');
  const todayIso = isoDay(new Date());
  if (period === 'week') {
    const monday = new Date(base);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const prev = new Date(monday);
    prev.setUTCDate(prev.getUTCDate() - 7);
    const next = new Date(monday);
    next.setUTCDate(next.getUTCDate() + 7);
    return { prevRef: isoDay(prev), nextRef: isoDay(next), canGoNext: isoDay(next) <= todayIso };
  }
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1));
  return {
    prevRef: isoDay(new Date(Date.UTC(y, m - 1, 1))),
    nextRef: isoDay(next),
    canGoNext: isoDay(next) <= todayIso,
  };
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; period?: string; ref?: string }>;
}) {
  const me = (await getMember())!;
  if (me.role === 'designer' || me.role === 'intern') redirect('/track');

  const sp = await searchParams;
  const period: PeriodType = sp.period === 'week' ? 'week' : 'month';
  // 기준일: ?ref=YYYY-MM-DD (유효하지 않으면 오늘)
  const refParam =
    sp.ref && /^\d{4}-\d{2}-\d{2}$/.test(sp.ref) && !isNaN(new Date(sp.ref + 'T00:00:00Z').getTime())
      ? sp.ref
      : null;
  const refDate = refParam ?? isoDay(new Date());
  const admin = getAdminSupabase();
  const isHq = me.role === 'hq_admin';

  // 본사: 전 지점 선택 / 멀티지점 원장: 소속 지점 선택 / 단일지점 원장: 자기 지점
  const canPickBranch = isHq || me.branchIds.length > 1;
  let branchOpts: BranchOpt[] = [];
  let branchId: string | null = me.branchId;
  let branchName = me.branchName;
  if (canPickBranch) {
    let bq = admin.from('branches').select('id, name, handsos_pk').eq('kind', 'salon').order('name');
    if (!isHq) bq = bq.in('id', me.branchIds);
    const { data } = await bq;
    branchOpts = (data ?? []).map((b) => ({ id: b.id, name: b.name, hasSource: !!b.handsos_pk }));
    const picked = sp.branch && branchOpts.some((b) => b.id === sp.branch) ? sp.branch : null;
    branchId =
      picked || (isHq ? branchOpts.find((b) => b.hasSource)?.id : me.branchId) || branchOpts[0]?.id || null;
    branchName = branchOpts.find((b) => b.id === branchId)?.name ?? null;
  }

  // 본사는 회사 현황 보드를 항상 위에 얹고, 아래에 지점 성과 대시보드
  if (!branchId) {
    return (
      <div className="py-6 md:py-0">
        {isHq && <CompanyBoard period={period} refDate={refDate} />}
        {!isHq && (
          <div className="py-10 text-center text-sm text-ink-faint">연결된 지점이 없어요.</div>
        )}
      </div>
    );
  }

  const [data, comparisonBundle, { data: earliest }] = await Promise.all([
    aggregateBranch(branchId, period, refDate),
    fetchComparisonBundle(branchId, refDate),
    admin.from('metrics_daily').select('date').order('date', { ascending: true }).limit(1).maybeSingle(),
  ]);

  // 월 점프 드롭다운: 데이터가 있는 가장 이른 달 ~ 이번 달 (최신순)
  const nav = buildPeriodNav(period, refDate);
  const monthOptions: { ref: string; label: string }[] = [];
  {
    const from = (earliest as { date?: string } | null)?.date ?? isoDay(new Date());
    const cur = new Date();
    let y = cur.getUTCFullYear();
    let m = cur.getUTCMonth();
    const [fy, fm] = [Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1];
    while (y > fy || (y === fy && m >= fm)) {
      monthOptions.push({ ref: isoDay(new Date(Date.UTC(y, m, 1))), label: `${y}년 ${m + 1}월` });
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
  }

  // 플레이스 통계 스냅샷 (스마트플레이스 스크린샷 OCR로 쌓인 기록)
  const { data: placeRows } = await admin
    .from('place_stats')
    .select('id, stat_date, period, place_views, inflows, review_count')
    .eq('branch_id', branchId)
    .order('stat_date', { ascending: false })
    .limit(8);

  // 마지막 동기화 시각
  const { data: last } = await admin
    .from('metrics_daily')
    .select('created_at')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 하이드레이션 안전: 날짜 포맷은 서버에서 1회만(KST 고정) → 클라이언트는 문자열 그대로 사용
  const lastSyncedAt = (last as { created_at?: string } | null)?.created_at ?? null;
  const syncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul',
      })
    : '동기화 없음';

  return (
    <div className="space-y-8 py-6 md:py-0">
      {isHq && <CompanyBoard period={period} refDate={refDate} />}
      <PerformanceDashboard
        data={data}
        period={period}
        branchId={branchId}
        branchName={branchName}
        branchOpts={branchOpts}
        isHq={isHq}
        canPickBranch={canPickBranch}
        syncedLabel={syncedLabel}
        refDate={refDate}
        prevRef={nav.prevRef}
        nextRef={nav.nextRef}
        canGoNext={nav.canGoNext}
        monthOptions={monthOptions}
      />
      {data.hasData && <ComparisonChartSection bundle={comparisonBundle} />}
      <PlaceStatsSection rows={(placeRows ?? []) as PlaceStatRow[]} branchId={branchId} />
      <DesignerBreakdown branchId={branchId} period={period} refDate={refDate} />
    </div>
  );
}
