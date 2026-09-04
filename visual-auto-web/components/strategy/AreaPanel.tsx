'use client';

import { useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { C, STATUS_COLOR } from './theme';
import { InlineText } from './Inline';
import FunnelView from './FunnelView';
import { apiSend } from './api';
import type { ResolvedArea, ResolvedMetric, Experiment } from '@/lib/strategy/model';

export default function AreaPanel({
  area,
  assignees,
  editable,
  onRefresh,
  onEditExperiment,
  onExportAgenda,
}: {
  area: ResolvedArea;
  assignees: string[];
  editable: boolean;
  onRefresh: () => void;
  onEditExperiment: (area: ResolvedArea, exp: Experiment | null) => void;
  onExportAgenda: (area: ResolvedArea) => void;
}) {
  const saveArea = (field: string) => async (value: string) => {
    const res = await apiSend(`/api/strategy/areas/${area.id}`, 'PATCH', { [field]: value });
    if (res.ok) onRefresh();
    return res;
  };
  const saveMetric = async (metricId: string, value: number) => {
    const res = await apiSend('/api/strategy/metric-values', 'POST', { metric_id: metricId, value });
    if (res.ok) onRefresh();
  };
  const changeOwner = async (name: string) => {
    const res = await apiSend(`/api/strategy/areas/${area.id}`, 'PATCH', { owner_name: name });
    if (res.ok) onRefresh();
  };

  return (
    <div className="rounded-2xl p-5 md:p-6" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      {/* 1. 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[area.status] }} />
          <h2 className="text-xl font-bold" style={{ color: C.text }}>{area.name}</h2>
          <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: C.card, color: C.textDim }}>{area.type}</span>
        </div>
        <div className="text-right text-sm" style={{ color: C.textDim }}>
          주인:{' '}
          {editable ? (
            <select
              value={area.ownerName ?? ''}
              onChange={(e) => changeOwner(e.target.value)}
              className="rounded-md px-1 py-0.5 text-sm outline-none"
              style={{ background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text }}
            >
              {area.ownerName && !assignees.includes(area.ownerName) && <option value={area.ownerName}>{area.ownerName}</option>}
              {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          ) : (
            <span style={{ color: C.text }}>{area.ownerName ?? '미지정'}</span>
          )}
        </div>
      </div>

      {/* 2. 돈의 공식 */}
      <div className="mt-2 text-sm font-semibold" style={{ color: C.accent }}>
        돈의 공식 · {area.moneyFormula}
      </div>
      {area.headline && (
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold" style={{ color: C.text }}>{area.headline.display}</span>
          {area.headline.deltaPct != null && (
            <span className="text-sm font-semibold" style={{ color: area.headline.deltaPct >= 0 ? C.good : C.danger }}>
              {area.headline.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(area.headline.deltaPct * 100).toFixed(1)}%
            </span>
          )}
          {area.headline.context && <span className="text-xs" style={{ color: C.textFaint }}>{area.headline.context}</span>}
        </div>
      )}

      {/* 3. 지표 3 (퍼널 or 카드) */}
      <div className="mt-4">
        {area.isFunnel ? (
          <FunnelView stages={area.metrics} onSaveMetric={saveMetric} />
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {area.metrics.map((mt) => (
              <MetricCard key={mt.id} metric={mt} editable={editable} onSave={saveMetric} />
            ))}
          </div>
        )}
      </div>

      <div className="my-4 h-px" style={{ background: C.line }} />

      {/* 4. 지금 문제 · 원인 후보 */}
      <Row label="지금 문제">
        <InlineOrText editable={editable} value={area.currentProblem} placeholder="숫자로 한 문장 (감정 표현 금지)" onSave={saveArea('current_problem')} />
      </Row>
      <Row label="원인 후보">
        <InlineOrText editable={editable} value={area.causeNote} placeholder="가장 유력한 원인 한 줄" onSave={saveArea('cause_note')} />
      </Row>

      {/* 5. 이번 실험 */}
      <div className="mt-4 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardBorder}` }}>
        <p className="text-xs" style={{ color: C.textDim }}>이번 실험</p>
        {area.activeExperiment ? (
          <ExperimentSummary exp={area.activeExperiment} onClick={() => editable && onEditExperiment(area, area.activeExperiment)} />
        ) : (
          <button
            onClick={() => editable && onEditExperiment(area, null)}
            disabled={!editable}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold disabled:opacity-50"
            style={{ color: C.accent }}
          >
            <Plus size={15} /> 실험 없음 — 새 실험 만들기
          </button>
        )}
      </div>

      {/* 6. 다음 회의 결정 */}
      <Row label="다음 회의 결정" className="mt-4">
        <span style={{ color: C.textDim }}>→ </span>
        <InlineOrText editable={editable} value={area.decideNext} placeholder="이번 회의에서 결정할 사항 1개" onSave={saveArea('decide_next')} />
      </Row>

      {/* 액션 */}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => onExportAgenda(area)}
          className="inline-flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{ background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text }}
        >
          회의 안건지 만들기 <ArrowUpRight size={15} />
        </button>
        <button
          onClick={() => editable && onEditExperiment(area, area.activeExperiment)}
          disabled={!editable}
          className="inline-flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text }}
        >
          실험 실행계획 쪼개기 <ArrowUpRight size={15} />
        </button>
      </div>
    </div>
  );
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex gap-3 py-1.5 text-sm ${className ?? ''}`}>
      <span className="w-24 shrink-0" style={{ color: C.textFaint }}>{label}</span>
      <div className="min-w-0 flex-1" style={{ color: C.text }}>{children}</div>
    </div>
  );
}

function InlineOrText({
  editable, value, placeholder, onSave,
}: {
  editable: boolean; value: string | null; placeholder: string;
  onSave: (v: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  if (!editable) return <span style={{ color: value ? C.text : C.textFaint }}>{value ?? placeholder}</span>;
  return <InlineText value={value} placeholder={placeholder} emptyLabel={placeholder} onSave={onSave} multiline textStyle={{ color: C.text }} />;
}

function MetricCard({ metric, editable, onSave }: { metric: ResolvedMetric; editable: boolean; onSave: (id: string, v: number) => Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const canEdit = editable && metric.source === 'manual';
  const unknown = metric.display == null;

  return (
    <div className="rounded-xl p-3.5" style={{ background: C.card, border: `1px solid ${C.cardBorder}` }}>
      <p className="truncate text-xs" style={{ color: C.textDim }}>{metric.name}</p>
      {open && canEdit ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={async () => {
            const n = Number(draft);
            if (draft.trim() !== '' && !Number.isNaN(n)) await onSave(metric.id, n);
            setOpen(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="numeric"
          className="mt-1 w-full rounded-md px-2 py-1 text-lg outline-none"
          style={{ background: C.bg, border: `1px solid ${C.accent}`, color: C.text }}
        />
      ) : (
        <button
          onClick={() => canEdit && (setDraft(metric.value != null ? String(metric.value) : ''), setOpen(true))}
          disabled={!canEdit}
          className="mt-1 block text-left text-2xl font-bold"
          style={{ color: unknown ? C.textFaint : C.text }}
        >
          {metric.display ?? '?'}
        </button>
      )}
      <p className="mt-1 text-xs" style={{ color: unknown ? C.textFaint : C.textDim }}>
        {unknown ? '미측정' : metric.deltaPct != null ? `${metric.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(metric.deltaPct * 100).toFixed(0)}%` : metric.context ?? ''}
      </p>
    </div>
  );
}

function ExperimentSummary({ exp, onClick }: { exp: Experiment; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-1.5 block w-full text-left">
      <p className="text-sm font-semibold" style={{ color: C.text }}>{exp.action || exp.phenomenon || '(실험 내용 없음)'}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: C.accentSoft, color: C.accent }}>
          {exp.assigneeName || '담당 미정'} · {exp.dueDate ? `~${exp.dueDate.slice(5).replace('-', '/')}` : '기한 미정'}
        </span>
        {exp.checkMetricName && (
          <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: C.goodBg, color: C.good }}>
            확인: {exp.checkMetricName}
          </span>
        )}
        {exp.overdue && (
          <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: C.dangerBg, color: C.warn }}>기한 초과</span>
        )}
        <span className="rounded-full px-2 py-1 text-xs" style={{ background: C.bg, color: C.textDim }}>{exp.status}</span>
      </div>
    </button>
  );
}
