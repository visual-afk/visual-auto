'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { roleLabel, type Role } from '@/lib/roles';

/** 멤버 행의 ⋯ 메뉴 — 역할 바꾸기 / 내보내기(비활성) / 다시 활성화 / 완전삭제(본사) */
export default function MemberActions({
  memberId,
  memberRole,
  isActive,
  myRole,
  onRoleChange,
  onActiveChange,
  onDelete,
  assignableBranches = [],
  currentBranchIds = [],
  homeBranchId = null,
}: {
  memberId: string;
  memberRole: Role;
  isActive: boolean;
  myRole: Role;
  /** 성공 즉시 화면에 반영하기 위한 낙관적 업데이트 콜백 */
  onRoleChange?: (role: Role) => void;
  onActiveChange?: (isActive: boolean) => void;
  onDelete?: () => void;
  /** 이 멤버를 배정할 수 있는 지점 (본사=전체 / 원장=소속 지점) */
  assignableBranches?: { id: string; name: string }[];
  /** 멤버가 현재 소속된 지점 id 집합 */
  currentBranchIds?: string[];
  /** 홈 지점 (해제 불가) */
  homeBranchId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [branchPanel, setBranchPanel] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(currentBranchIds));

  const canAssignBranches = assignableBranches.length > 1;

  const isHq = myRole === 'hq_admin';
  // 바꿀 수 있는 역할 후보 (현재 역할 제외)
  const roleChoices: Role[] = (isHq ? (['designer', 'intern', 'branch_owner'] as Role[]) : (['designer', 'intern'] as Role[]))
    .filter((r) => r !== memberRole);

  async function call(method: 'PATCH' | 'DELETE', body?: object, onSuccess?: () => void) {
    setBusy(true);
    const res = await fetch(`/api/members/${memberId}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    setOpen(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '처리에 실패했어요');
      return;
    }
    onSuccess?.();       // 즉시 화면 반영
    router.refresh();    // 헤더 인원 요약 등 서버 값 동기화
  }

  async function saveBranches() {
    // 홈 지점은 항상 포함 (해제 불가)
    const ids = new Set(sel);
    if (homeBranchId) ids.add(homeBranchId);
    await call('PATCH', { action: 'set_branches', branch_ids: [...ids] }, () => setBranchPanel(false));
  }

  function toggleBranch(id: string) {
    if (id === homeBranchId) return; // 홈 지점은 항상 유지
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label="멤버 관리"
        className="rounded-lg p-1.5 text-ink-faint hover:bg-canvas hover:text-ink-soft"
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <>
          {/* 바깥 클릭 닫기 */}
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => { setOpen(false); setBranchPanel(false); }} />
          {branchPanel ? (
            <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-card">
              <p className="px-4 py-2 text-xs font-semibold text-ink-faint">소속 지점 (여러 곳 가능)</p>
              {assignableBranches.map((b) => {
                const checked = sel.has(b.id) || b.id === homeBranchId;
                const isHome = b.id === homeBranchId;
                return (
                  <label
                    key={b.id}
                    className={`flex items-center gap-2 px-4 py-2 text-sm hover:bg-canvas ${isHome ? 'opacity-60' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isHome || busy}
                      onChange={() => toggleBranch(b.id)}
                    />
                    <span>
                      {b.name}
                      {isHome && <span className="ml-1 text-[11px] text-ink-faint">(홈)</span>}
                    </span>
                  </label>
                );
              })}
              <div className="mt-1 flex gap-1 border-t border-line px-2 py-2">
                <button
                  onClick={() => { setBranchPanel(false); setSel(new Set(currentBranchIds)); }}
                  disabled={busy}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs text-ink-soft hover:bg-canvas"
                >
                  취소
                </button>
                <button
                  onClick={saveBranches}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-brand px-2 py-1.5 text-xs font-semibold text-brand-ink"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-card">
            {roleChoices.map((r) => (
              <button
                key={r}
                onClick={() => call('PATCH', { action: 'set_role', role: r }, () => onRoleChange?.(r))}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-canvas"
              >
                {roleLabel[r]}으로 변경
              </button>
            ))}
            {isActive ? (
              <button
                onClick={() => call('PATCH', { action: 'set_active', is_active: false }, () => onActiveChange?.(false))}
                className="block w-full px-4 py-2.5 text-left text-sm text-warn hover:bg-canvas"
              >
                내보내기
              </button>
            ) : (
              <button
                onClick={() => call('PATCH', { action: 'set_active', is_active: true }, () => onActiveChange?.(true))}
                className="block w-full px-4 py-2.5 text-left text-sm text-brand hover:bg-canvas"
              >
                다시 활성화
              </button>
            )}
            {canAssignBranches && (
              <button
                onClick={() => { setSel(new Set(currentBranchIds)); setBranchPanel(true); }}
                className="block w-full border-t border-line px-4 py-2.5 text-left text-sm hover:bg-canvas"
              >
                지점 배정
              </button>
            )}
            {(isHq || myRole === 'branch_owner') && (
              <button
                onClick={() => {
                  if (confirm('완전삭제하면 이 멤버의 계정과 작성한 글이 모두 사라져요. 되돌릴 수 없어요.\n\n글을 남기려면 대신 "내보내기"를 쓰세요. 정말 삭제할까요?')) {
                    call('DELETE', undefined, () => onDelete?.());
                  }
                }}
                className="block w-full border-t border-line px-4 py-2.5 text-left text-sm text-red-600 hover:bg-canvas"
              >
                완전삭제
              </button>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}
