'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { RosterMember } from './InterviewsStudio';

type Meeting = {
  id: string;
  kind: 'all' | 'designer';
  held_at: string;
  facilitator_id: string | null;
  agenda: string | null;
  goals: string | null;
  review: string | null;
  attendee_ids: string[];
  late_ids: string[];
  absent_ids: string[];
};

const KIND_LABEL = { all: '전체미팅', designer: '디자이너미팅' } as const;
/** 참석 상태 순환: 참석 → 지각 → 불참 → 참석 */
type Presence = 'attend' | 'late' | 'absent';
const PRESENCE_STYLE: Record<Presence, string> = {
  attend: 'border-ok/50 bg-ok/10 text-ok',
  late: 'border-warn/50 bg-warn/10 text-warn',
  absent: 'border-line bg-canvas text-ink-faint line-through',
};
const PRESENCE_LABEL: Record<Presence, string> = { attend: '참석', late: '지각', absent: '불참' };

export default function MeetingsTab({
  branchId,
  roster,
}: {
  branchId: string | null;
  roster: RosterMember[];
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [editing, setEditing] = useState<Partial<Meeting> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) return;
    const res = await fetch(`/api/meetings?branch_id=${branchId}`);
    const data = await res.json();
    if (res.ok) setMeetings(data.meetings ?? []);
    else setError(data.error);
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberName = (id: string | null) =>
    roster.find((m) => m.id === id)?.display_name ?? '';

  const startNew = () => {
    setEditing({
      kind: 'all',
      held_at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10),
      attendee_ids: roster.map((m) => m.id), // 기본: 전원 참석
      late_ids: [],
      absent_ids: [],
    });
  };

  const presenceOf = (m: Partial<Meeting>, id: string): Presence =>
    m.late_ids?.includes(id) ? 'late' : m.absent_ids?.includes(id) ? 'absent' : 'attend';

  const cyclePresence = (id: string) => {
    setEditing((m) => {
      if (!m) return m;
      const cur = presenceOf(m, id);
      const attend = new Set(m.attendee_ids ?? []);
      const late = new Set(m.late_ids ?? []);
      const absent = new Set(m.absent_ids ?? []);
      attend.delete(id);
      late.delete(id);
      absent.delete(id);
      if (cur === 'attend') late.add(id);
      else if (cur === 'late') absent.add(id);
      else attend.add(id);
      return { ...m, attendee_ids: [...attend], late_ids: [...late], absent_ids: [...absent] };
    });
  };

  const save = async () => {
    if (!editing || !branchId) return;
    setBusy(true);
    setError(null);
    try {
      const isNew = !editing.id;
      const res = await fetch('/api/meetings', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editing, branch_id: branchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message || '저장에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('이 미팅 기록을 지울까요?')) return;
    const res = await fetch('/api/meetings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await load();
  };

  // ── 편집 폼 ─────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <p className="text-base font-bold">{editing.id ? '미팅 수정' : '새 미팅'}</p>
        {error && (
          <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            {error}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          {(['all', 'designer'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setEditing((m) => ({ ...m, kind: k }))}
              className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${
                editing.kind === k ? 'border-brand bg-brand-wash text-brand' : 'border-line text-ink-soft'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-ink-faint">일자</span>
            <input
              type="date"
              value={editing.held_at ?? ''}
              onChange={(e) => setEditing((m) => ({ ...m, held_at: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-faint">진행자</span>
            <select
              value={editing.facilitator_id ?? ''}
              onChange={(e) => setEditing((m) => ({ ...m, facilitator_id: e.target.value || null }))}
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
            >
              <option value="">선택 안 함</option>
              {roster.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <MeetingField
          label="미팅내용 & 안건"
          value={editing.agenda ?? ''}
          rows={4}
          onChange={(v) => setEditing((m) => ({ ...m, agenda: v }))}
        />
        <MeetingField
          label="목표 (지점 / 리더시각)"
          value={editing.goals ?? ''}
          rows={2}
          onChange={(v) => setEditing((m) => ({ ...m, goals: v }))}
        />
        <MeetingField
          label="미팅후기 & 리더생각"
          value={editing.review ?? ''}
          rows={3}
          onChange={(v) => setEditing((m) => ({ ...m, review: v }))}
        />

        {/* 참석 체크 (탭할 때마다 참석→지각→불참 순환) */}
        <div className="mt-3">
          <p className="text-xs font-semibold text-ink-faint">
            참석 체크 <span className="font-normal">— 눌러서 참석/지각/불참 바꾸기</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {roster.map((m) => {
              const p = presenceOf(editing, m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => cyclePresence(m.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${PRESENCE_STYLE[p]}`}
                >
                  {m.display_name}
                  {p !== 'attend' && <span className="ml-1">({PRESENCE_LABEL[p]})</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(null)}
            className="flex-1 rounded-xl2 border border-line py-3 text-sm font-bold text-ink-soft"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="flex-[2] rounded-xl2 bg-brand py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    );
  }

  // ── 목록 ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl2 border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{error}</p>
      )}
      <button
        type="button"
        onClick={startNew}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl2 bg-brand py-3 text-sm font-bold text-white"
      >
        <Plus size={15} /> 미팅 기록하기
      </button>

      {meetings.length === 0 && (
        <p className="rounded-xl2 border border-line bg-canvas p-5 text-center text-sm text-ink-faint">
          아직 미팅 기록이 없어요.
        </p>
      )}
      <ul className="space-y-2">
        {meetings.map((m) => (
          <li key={m.id} className="rounded-xl2 border border-line bg-surface px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(m)}>
                <p className="text-sm font-semibold">
                  <span
                    className={`mr-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      m.kind === 'all' ? 'bg-brand-wash text-brand' : 'bg-ok/10 text-ok'
                    }`}
                  >
                    {KIND_LABEL[m.kind]}
                  </span>
                  {m.held_at}
                  {m.facilitator_id && (
                    <span className="ml-1.5 text-xs font-normal text-ink-faint">
                      진행 {memberName(m.facilitator_id)}
                    </span>
                  )}
                </p>
                {m.agenda && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{m.agenda}</p>}
                <p className="mt-1 text-[11px] text-ink-faint">
                  참석 {m.attendee_ids.length}
                  {m.late_ids.length > 0 && ` · 지각 ${m.late_ids.length}`}
                  {m.absent_ids.length > 0 && ` · 불참 ${m.absent_ids.length}`}
                </p>
              </button>
              <button
                type="button"
                onClick={() => void remove(m.id)}
                className="p-1 text-ink-faint"
                title="삭제"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MeetingField({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="text-xs font-semibold text-ink-faint">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm leading-relaxed focus:border-brand focus:outline-none"
      />
    </label>
  );
}
