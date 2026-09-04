'use client';

import { useRef, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ComparisonBundle, ComparisonSeries, CompareType } from '@/lib/metrics';

// 차트 시리즈 색 — 팔레트 검증 통과(대비 3:1·CVD 분리·채도): 현재=브랜드 블루, 비교=앰버 점선
const CUR_COLOR = '#5b7fd4';
const CMP_COLOR = '#b87f26';
const GRID_COLOR = '#e8e6e1'; // line 토큰

type MetricKey = 'sales' | 'guests';

const won = (n: number) =>
  n === 0
    ? '0'
    : Math.abs(n) >= 100_000_000
      ? `${(n / 100_000_000).toFixed(1)}억`
      : `${Math.round(n / 10_000).toLocaleString()}만`;
const fmtValue = (metric: MetricKey, v: number, unit: string) =>
  metric === 'sales' ? `${won(v)}원` : `${v.toLocaleString()}${unit}`;
const fmtAxis = (metric: MetricKey, v: number) => (metric === 'sales' ? won(v) : v.toLocaleString());

function Delta({ v }: { v: number | null }) {
  if (v == null) return null;
  const up = v >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? 'text-ok' : 'text-warn'}`}>
      <Icon size={12} />
      {Math.abs(Math.round(v * 100))}%
    </span>
  );
}

/** 눈금 상한을 보기 좋은 수로 올림 (1/2/2.5/5 × 10^k) */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

const VB_W = 560;
const VB_H = 220;
const PAD = { l: 48, r: 10, t: 10, b: 26 };

function LineChart({
  series,
  metric,
  secondaryLabel,
  secondaryUnit,
}: {
  series: ComparisonSeries;
  metric: MetricKey;
  secondaryLabel: string;
  secondaryUnit: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const cur = series.points.map((p) => (metric === 'sales' ? p.curSales : p.curGuests));
  const cmp = series.points.map((p) => (metric === 'sales' ? p.cmpSales : p.cmpGuests));
  const n = series.points.length;

  const nonNull = [...cur, ...cmp].filter((v): v is number => v != null);
  const maxVal = Math.max(1, ...nonNull);
  const yMax = niceCeil(maxVal);
  // 환불이 매출보다 큰 날은 음수 — 스케일을 0 밑으로 확장 (살롱 데이터는 항상 yMin=0)
  const minVal = Math.min(0, ...nonNull);
  const yMin = minVal < 0 ? -niceCeil(-minVal) : 0;
  const plotW = VB_W - PAD.l - PAD.r;
  const plotH = VB_H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v: number) => PAD.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  /** null에서 끊기는 연속 구간별 경로 */
  const linePath = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  /** 현재 시리즈 아래 은은한 면 채움 (연속 구간별) — 기준선은 0 */
  const areaPath = (vals: (number | null)[]) => {
    const base = y(0);
    let d = '';
    let run: number[] = [];
    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      d += `M${x(run[0]).toFixed(1)},${base.toFixed(1)}`;
      for (const i of run) d += `L${x(i).toFixed(1)},${y(vals[i]!).toFixed(1)}`;
      d += `L${x(run[run.length - 1]).toFixed(1)},${base.toFixed(1)}Z`;
      run = [];
    };
    vals.forEach((v, i) => (v == null ? flush() : run.push(i)));
    flush();
    return d;
  };

  // x축 희소 틱 (~4개)
  const tickIdxs = n <= 4 ? cur.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * VB_W;
    const i = Math.round(((px - PAD.l) / plotW) * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, i)));
  };

  const hover = hoverIdx != null ? { i: hoverIdx, cur: cur[hoverIdx], cmp: cmp[hoverIdx], label: series.points[hoverIdx].label } : null;
  const tooltipLeftPct = hover ? (x(hover.i) / VB_W) * 100 : 0;
  const flip = tooltipLeftPct > 55;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`${series.currentLabel}와 ${series.compareLabel} ${metric === 'sales' ? '매출' : secondaryLabel} 비교 그래프`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* 그리드 (하한 / 중간 / 상한) + y 라벨 */}
        {[0, 0.5, 1].map((t) => {
          const gy = PAD.t + plotH - t * plotH;
          return (
            <g key={t}>
              <line x1={PAD.l} x2={VB_W - PAD.r} y1={gy} y2={gy} stroke={GRID_COLOR} strokeWidth={1} />
              <text x={PAD.l - 6} y={gy + 4} textAnchor="end" fontSize={11} fill="#9a9aa2">
                {fmtAxis(metric, yMin + (yMax - yMin) * t)}
              </text>
            </g>
          );
        })}
        {/* 음수 구간이 있으면 0 기준선 표시 */}
        {yMin < 0 && <line x1={PAD.l} x2={VB_W - PAD.r} y1={y(0)} y2={y(0)} stroke="#9a9aa2" strokeWidth={1} strokeDasharray="2 3" />}
        {/* x 라벨 */}
        {tickIdxs.map((i) => (
          <text key={i} x={x(i)} y={VB_H - 8} textAnchor="middle" fontSize={11} fill="#9a9aa2">
            {series.points[i].label}
          </text>
        ))}

        {/* 비교(점선) → 현재(실선+면) 순서로 현재가 위에 오도록 */}
        <path d={linePath(cmp)} fill="none" stroke={CMP_COLOR} strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" strokeLinecap="round" />
        <path d={areaPath(cur)} fill={CUR_COLOR} opacity={0.1} />
        <path d={linePath(cur)} fill="none" stroke={CUR_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* 크로스헤어 + 마커 */}
        {hover && (
          <g>
            <line x1={x(hover.i)} x2={x(hover.i)} y1={PAD.t} y2={PAD.t + plotH} stroke="#9a9aa2" strokeWidth={1} />
            {hover.cmp != null && <circle cx={x(hover.i)} cy={y(hover.cmp)} r={4} fill={CMP_COLOR} stroke="#ffffff" strokeWidth={2} />}
            {hover.cur != null && <circle cx={x(hover.i)} cy={y(hover.cur)} r={4} fill={CUR_COLOR} stroke="#ffffff" strokeWidth={2} />}
          </g>
        )}
      </svg>

      {/* 툴팁: 해당 x의 두 시리즈 값 모두 표시 */}
      {hover && (hover.cur != null || hover.cmp != null) && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-card"
          style={flip ? { right: `${100 - tooltipLeftPct + 2}%` } : { left: `${tooltipLeftPct + 2}%` }}
        >
          <p className="font-semibold text-ink">{hover.label}</p>
          {hover.cur != null && (
            <p className="mt-0.5 flex items-center gap-1.5 text-ink-soft">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: CUR_COLOR }} />
              {series.currentLabel} <b className="text-ink">{fmtValue(metric, hover.cur, secondaryUnit)}</b>
            </p>
          )}
          {hover.cmp != null && (
            <p className="mt-0.5 flex items-center gap-1.5 text-ink-soft">
              <span className="inline-block h-0.5 w-3 rounded border-t-2 border-dashed" style={{ borderColor: CMP_COLOR }} />
              {series.compareLabel} <b className="text-ink">{fmtValue(metric, hover.cmp, secondaryUnit)}</b>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const COMPARE_TABS: { key: CompareType; label: string }[] = [
  { key: 'prev_month', label: '저번달' },
  { key: 'prev_quarter', label: '지난 분기' },
  { key: 'last_year', label: '작년' },
];

export default function ComparisonChartSection({
  bundle,
  secondaryLabel = '객수',
  secondaryUnit = '명',
}: {
  bundle: ComparisonBundle;
  /** 보조 지표 이름/단위 — 살롱: 객수·명, 제품 브랜드: 주문·건 */
  secondaryLabel?: string;
  secondaryUnit?: string;
}) {
  const [compare, setCompare] = useState<CompareType>('prev_month');
  const [metric, setMetric] = useState<MetricKey>('sales');

  const series: ComparisonSeries =
    compare === 'prev_month' ? bundle.prevMonth : compare === 'prev_quarter' ? bundle.prevQuarter : bundle.lastYear;

  const curTotal = metric === 'sales' ? series.totals.curSales : series.totals.curGuests;
  const delta = metric === 'sales' ? series.salesDelta : series.guestsDelta;
  const rows = series.points.filter((p) => p.curSales != null || p.cmpSales != null);

  return (
    <section>
      <h2 className="text-base font-bold">매출 흐름 비교</h2>

      {/* 비교 대상 + 지표 전환 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-canvas p-1">
          {COMPARE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setCompare(t.key)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${compare === t.key ? 'bg-brand text-brand-ink' : 'text-ink-soft'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full bg-canvas p-1">
          {(['sales', 'guests'] as MetricKey[]).map((mKey) => (
            <button
              key={mKey}
              onClick={() => setMetric(mKey)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${metric === mKey ? 'bg-brand text-brand-ink' : 'text-ink-soft'}`}
            >
              {mKey === 'sales' ? '매출' : secondaryLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-xl2 border border-line bg-surface p-4">
        {!series.hasCurrentData && !series.hasCompareData ? (
          <p className="py-8 text-center text-sm text-ink-faint">이 기간엔 아직 데이터가 없어요.</p>
        ) : (
          <>
            {/* 요약: 직접 라벨 */}
            <p className="text-sm text-ink-soft">
              <b className="text-base text-ink">{series.currentLabel} {fmtValue(metric, curTotal, secondaryUnit)}</b>
              {series.hasCompareData && delta != null && (
                <>
                  {' '}· {series.compareLabel} 같은 기간보다 <Delta v={delta} />
                </>
              )}
            </p>

            {/* 범례 */}
            <div className="mt-2 flex items-center gap-4 text-xs text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 rounded" style={{ background: CUR_COLOR }} />
                {series.currentLabel}
              </span>
              {series.hasCompareData && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: CMP_COLOR }} />
                  {series.compareLabel}
                </span>
              )}
            </div>

            <div className="mt-2">
              <LineChart series={series} metric={metric} secondaryLabel={secondaryLabel} secondaryUnit={secondaryUnit} />
            </div>

            {!series.hasCompareData && (
              <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-soft">
                {series.compareLabel} 데이터가 아직 없어요 — 과거 데이터가 쌓이면 자동으로 비교돼요.
              </p>
            )}

            {/* 접근성: 표 보기 */}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-ink-faint">표로 보기</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-faint">
                      <th className="py-1 pr-2 font-medium">구간</th>
                      <th className="py-1 pr-2 font-medium">{series.currentLabel}</th>
                      <th className="py-1 font-medium">{series.compareLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.label} className="border-b border-line/60">
                        <td className="py-1 pr-2 text-ink-soft">{p.label}</td>
                        <td className="py-1 pr-2 tabular-nums">
                          {(metric === 'sales' ? p.curSales : p.curGuests) != null
                            ? fmtValue(metric, (metric === 'sales' ? p.curSales : p.curGuests)!, secondaryUnit)
                            : '–'}
                        </td>
                        <td className="py-1 tabular-nums">
                          {(metric === 'sales' ? p.cmpSales : p.cmpGuests) != null
                            ? fmtValue(metric, (metric === 'sales' ? p.cmpSales : p.cmpGuests)!, secondaryUnit)
                            : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
