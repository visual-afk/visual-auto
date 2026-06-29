'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { roleLabel, type Role } from '@/lib/roles';

type BranchOption = { id: string; name: string };

/** 멤버 행의 ⋯ 메뉴 — 역할 바꾸기 / 내보내기(비활성) / 다시 활성화 / 완전삭제(본사) */
export default function MemberActions({
  memberId,
  memberRole,
  memberBranchId,
  isActive,
  myRole,
  branches,
}: {
  memberId: string;
  memberRole: Role;
  memberBranchId?: string | null;
  isActive: boolean;
  myRole: Role;
  branches?: BranchOption[]; // 본사일 때만 — 본사→지점역할 강등 시 지점 지정용
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // 본사(지점 없음) 멤버를 지점 역할로 강등할 때, 지점 선택을 받기 위한 대기 상태
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [pendingBranch, setPendingBranch] = useState<string>(branches?.[0]?.id ?? '');

  const isHq = myRole === 'hq_admin';
  // 바꿀 수 있는 역할 후보 (현재 역할 제외)
  const roleChoices: Role[] = (
    isHq ? (['designer', 'intern', 'branch_owner', 'hq_admin'] as Role[]) : (['designer', 'intern'] as Role[])
  ).filter((r) => r !== memberRole);

  async function setRole(role: Role, branchId?: string) {
    // 본사(지점 없음) → 지점 역할로 강등인데 지점 정보가 없으면 선택 먼저 받기
    const needsBranch = role !== 'hq_admin' && !memberBranchId;
    if (needsBranch && !branchId) {
      setPendingRole(role);
      return;
    }
    await call('PATCH', { action: 'set_role', role, ...(branchId ? { branch_id: branchId } : {}) });
  }

  async function call(method: 'PATCH' | 'DELETE', body?: object) {
    setBusy(true);
    const res = await fetch(`/api/members/${memberId}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    setOpen(false);
    setPendingRole(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '처리에 실패했어요');
      return;
    }
    router.refresh();
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
          <button
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden
            onClick={() => {
              setOpen(false);
              setPendingRole(null);
            }}
          />
          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-card">
            {pendingRole ? (
              // 본사 → 지점역할 강등: 지점 선택
              <div className="p-3">
                <p className="mb-2 text-xs text-ink-soft">{roleLabel[pendingRole]}으로 보낼 지점을 골라주세요</p>
                <select
                  className="field mb-2"
                  value={pendingBranch}
                  onChange={(e) => setPendingBranch(e.target.value)}
                >
                  <option value="">지점 선택</option>
                  {branches?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => pendingBranch && setRole(pendingRole, pendingBranch)}
                  disabled={!pendingBranch}
                  className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
                >
                  적용
                </button>
              </div>
            ) : (
              <>
                {roleChoices.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className="block w-full px-4 py-2.5 text-left text-sm hover:bg-canvas"
                  >
                    {roleLabel[r]}으로 변경
                  </button>
                ))}
                {isActive ? (
                  <button
                    onClick={() => call('PATCH', { action: 'set_active', is_active: false })}
                    className="block w-full px-4 py-2.5 text-left text-sm text-warn hover:bg-canvas"
                  >
                    내보내기
                  </button>
                ) : (
                  <button
                    onClick={() => call('PATCH', { action: 'set_active', is_active: true })}
                    className="block w-full px-4 py-2.5 text-left text-sm text-brand hover:bg-canvas"
                  >
                    다시 활성화
                  </button>
                )}
                {isHq && (
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          '완전삭제하면 이 멤버의 계정과 작성한 글이 모두 사라져요. 되돌릴 수 없어요.\n\n글을 남기려면 대신 "내보내기"를 쓰세요. 정말 삭제할까요?',
                        )
                      ) {
                        call('DELETE');
                      }
                    }}
                    className="block w-full border-t border-line px-4 py-2.5 text-left text-sm text-red-600 hover:bg-canvas"
                  >
                    완전삭제
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
