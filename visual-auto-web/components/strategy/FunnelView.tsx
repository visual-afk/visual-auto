'use client';

import { useState } from 'react';
import { C } from './theme';
import type { ResolvedMetric } from '@/lib/strategy/model';

/**
 * 퍼널 뷰 (6.6) — 노출→유입→전환 사다리꼴. 단 폭은 로그 스케일, 전환율 자동 계산,
 * 최악 구간에 '병목' 배지. 미확보 단은 빗금. 수동 지표는 인라인 편집.
 */
export default function FunnelView({
  stages,
  onSaveMetric,
}: {
  stages: ResolvedMetric[];
  onSaveMetric: (metricId: string, value: number) => Promise<void>;
}) {
  const vals = stages.map((s) => s.value);
  const top = Math.max(vals[0] ?? 0, 1);
  const logTop = Math.log(top + 1) || 1;
  const widthFrac = (v: number | null) => {
    if (v == null) return 0.6; // 미확보
    return Math.min(0.95, 0.42 + 0.53 * (Math.log(v + 1) / logTop));
  };

  // 구간별 전환율 + 병목 판정
  const convs = stages.slice(1).map((s, i) => {
    const prev = stages[i].value;
    const cur = s.value;
    const rate = prev && prev > 0 && cur != null ? (cur / prev) * 100 : null;
    return { rate };
  });
  let worst = -1;
  let worstRate = Infinity;
  convs.forEach((c, i) => {
    if (c.rate != null && c.rate < worstRate) {
      worstRate = c.rate;
      worst = i;
    }
  });

  const H = 150;
  const GAP = 66;
  const totalH = stages.length * H + (stages.length - 1) * GAP;

  return (
    <div>
      <svg viewBox={`0 0 1000 ${totalH}`} className="h-auto w-full" role="img" aria-label="퍼널">
        <defs>
          <pattern id="fn-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="12" height="12" fill={C.card} />
            <line x1="0" y1="0" x2="0" y2="12" stroke={C.textFaint} strokeWidth="3" />
          </pattern>
        </defs>
        {stages.map((s, i) => {
          const y = i * (H + GAP);
          const topW = widthFrac(s.value) * 1000;
          const botW = topW * 0.8;
          const cx = 500;
          const pts = `${cx - topW / 2},${y} ${cx + topW / 2},${y} ${cx + botW / 2},${y + H} ${cx - botW / 2},${y + H}`;
          const unknown = s.value == null;
          return (
            <g key={s.id}>
              <polygon points={pts} fill={unknown ? 'url(#fn-hatch)' : C.funnel} stroke={C.funnelEdge} strokeWidth={1.5} />
              <text x={cx} y={y + H / 2 - 8} textAnchor="middle" fontSize={26} fill={C.textDim}>
                {s.name}
              </text>
              <text x={cx} y={y + H / 2 + 34} textAnchor="middle" fontSize={40} fontWeight={700} fill={unknown ? C.textFaint : C.accent}>
                {s.display ?? '?'}
              </text>
              {i < stages.length - 1 && (
                <ConvLabel y={y + H + GAP / 2} conv={convs[i]} bottleneck={worst === i} />
              )}
            </g>
          );
        })}
      </svg>

      {/* 인라인 편집 (수동 단만) */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {stages.map((s) => (
          <StageInput key={s.id} metric={s} onSave={onSaveMetric} />
        ))}
      </div>
    </div>
  );
}

function ConvLabel({ y, conv, bottleneck }: { y: number; conv: { rate: number | null }; bottleneck: boolean }) {
  const txt = conv.rate == null ? '—' : `▼ ${conv.rate.toFixed(1)}%`;
  return (
    <g>
      <text x={500} y={y + 8} textAnchor="middle" fontSize={26} fontWeight={700} fill={bottleneck ? C.danger : C.textDim}>
        {txt}
      </text>
      {bottleneck && (
        <>
          <rect x={720} y={y - 20} width={92} height={38} rx={19} fill={C.dangerBg} />
          <text x={766} y={y + 6} textAnchor="middle" fontSize={22} fontWeight={700} fill={C.danger}>
            병목
          </text>
        </>
      )}
    </g>
  );
}

function StageInput({ metric, onSave }: { metric: ResolvedMetric; onSave: (id: string, v: number) => Promise<void> }) {
  const [draft, setDraft] = useState(metric.value != null ? String(metric.value) : '');
  const [saving, setSaving] = useState(false);
  const editable = metric.source === 'manual';

  const commit = async () => {
    const n = Number(draft);
    if (!editable || draft.trim() === '' || Number.isNaN(n) || n === metric.value) return;
    setSaving(true);
    try {
      await onSave(metric.id, n);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="mb-1 truncate text-xs" style={{ color: C.textDim }}>
        {metric.name} {!editable && <span style={{ color: C.textFaint }}>· 자동</span>}
      </p>
      <input
        value={editable ? draft : metric.value != null ? String(metric.value) : ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        disabled={!editable || saving}
        inputMode="numeric"
        placeholder="?"
        className="w-full rounded-lg px-3 py-2 text-base outline-none disabled:opacity-70"
        style={{ background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text }}
      />
    </div>
  );
}
