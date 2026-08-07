import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
import { AREA_SEED, FUNNEL_AREAS, type AreaDef, type MetricDef } from '@/lib/strategy/seed';
import { getLiveMetricValues, type LiveMap } from '@/lib/strategy/wire';
import {
  metricStatus,
  areaStatus,
  type ResolvedArea,
  type ResolvedMetric,
  type CauseCandidate,
  type Experiment,
  type MeetingSummary,
} from '@/lib/strategy/model';
import StrategyRoom from '@/components/strategy/StrategyRoom';

export const dynamic = 'force-dynamic';

// ── DB row 타입 (테이블 없으면 전부 폴백) ──
type DbArea = {
  id: string; name: string; type: string; subtitle: string | null; owner_name: string | null;
  money_formula: string | null; current_problem: string | null; cause_note: string | null;
  decide_next: string | null; sort_order: number;
};
type DbMetric = {
  id: string; area_id: string; key: string; name: string; unit: string | null; direction: string;
  source: string; live_key: string | null; seed_value: number | null; seed_context: string | null;
  is_unknown: boolean; archived: boolean; sort_order: number;
};
type DbMetricValue = { metric_id: string; value: number | null; context_note: string | null; week_of: string; entered_at: string };
type DbCause = { id: string; area_id: string; text: string; approved: boolean };
type DbExp = {
  id: string; area_id: string; phenomenon: string | null; hypothesis: string | null; prediction: string | null;
  action: string | null; assignee_name: string | null; due_date: string | null; check_metric_id: string | null;
  status: string; result_value: string | null; result_note: string | null; learned: string | null;
  promotion: string | null; updated_at: string;
};
type DbMeeting = { id: string; meeting_date: string; attendees: unknown; minutes: unknown; created_at: string };

async function q<T>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await p;
    return data ?? [];
  } catch {
    return [];
  }
}

function fmtMetric(value: number, unit: string | null): string {
  if (!unit) return value.toLocaleString();
  if (unit === '%' || unit === '%p') return `${value}${unit}`;
  if (unit.startsWith('/')) return `${value}${unit}`; // 예: 0/30
  if (unit === '회') return value.toLocaleString();
  return `${value.toLocaleString()}${unit}`;
}

