import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export type BranchStatus = 'ok' | 'warn' | 'crisis';
export type BranchChip = { id: string; name: string; status: BranchStatus };
export type Crisis = { title: string; detail: string };
export type Kpi = { label: string; value: string; delta: number | null };

const STATUS_META: Record<BranchStatus, { label: string; dot: string; text: string }> = {
  ok: { label: '정상', dot: 'bg-emerald-500', text: 'text-ink-soft' },
  warn: { label: '주의', dot: 'bg-amber-500', text: 'text-amber-600' },
  crisis: { label: '위기', dot: 'bg-rose-500', text: 'text-rose-600' },
};

function Delta({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const up = delta >= 0;
  const pct = `${Math.abs(Math.round(delta * 100))}%`;
  return (
    <span className={`ml-1 text-sm font-bold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? '▲' : '▼'}
      {pct}
    </span>
  );
}

export default function CompanyStatusBoard({
  monthLabel,
  crises,
  kpis,
  branches,
}: {
  monthLabel: string;
  crises: Crisis[];
  kpis: Kpi[];
  branches: BranchChip[];
}) {
  return (
    <div>
      {/* 헤더 */}
      <h1 className="text-2xl font-bold">회사 현황</h1>
      <p className="mt-1 text-sm text-ink-soft">{monthLabel} · 지금 챙길 것만 보여드려요</p>

      {/* 위기 */}
      {crises.length > 0 && (
        <div className="mt-6 rounded-xl2 border border-line bg-surface p-5 shadow-card">
          <p className="flex items-center gap-1.5 font-bold text-rose-600">
            <AlertTriangle size={18} /> 지금 위기 {crises.length}건
          </p>
          <ul className="mt-3 space-y-1.5">
            {crises.map((c, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold">· {c.title}</span>
                {c.detail ? <span className="text-ink-soft"> — {c.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <p className="text-xs text-ink-soft">{k.label}</p>
            <p className="mt-1 text-2xl font-bold">
              {k.value}
              <Delta delta={k.delta} />
            </p>
          </div>
        ))}
      </div>

      {/* 지점 상태 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink-soft">지점 상태</h2>
      <div className="flex flex-wrap gap-2">
        {branches.map((b) => {
          const m = STATUS_META[b.status];
          return (
            <Link
              key={b.id}
              href={`/performance?branch=${b.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-card transition hover:border-brand"
            >
              <span className={`h-2 w-2 rounded-full ${m.dot}`} />
              <span>{b.name}</span>
              <span className={m.text}>{m.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
