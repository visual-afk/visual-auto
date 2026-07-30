'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { C } from './theme';
import { apiSend } from './api';
import type { ResolvedArea, Experiment, ExpStatus } from '@/lib/strategy/model';

const COLS: ExpStatus[] = ['설계중', '진행중', '결과대기', '완료'];

export default function ExperimentBoard({
  experiments,
  areas,
  editable,
  onRefresh,
  onEdit,
  onNew,
}: {
  experiments: Experiment[];
  areas: ResolvedArea[];
  editable: boolean;
  onRefresh: () => void;
  onEdit: (exp: Experiment) => void;
  onNew: () => void;
}) {
  const [areaFilter, setAreaFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [dragId, setDragId] = useState<string | null>(null);

  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? id;
  const assignees = [...new Set(experiments.map((e) => e.assigneeName).filter(Boolean) as string[])];

  const filtered = experiments.filter(
    (e) => (areaFilter === 'all' || e.areaId === areaFilter) && (assigneeFilter === 'all' || e.assigneeName === assigneeFilter),
  );

  const drop = async (status: ExpStatus) => {
    const exp = experiments.find((e) => e.id === dragId);
    setDragId(null);
    if (!exp || !editable || exp.status === status) return;
    if (status === '완료' && (!exp.resultValue || !exp.learned)) {
      onEdit({ ...exp, status: '완료' }); // 결과 입력 필요 → 에디터로
      return;
    }
    const res = await apiSend(`/api/strategy/experiments/${exp.id}`, 'PATCH', { status });
    if (res.ok) onRefresh();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} style={sel}>
          <option value="all">전체 영역</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={sel}>
          <option value="all">전체 담당</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={onNew} disabled={!editable} className="inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: C.accent, color: '#fff' }}>
          <Plus size={15} /> 새 실험
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {COLS.map((col) => {
          const cards = filtered.filter((e) => e.status === col);
          return (
            <div
              key={col}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(col)}
              className="rounded-xl p-2.5"
              style={{ background: C.panel, border: `1px solid ${C.line}`, minHeight: 160 }}
            >
              <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold" style={{ color: C.textDim }}>
                {col} <span style={{ color: C.textFaint }}>{cards.length}</span>
              </p>
              <div className="space-y-2">
                {cards.map((e) => (
                  <div
                    key={e.id}
                    draggable={editable}
                    onDragStart={() => setDragId(e.id)}
                    onClick={() => editable && onEdit(e)}
                    className="cursor-pointer rounded-lg p-3"
                    style={{ background: C.card, border: `1px solid ${e.overdue ? C.warn : C.cardBorder}` }}
                  >
                    <p className="text-sm font-semibold" style={{ color: C.text }}>{e.action || e.phenomenon || '(내용 없음)'}</p>
                    <p className="mt-1 text-xs" style={{ color: C.textFaint }}>{areaName(e.areaId)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {e.assigneeName && <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: C.accentSoft, color: C.accent }}>{e.assigneeName}</span>}
                      {e.dueDate && <span className="text-xs" style={{ color: e.overdue ? C.warn : C.textDim }}>~{e.dueDate.slice(5).replace('-', '/')}</span>}
                      {e.promotion === '승격' && <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: C.goodBg, color: C.good }}>승격</span>}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <p className="px-1 py-4 text-center text-xs" style={{ color: C.textFaint }}>없음</p>}
              </div>
            </div>
          );
        })}
      </div>
      {!editable && <p className="mt-3 text-xs" style={{ color: C.textFaint }}>읽기 전용 — 0023 마이그레이션 실행 후 편집이 켜집니다.</p>}
    </div>
  );
}

const sel: React.CSSProperties = { borderRadius: 10, padding: '7px 10px', fontSize: 14, background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text, outline: 'none' };
