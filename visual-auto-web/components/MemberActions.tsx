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
}: {
  memberId: string;
  memberRole: Role;
  isActive: boolean;
  myRole: Role;
  /** 성공 즉시 화면에 반영하기 위한 낙관적 업데이트 콜백 */
  onRoleChange?: (role: Role) => void;
  onActiveChange?: (isActive: boolean) => void;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
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
        </>
      )}
    </div>
  );
}
