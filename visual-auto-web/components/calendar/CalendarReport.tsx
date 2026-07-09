import type { CalendarReportData } from '@/lib/contentCalendar';

function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span className={`ml-1.5 text-xs font-semibold ${up ? 'text-ok' : 'text-warn'}`}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(value * 100))}%
    </span>
  );
}

function Stat({
  label,
  value,
  delta,
  sub,
  accent,
}: {
  label: string;
  value: string;
  delta?: number | null;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-brand' : ''}`}>
        {value}
        {delta !== undefined && <Delta value={delta} />}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-faint">{sub}</p>}
    </div>
  );
}

/** 캘린더 월 리포트: 계획 이행 + 노출(조회수) + 유입(플레이스) — 본사·원장 전용 섹션 */
export default function CalendarReport({ report }: { report: CalendarReportData }) {
  const r = report;
  return (
    <section>
      <h2 className="text-base font-bold">{r.monthLabel} 리포트</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="계획 이행"
          value={r.plan.rate == null ? '–' : `${Math.round(r.plan.rate * 100)}%`}
          sub={`계획 ${r.plan.planned} · 완료 ${r.plan.done}`}
        />
        <Stat label="실제 발행" value={`${r.plan.publishedActual}건`} sub="블로그 + 릴스" />
        <Stat
          label="노출 (콘텐츠 조회수)"
          value={r.exposure.views.toLocaleString()}
          delta={r.exposure.delta}
          sub="이 달 발행 콘텐츠의 누적 조회수"
          accent
        />
        <Stat
          label="유입 (플레이스 조회)"
          value={r.inflow.placeViews == null ? '기록 없음' : r.inflow.placeViews.toLocaleString()}
          delta={r.inflow.placeViews == null ? undefined : r.inflow.delta}
          sub="스마트플레이스 통계 기준"
        />
      </div>

      {r.inflow.topKeywords.length > 0 && (
        <div className="mt-3 rounded-xl2 border border-line bg-surface p-4">
          <p className="text-xs text-ink-faint">유입 상위 키워드</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.inflow.topKeywords.map((k) => (
              <span key={k.name} className="rounded-full bg-brand-wash px-2.5 py-1 text-xs font-medium text-brand">
                {k.name} <span className="tabular-nums">{k.count.toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {r.byBranch && r.byBranch.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl2 border border-line bg-surface">
          <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint">
            <span>지점</span>
            <span className="text-right">계획</span>
            <span className="text-right">완료</span>
            <span className="text-right">발행</span>
          </div>
          <ul className="divide-y divide-line">
            {r.byBranch.map((b) => (
              <li key={b.branchId} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 px-4 py-2.5 text-sm">
                <span className="truncate font-medium">{b.name}</span>
                <span className="text-right tabular-nums">{b.planned}</span>
                <span className="text-right tabular-nums text-ok">{b.done}</span>
                <span className="text-right tabular-nums font-semibold text-brand">{b.published}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
