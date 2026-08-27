'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Trash2, Sparkles } from 'lucide-react';
import type { ContentType } from '@/lib/contentCalendar';
import type { AssigneeOpt, BranchOpt } from './ScheduleEditor';

interface Row {
  key: number;
  branch_id: string;
  content_type: ContentType;
  title: string;
  scheduled_date: string;
  assignee_id: string;
  memo?: string; // 자동 기획의 추천 이유
}

const CADENCE_OPTS = [
  { value: 'daily', label: '매일' },
  { value: 'weekdays', label: '평일 (주 5일)' },
  { value: '3x', label: '주 3일 (월·수·금)' },
  { value: '2x', label: '주 2일 (화·금)' },
  { value: '1x', label: '주 1일 (수)' },
] as const;

/** 월 기획 일괄 등록 모달 — 표 형태로 여러 행을 채우고 한 번에 저장 (/api/schedule/bulk) */
export default function BulkPlanner({
  month,
  defaultDate,
  defaultBranchId,
  branchOpts,
  assignees,
  onClose,
}: {
  month: string;
  defaultDate: string;
  defaultBranchId: string;
  branchOpts: BranchOpt[];
  assignees: AssigneeOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const newRow = (base?: Row, key = 0): Row => ({
    key,
    branch_id: base?.branch_id ?? defaultBranchId,
    content_type: base?.content_type ?? 'blog',
    title: '',
    scheduled_date: base?.scheduled_date ?? defaultDate,
    assignee_id: '',
  });
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [errors, setErrors] = useState<Record<number, string>>({}); // rows 배열 index 기준
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── 자동으로 기획하기 ──
  const [autoBranch, setAutoBranch] = useState(defaultBranchId);
  const [cadence, setCadence] = useState<(typeof CADENCE_OPTS)[number]['value']>('3x');
  const [autoType, setAutoType] = useState<ContentType>('blog');
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoNote, setAutoNote] = useState<string | null>(null);

  async function autoFill() {
    setAutoBusy(true);
    setAutoNote(null);
    setFormError(null);
    const res = await fetch('/api/schedule/auto-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: autoBranch, month, cadence }),
    });
    const body = await res.json().catch(() => ({}));
    setAutoBusy(false);
    if (!res.ok) {
      setAutoNote(body.error || '자동 기획에 실패했어요');
      return;
    }
    const items: { scheduled_date: string; title: string; reason?: string }[] = body.items ?? [];
    setRows((rs) => {
      const kept = rs.filter((r) => r.title.trim()); // 이미 입력한 행은 보존
      let key = rs.length ? Math.max(...rs.map((r) => r.key)) + 1 : 0;
      const generated = items.map((it) => ({
        key: key++,
        branch_id: autoBranch,
        content_type: autoType,
        title: it.title,
        scheduled_date: it.scheduled_date,
        assignee_id: '',
        memo: it.reason || '',
      }));
      return [...kept, ...generated].slice(0, 50); // bulk API 상한
    });
    setAutoNote(body.note ?? `${items.length}일 채웠어요 — 주제를 다듬고 저장하세요`);
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () => setRows((rs) => [...rs, newRow(rs[rs.length - 1], Math.max(...rs.map((r) => r.key)) + 1)]);
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  async function save() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    const res = await fetch('/api/schedule/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: rows.map((r) => ({
          branch_id: r.branch_id,
          content_type: r.content_type,
          title: r.title.trim(),
          scheduled_date: r.scheduled_date,
          assignee_id: r.assignee_id || null,
          memo: r.memo || null,
        })),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (Array.isArray(body.rows)) {
        setErrors(Object.fromEntries(body.rows.map((e: { index: number; error: string }) => [e.index, e.error])));
      }
      setFormError(body.error || '저장에 실패했어요');
      return;
    }
    if (body.gcalFailed > 0) {
      alert(`저장은 완료됐지만 구글 캘린더 내보내기 ${body.gcalFailed}건이 실패했어요 (나중에 수정하면 재시도돼요)`);
    }
    router.refresh();
    onClose();
  }

  const field = 'w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand';
  const [y, m] = month.split('-');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 md:items-center md:p-6" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full flex-col rounded-t-xl2 bg-surface p-5 shadow-card md:max-w-2xl md:rounded-xl2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">
            {y}년 {Number(m)}월 기획 짜기
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-canvas">
            <X size={18} />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-ink-faint">행마다 날짜·지점·유형·주제·담당자를 채우고 한 번에 저장해요 (최대 50행).</p>

        <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-brand">
            <Sparkles size={14} /> 자동으로 기획하기
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-[1fr_1fr_5.5rem_auto] md:items-center">
            {branchOpts.length > 1 ? (
              <select className={field} value={autoBranch} onChange={(e) => setAutoBranch(e.target.value)}>
                {branchOpts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className={`${field} truncate text-ink-soft`}>{branchOpts[0]?.name ?? '지점'}</div>
            )}
            <select className={field} value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)}>
              {CADENCE_OPTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select className={field} value={autoType} onChange={(e) => setAutoType(e.target.value as ContentType)}>
              <option value="blog">블로그</option>
              <option value="reels">릴스</option>
              <option value="etc">기타</option>
            </select>
            <button
              onClick={autoFill}
              disabled={autoBusy || !autoBranch}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
            >
              {autoBusy ? '주제 뽑는 중…' : 'AI로 주제 채우기'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">
            {autoNote ?? '주기를 고르면 이번 달 남은 날짜에 AI가 주제를 채워줘요. 이미 계획된 날짜는 건너뛰어요.'}
          </p>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {rows.map((r, i) => {
            const rowAssignees = assignees.filter((a) => !a.branchId || a.branchId === r.branch_id);
            const err = errors[i];
            return (
              <div
                key={r.key}
                className={`rounded-xl border p-2 ${err ? 'border-warn bg-warn/5' : 'border-line bg-canvas/50'}`}
              >
                <div className="grid grid-cols-2 gap-1.5 md:grid-cols-[7.5rem_1fr_5.5rem_1fr_6.5rem_2rem] md:items-center">
                  <input
                    type="date"
                    className={field}
                    value={r.scheduled_date}
                    onChange={(e) => update(r.key, { scheduled_date: e.target.value })}
                  />
                  {branchOpts.length > 1 ? (
                    <select
                      className={field}
                      value={r.branch_id}
                      onChange={(e) => update(r.key, { branch_id: e.target.value, assignee_id: '' })}
                    >
                      {branchOpts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className={`${field} truncate text-ink-soft`}>{branchOpts[0]?.name ?? '지점'}</div>
                  )}
                  <select
                    className={field}
                    value={r.content_type}
                    onChange={(e) => update(r.key, { content_type: e.target.value as ContentType })}
                  >
                    <option value="blog">블로그</option>
                    <option value="reels">릴스</option>
                    <option value="etc">기타</option>
                  </select>
                  <input
                    className={`${field} col-span-2 md:col-span-1`}
                    placeholder="주제/제목"
                    value={r.title}
                    onChange={(e) => update(r.key, { title: e.target.value })}
                  />
                  <select className={field} value={r.assignee_id} onChange={(e) => update(r.key, { assignee_id: e.target.value })}>
                    <option value="">담당 없음</option>
                    {rowAssignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeRow(r.key)}
                    disabled={rows.length <= 1}
                    className="justify-self-end rounded-lg p-1.5 text-ink-faint hover:text-warn disabled:opacity-30"
                    aria-label="행 삭제"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {r.memo && <p className="mt-1 truncate px-1 text-xs text-ink-faint">{r.memo}</p>}
                {err && <p className="mt-1 px-1 text-xs text-warn">{err}</p>}
              </div>
            );
          })}

          <button
            onClick={addRow}
            disabled={rows.length >= 50}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line py-2 text-sm text-ink-soft hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <Plus size={14} /> 행 추가
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink-faint">
            {formError ? <span className="text-warn">{formError}</span> : `${rows.length}건`}
          </span>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
          >
            {busy ? '저장 중…' : `${rows.length}건 일괄 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}
