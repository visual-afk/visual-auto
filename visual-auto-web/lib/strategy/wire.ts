/**
 * 본사전략실 LIVE 지표 연결.
 * 기존 집계함수/테이블에서 지금 뽑을 수 있는 실데이터를 live_key별로 계산해 Map으로 돌려준다.
 * 실패한 키는 생략 → 화면에서 '미측정'으로 표시된다. (테이블 미적용 환경에서도 페이지가 안 죽음)
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { resolveRange, aggregateCompany, aggregateMarketing } from '@/lib/metrics';
import { aggregateBrand } from '@/lib/product-metrics';
import { aggregateOpsHealth } from '@/lib/ops-health';

export interface LiveValue {
  /** 지표 카드용 숫자 (매출 헤드라인은 display만 채움) */
  value: number | null;
  deltaPct: number | null;
  context: string | null;
  /** 헤드라인 매출 등 사전 포맷 문자열 */
  display?: string;
}

export type LiveMap = Map<string, LiveValue>;

function fmtWon(n: number): string {
  if (Math.abs(n) >= 10000) return `${Math.round(n / 10000).toLocaleString()}만원`;
  return `${Math.round(n).toLocaleString()}원`;
}

/** 모든 LIVE 지표를 한 번에 계산. 개별 실패는 삼켜서 해당 키만 비운다. */
export async function getLiveMetricValues(): Promise<LiveMap> {
  const out: LiveMap = new Map();
  const admin = getAdminSupabase();
  const range = resolveRange('month');

  const safe = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch {
      /* 키 생략 → 미측정 */
    }
  };

  // 본사/지점 매출 헤드라인
  await safe(async () => {
    const c = await aggregateCompany('month');
    if (c.hasData) {
      const v: LiveValue = { value: c.sales.total, deltaPct: c.sales.totalDelta, context: c.range.label, display: fmtWon(c.sales.total) };
      out.set('company_sales', v);
    }
  });

  // 지점 재방률 편차 + 체크리스트 준수율
  await safe(async () => {
    const { data: branches } = await admin.from('branches').select('id, name').eq('kind', 'salon');
    const list = branches ?? [];
    const { data: rows } = await admin
      .from('metrics_daily')
      .select('branch_id, new_sales, repeat_sales')
      .eq('scope', 'branch')
      .gte('date', range.start)
      .lte('date', range.end);
    const agg = new Map<string, { n: number; r: number }>();
    for (const row of rows ?? []) {
      const a = agg.get(row.branch_id) || { n: 0, r: 0 };
      a.n += row.new_sales || 0;
      a.r += row.repeat_sales || 0;
      agg.set(row.branch_id, a);
    }
    const rates: { name: string; rate: number }[] = [];
    for (const [bid, a] of agg) {
      const total = a.n + a.r;
      if (total <= 0) continue;
      const name = list.find((b) => b.id === bid)?.name ?? '';
      rates.push({ name, rate: (a.r / total) * 100 });
    }
    if (rates.length >= 2) {
      rates.sort((x, y) => y.rate - x.rate);
      const hi = rates[0];
      const lo = rates[rates.length - 1];
      out.set('branch_revisit_dev', {
        value: Math.round((hi.rate - lo.rate) * 10) / 10,
        deltaPct: null,
        context: `${hi.name} ${Math.round(hi.rate)} / ${lo.name} ${Math.round(lo.rate)}`,
      });
    }

    const ops = await aggregateOpsHealth(list).catch(() => null);
    if (ops) {
      const pcts = list.map((b) => ops.health.get(b.id)?.openCheckPct7).filter((p): p is number => p != null);
      if (pcts.length > 0) {
        const avg = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
        out.set('branch_checklist', { value: avg, deltaPct: null, context: `${pcts.length}개 지점 평균` });
      }
      out.set('anxiety_cases', { value: ops.crises.length, deltaPct: null, context: '지금 챙길 운영 신호' });
    }
  });

  // 고객 퍼널: 노출(블로그 조회수 누적) + 예약 전환(접객수)
  await safe(async () => {
    const { data: posts } = await admin.from('posts').select('views');
    const exposure = (posts ?? []).reduce((s, p) => s + (p.views || 0), 0);
    if (exposure > 0) out.set('customer_exposure', { value: exposure, deltaPct: null, context: '전 지점 블로그 누적' });
  });
  await safe(async () => {
    const { data: rows } = await admin
      .from('metrics_daily')
      .select('guest_count')
      .eq('scope', 'branch')
      .gte('date', range.start)
      .lte('date', range.end);
    const guests = (rows ?? []).reduce((s, r) => s + (r.guest_count || 0), 0);
    if (guests > 0) out.set('customer_booking', { value: guests, deltaPct: null, context: '이번 달 접객수' });
  });

  // 아카데미: 매출(브랜드) + 설명회 신청 + 수강 전환율(아임웹 마케팅)
  await safe(async () => {
    const mk = await aggregateMarketing('month');
    if (mk.hasData) {
      out.set('academy_briefing', { value: mk.totals.signups, deltaPct: null, context: mk.range.label });
      if (mk.funnel.purchaseRate != null)
        out.set('academy_enroll_rate', { value: Math.round(mk.funnel.purchaseRate * 1000) / 10, deltaPct: null, context: '방문→수강' });
    }
  });

  // 브랜드(제품) 매출 3종 + 누혜 판매 건수
  await safe(async () => {
    const { data: brands } = await admin.from('branches').select('id, name').eq('kind', 'brand');
    const byName = new Map((brands ?? []).map((b) => [b.name, b.id] as const));
    const jobs: { name: string; salesKey: string; ordersKey?: string }[] = [
      { name: '아카데미', salesKey: 'academy_sales' },
      { name: '트리필드', salesKey: 'trifield_sales' },
      { name: '누혜', salesKey: 'nuhye_sales', ordersKey: 'nuhye_orders' },
    ];
    for (const j of jobs) {
      const bid = byName.get(j.name);
      if (!bid) continue;
      const d = await aggregateBrand(bid, 'month').catch(() => null);
      if (!d || !d.hasData) continue;
      out.set(j.salesKey, { value: d.sales.total, deltaPct: d.sales.totalDelta, context: d.range.label, display: fmtWon(d.sales.total) });
      if (j.ordersKey) out.set(j.ordersKey, { value: d.orders, deltaPct: null, context: d.range.label });
    }
  });

  // 불안: 승격된 실험 카드 수
  await safe(async () => {
    const { count } = await admin
      .from('strategy_experiments')
      .select('id', { count: 'exact', head: true })
      .eq('promotion', '승격');
    out.set('anxiety_promoted', { value: count ?? 0, deltaPct: null, context: '누적 승격' });
  });

  return out;
}