export default async function StrategyPage() {
  const me = await getMember();
  if (!me) redirect('/login');
  if (me.role !== 'hq_admin') redirect('/');

  const admin = getAdminSupabase();
  const today = kstTodayStr();

  const [live, dbAreas, dbMetrics, dbValues, dbCauses, dbExps, dbMeetings] = await Promise.all([
    getLiveMetricValues().catch(() => new Map() as LiveMap),
    q<DbArea>(admin.from('strategy_areas').select('*').order('sort_order')),
    q<DbMetric>(admin.from('strategy_metrics').select('*').eq('archived', false).order('sort_order')),
    q<DbMetricValue>(admin.from('strategy_metric_values').select('metric_id, value, context_note, week_of, entered_at').order('week_of', { ascending: false })),
    q<DbCause>(admin.from('strategy_cause_candidates').select('id, area_id, text, approved').order('created_at')),
    q<DbExp>(admin.from('strategy_experiments').select('*').order('updated_at', { ascending: false })),
    q<DbMeeting>(admin.from('strategy_meetings').select('id, meeting_date, attendees, minutes, created_at').order('meeting_date', { ascending: false }).limit(20)),
  ]);

  const useDb = dbAreas.length > 0 && dbMetrics.length > 0;

  // metric_id → 최신 수동 입력값
  const latestValue = new Map<string, DbMetricValue>();
  for (const v of dbValues) if (!latestValue.has(v.metric_id)) latestValue.set(v.metric_id, v);

  // ── 지표 해석 (DB 우선, 없으면 seed) ──
  function resolveFromDef(areaId: string, syntheticId: string, def: MetricDef): ResolvedMetric {
    return resolveMetric({
      id: syntheticId, areaId, key: def.key, name: def.name, unit: def.unit, direction: def.direction,
      source: def.source, liveKey: def.liveKey, seedValue: def.seedValue, seedContext: def.seedContext,
      isUnknown: def.isUnknown, manual: null,
    });
  }
  function resolveFromDb(mrow: DbMetric): ResolvedMetric {
    const mv = latestValue.get(mrow.id) ?? null;
    return resolveMetric({
      id: mrow.id, areaId: mrow.area_id, key: mrow.key, name: mrow.name, unit: mrow.unit,
      direction: (mrow.direction as ResolvedMetric['direction']) ?? '높을수록좋음',
      source: (mrow.source as ResolvedMetric['source']) ?? 'manual', liveKey: mrow.live_key,
      seedValue: mrow.seed_value, seedContext: mrow.seed_context, isUnknown: mrow.is_unknown,
      manual: mv ? { value: mv.value, context: mv.context_note } : null,
    });
  }

  function resolveMetric(x: {
    id: string; areaId: string; key: string; name: string; unit: string | null;
    direction: ResolvedMetric['direction']; source: ResolvedMetric['source']; liveKey: string | null;
    seedValue: number | null; seedContext: string | null; isUnknown: boolean;
    manual: { value: number | null; context: string | null } | null;
  }): ResolvedMetric {
    let value: number | null = null;
    let context: string | null = x.seedContext;
    let deltaPct: number | null = null;

    if (x.source === 'live' && x.liveKey) {
      const lv = live.get(x.liveKey);
      if (lv && lv.value != null) {
        value = lv.value;
        context = lv.context;
        deltaPct = lv.deltaPct;
      } else {
        context = '미측정';
      }
    } else if (x.manual && x.manual.value != null) {
      value = x.manual.value;
      context = x.manual.context ?? x.seedContext;
    } else if (!x.isUnknown && x.seedValue != null) {
      value = x.seedValue;
    } else {
      context = x.seedContext ?? '미측정';
    }

    return {
      id: x.id, areaId: x.areaId, key: x.key, name: x.name, unit: x.unit, direction: x.direction,
      source: x.source, isUnknown: x.isUnknown,
      value,
      display: value == null ? null : fmtMetric(value, x.unit),
      deltaPct, context,
      status: metricStatus(value, x.isUnknown),
    };
  }

  // ── 원인 후보 / 실험 인덱싱 ──
  const causesByArea = new Map<string, CauseCandidate[]>();
  for (const c of dbCauses) {
    const arr = causesByArea.get(c.area_id) ?? [];
    arr.push({ id: c.id, text: c.text, approved: c.approved });
    causesByArea.set(c.area_id, arr);
  }

  const metricNameById = new Map<string, string>();
  for (const mr of dbMetrics) metricNameById.set(mr.id, mr.name);

  const allExperiments: Experiment[] = dbExps.map((e) => {
    const overdue = !!e.due_date && e.due_date < today && e.status !== '완료';
    return {
      id: e.id, areaId: e.area_id, phenomenon: e.phenomenon, hypothesis: e.hypothesis, prediction: e.prediction,
      action: e.action, assigneeName: e.assignee_name, dueDate: e.due_date, checkMetricId: e.check_metric_id,
      checkMetricName: e.check_metric_id ? metricNameById.get(e.check_metric_id) ?? null : null,
      status: (e.status as Experiment['status']) ?? '설계중',
      resultValue: e.result_value, resultNote: e.result_note, learned: e.learned,
      promotion: (e.promotion as Experiment['promotion']) ?? null, overdue,
    };
  });
  const activeByArea = new Map<string, Experiment>();
  for (const e of allExperiments) {
    if (e.status === '완료') continue;
    if (!activeByArea.has(e.areaId)) activeByArea.set(e.areaId, e); // dbExps는 updated_at desc → 최신
  }

  // ── 영역 조립 ──
  const dbAreaById = new Map(dbAreas.map((a) => [a.id, a]));
  const dbMetricsByArea = new Map<string, DbMetric[]>();
  for (const mr of dbMetrics) {
    const arr = dbMetricsByArea.get(mr.area_id) ?? [];
    arr.push(mr);
    dbMetricsByArea.set(mr.area_id, arr);
  }

  const areas: ResolvedArea[] = AREA_SEED.map((seed: AreaDef): ResolvedArea => {
    const dbA = dbAreaById.get(seed.id);
    const metrics: ResolvedMetric[] =
      useDb && dbMetricsByArea.get(seed.id)?.length
        ? dbMetricsByArea.get(seed.id)!.map(resolveFromDb)
        : seed.metrics.map((def) => resolveFromDef(seed.id, `${seed.id}:${def.key}`, def));

    const headlineLv = seed.headlineLiveKey ? live.get(seed.headlineLiveKey) : undefined;
    const headline = headlineLv && (headlineLv.display || headlineLv.value != null)
      ? { display: headlineLv.display ?? String(headlineLv.value), deltaPct: headlineLv.deltaPct, context: headlineLv.context }
      : null;

    const active = activeByArea.get(seed.id) ?? null;
    const status = areaStatus(metrics, !!active?.overdue);

    return {
      id: seed.id,
      name: dbA?.name ?? seed.name,
      type: seed.type,
      subtitle: dbA?.subtitle ?? seed.subtitle,
      ownerName: dbA?.owner_name ?? seed.ownerName,
      moneyFormula: dbA?.money_formula ?? seed.moneyFormula,
      headline,
      currentProblem: dbA?.current_problem ?? null,
      causeNote: dbA?.cause_note ?? null,
      decideNext: dbA?.decide_next ?? null,
      metrics,
      causeCandidates: causesByArea.get(seed.id) ?? [],
      activeExperiment: active,
      isFunnel: FUNNEL_AREAS.has(seed.id),
      status,
      dataDate: today,
    };
  });

  const meetings: MeetingSummary[] = dbMeetings.map((mt) => ({
    id: mt.id,
    meetingDate: mt.meeting_date,
    attendees: Array.isArray(mt.attendees) ? (mt.attendees as string[]) : [],
    minutes: (mt.minutes as Record<string, unknown>) ?? {},
    createdAt: mt.created_at,
  }));

  // 실험 보드/회의 담당자 후보 (본사 계정)
  const staff = await q<{ display_name: string }>(
    admin.from('branch_users').select('display_name').eq('is_active', true).order('display_name'),
  );
  const assignees = [...new Set(staff.map((s) => s.display_name).filter(Boolean))];

  return (
    <StrategyRoom
      areas={areas}
      experiments={allExperiments}
      meetings={meetings}
      assignees={assignees}
      dbReady={useDb}
      today={today}
    />
  );
}
