'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import type { ScheduleItem, ContentType } from '@/lib/contentCalendar';

export interface AssigneeOpt {
  id: string; // branch_users.id
  name: string;
  branchId: string | null;
}

export interface BranchOpt {
  id: string;
  name: string;
}

/** 일정 생성/편집 모달 폼. 저장은 /api/schedule (POST/PATCH) → router.refresh(). */
export default function ScheduleEditor({
  item,
  defaultDate,
  defaultBranchId,
  branchOpts,
  assignees,
  onClose,
}: {
  item: ScheduleItem | null; // null = 새 일정
  defaultDate: string;
  defaultBranchId: string;
  branchOpts: BranchOpt[];
  assignees: AssigneeOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? '');
  const [contentType, setContentType] = useState<ContentType>(item?.content_type ?? 'blog');
  const [date, setDate] = useState(item?.scheduled_date ?? defaultDate);
  const [branchId, setBranchId] = useState(item?.branch_id ?? defaultBranchId);
  const [assigneeId, setAssigneeId] = useState(item?.assignee_id ?? '');
  const [memo, setMemo] = useState(item?.memo ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchAssignees = assignees.filter((a) => !a.branchId || a.branchId === branchId);

  async function save() {
    if (!title.trim()) {
      setError('제목을 입력해주세요');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      branch_id: branchId,
      content_type: contentType,
      title: title.trim(),
      scheduled_date: date,
      assignee_id: assigneeId || null,
      memo: memo.trim() || null,
    };
    const res = await fetch(item ? `/api/schedule/${item.id}` : '/api/schedule', {
      method: item ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || '저장에 실패했어요');
      return;
    }
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!item || !confirm('이 일정을 삭제할까요?')) return;
    setBusy(true);
    const res = await fetch(`/api/schedule/${item.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || '삭제에 실패했어요');
      return;
    }
    router.refresh();
    onClose();
  }

  const field = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 md:items-center md:p-6" onClick={onClose}>
      <div
        className="w-full max-w-phone rounded-t-xl2 bg-surface p-5 shadow-card md:rounded-xl2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">{item ? '일정 편집' : '일정 추가'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-canvas">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            {(['blog', 'reels', 'etc'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setContentType(t)}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                  contentType === t ? 'bg-brand text-brand-ink' : 'border border-line bg-surface text-ink-soft'
                }`}
              >
                {t === 'blog' ? '블로그' : t === 'reels' ? '릴스' : '기타'}
              </button>
            ))}
          </div>

          <input
            className={field}
            placeholder="주제/제목 (예: 여름 두피케어 후기)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
            {branchOpts.length > 1 ? (
              <select
                className={field}
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setAssigneeId('');
                }}
              >
                {branchOpts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className={`${field} text-ink-soft`}>{branchOpts[0]?.name ?? '지점'}</div>
            )}
          </div>

          <select className={field} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">담당자 없음</option>
            {branchAssignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <textarea
            className={`${field} min-h-[4.5rem] resize-none`}
            placeholder="메모 (키워드, 참고 링크 등)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />

          {error && <p className="text-sm text-warn">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            {item ? (
              <button onClick={remove} disabled={busy} className="text-sm font-medium text-warn">
                삭제
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={save}
              disabled={busy}
              className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
            >
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
