'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { C } from './theme';
import { apiSend } from './api';
import type { ResolvedArea, Experiment, ExpStatus } from '@/lib/strategy/model';

const STATUSES: ExpStatus[] = ['설계중', '진행중', '결과대기', '완료'];

export default function ExperimentEditor({
  areas,
  assignees,
  initial,
  fixedAreaId,
  onClose,
  onSaved,
}: {
  areas: ResolvedArea[];
  assignees: string[];
  initial: Experiment | null;
  fixedAreaId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [areaId, setAreaId] = useState(initial?.areaId ?? fixedAreaId ?? areas[0]?.id ?? 'hq');
  const [f, setF] = useState({
    phenomenon: initial?.phenomenon ?? '',
    hypothesis: initial?.hypothesis ?? '',
    prediction: initial?.prediction ?? '',
    action: initial?.action ?? '',
    assignee_name: initial?.assigneeName ?? '',
    due_date: initial?.dueDate ?? '',
    check_metric_id: initial?.checkMetricId ?? '',
    status: (initial?.status ?? '설계중') as ExpStatus,
    result_value: initial?.resultValue ?? '',
    result_note: initial?.resultNote ?? '',
    learned: initial?.learned ?? '',
    promotion: initial?.promotion ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const area = areas.find((a) => a.id === areaId);
  const metrics = area?.metrics.filter((m) => m.id.includes('-')) ?? []; // DB uuid만 확인지표로

  const save = async () => {
    if (f.status === '완료' && (!f.result_value.trim() || !f.learned.trim())) {
      setErr('완료하려면 결과 숫자와 배운 것을 입력해야 해요');
      return;
    }
    setSaving(true);
    setErr(null);
    const body = {
      area_id: areaId,
      phenomenon: f.phenomenon, hypothesis: f.hypothesis, prediction: f.prediction, action: f.action,
      assignee_name: f.assignee_name, due_date: f.due_date || null, check_metric_id: f.check_metric_id || null,
      status: f.status, result_value: f.result_value, result_note: f.result_note, learned: f.learned,
      promotion: f.promotion || null,
    };
    const res = initial
      ? await apiSend(`/api/strategy/experiments/${initial.id}`, 'PATCH', body)
      : await apiSend('/api/strategy/experiments', 'POST', body);
    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
    } else setErr(res.error ?? '저장 실패');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 md:rounded-2xl"
        style={{ background: C.panel, border: `1px solid ${C.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: C.text }}>{initial ? '실험 카드 수정' : '새 실험 카드'}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5" style={{ color: C.textDim }}><X size={18} /></button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="소속 영역">
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!!fixedAreaId || !!initial} style={sel}>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="현상 (문제 숫자)"><input value={f.phenomenon} onChange={(e) => set('phenomenon', e.target.value)} placeholder="재방률 편차 ±9%p (성수 68 / 마곡 52)" style={inp} /></Field>
          <Field label="원인 가설"><input value={f.hypothesis} onChange={(e) => set('hypothesis', e.target.value)} placeholder="시술 후 안내 멘트가 지점마다 다르기 때문" style={inp} /></Field>
          <Field label="예측"><input value={f.prediction} onChange={(e) => set('prediction', e.target.value)} placeholder="표준 멘트 적용 시 재방 예약률 +5%p" style={inp} /></Field>
          <Field label="실행 내용"><input value={f.action} onChange={(e) => set('action', e.target.value)} placeholder="마곡에 결마지 사후관리 표준 멘트 2주 적용" style={inp} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="담당">
              <select value={f.assignee_name} onChange={(e) => set('assignee_name', e.target.value)} style={sel}>
                <option value="">선택</option>
                {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="기한"><input type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} style={inp} /></Field>
          </div>
          <Field label="확인 지표">
            <select value={f.check_metric_id} onChange={(e) => set('check_metric_id', e.target.value)} style={sel}>
              <option value="">선택</option>
              {metrics.map((mm) => <option key={mm.id} value={mm.id}>{mm.name}</option>)}
            </select>
          </Field>
          <Field label="상태">
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => set('status', s)} className="rounded-full px-3 py-1.5 text-sm"
                  style={f.status === s ? { background: C.accent, color: '#fff' } : { background: C.card, color: C.textDim, border: `1px solid ${C.cardBorder}` }}>
                  {s}
                </button>
              ))}
            </div>
          </Field>

          {f.status === '완료' && (
            <div className="space-y-3 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardBorder}` }}>
              <Field label="결과 숫자"><input value={f.result_value} onChange={(e) => set('result_value', e.target.value)} placeholder="+6.2%p" style={inp} /></Field>
              <Field label="배운 것"><input value={f.learned} onChange={(e) => set('learned', e.target.value)} placeholder="멘트 표준화 효과 확인, 전 지점 확대" style={inp} /></Field>
              <Field label="승격 판정">
                <div className="flex gap-1.5">
                  {['승격', '보류', '기각'].map((p) => (
                    <button key={p} onClick={() => set('promotion', f.promotion === p ? '' : p)} className="rounded-full px-3 py-1.5 text-sm"
                      style={f.promotion === p ? { background: C.good, color: '#fff' } : { background: C.bg, color: C.textDim, border: `1px solid ${C.cardBorder}` }}>
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {err && <p className="text-sm" style={{ color: C.danger }}>{err}</p>}
        </div>

        <button onClick={save} disabled={saving} className="mt-5 w-full rounded-xl py-3.5 text-base font-semibold disabled:opacity-50" style={{ background: C.accent, color: '#fff' }}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', borderRadius: 10, padding: '10px 12px', fontSize: 15, background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text, outline: 'none' };
const sel: React.CSSProperties = { ...inp };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: C.textDim }}>{label}</span>
      {children}
    </label>
  );
}
