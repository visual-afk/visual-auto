'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Users, FileText } from 'lucide-react';
import BranchForm, { type BranchData } from './BranchForm';

export type BranchRowData = BranchData & {
  id: string;
  member_count: number;
  post_count: number;
};

/** 지점 한 행 — 표시 + ⋯메뉴(수정/삭제) + 인라인 수정 폼 */
export default function BranchActions({ branch }: { branch: BranchRowData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const empty = branch.member_count === 0 && branch.post_count === 0;

  async function remove() {
    if (!confirm(`'${branch.name}' 지점을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusy(true);
    const res = await fetch(`/api/branches/${branch.id}`, { method: 'DELETE' });
    setBusy(false);
    setOpen(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '삭제에 실패했어요');
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <li className="px-4 py-4">
        <BranchForm initial={branch} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{branch.name}</span>
          {branch.lat == null || branch.lng == null ? (
            <span className="shrink-0 rounded bg-warn/10 px-1.5 py-0.5 text-[11px] font-semibold text-warn">위치 미설정</span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-ink-faint">{branch.region || '지역 미입력'}</span>
      </span>
      <span className="flex items-center gap-1 text-sm text-ink-soft">
        <Users size={14} /> {branch.member_count}
      </span>
      <span className="flex items-center gap-1 text-sm text-ink-soft">
        <FileText size={14} /> {branch.post_count}
      </span>
      <span className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          aria-label="지점 관리"
          className="rounded-lg p-1.5 text-ink-faint hover:bg-canvas hover:text-ink-soft"
        >
          <MoreHorizontal size={18} />
        </button>
        {open && (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-card">
              <button
                onClick={() => {
                  setEditing(true);
                  setOpen(false);
                }}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-canvas"
              >
                수정하기
              </button>
              <button
                onClick={remove}
                disabled={!empty}
                title={empty ? '' : '소속 멤버·글이 있어 삭제할 수 없어요'}
                className="block w-full border-t border-line px-4 py-2.5 text-left text-sm text-red-600 hover:bg-canvas disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent"
              >
                {empty ? '삭제하기' : '삭제 불가'}
              </button>
            </div>
          </>
        )}
      </span>
    </li>
  );
}
