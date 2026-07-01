'use client';

import { useState } from 'react';
import MemberActions from './MemberActions';
import { roleLabel, type Role } from '@/lib/roles';

const roleBadgeStyle: Record<Role, string> = {
  hq_admin: 'bg-ink/10 text-ink',
  branch_owner: 'bg-brand-wash text-brand',
  designer: 'bg-canvas text-ink-soft border border-line',
  intern: 'bg-warn/15 text-warn',
};

/**
 * 멤버 한 줄 — 삭제/역할변경/내보내기 시 서버 응답을 기다리지 않고 화면에 즉시 반영(낙관적 업데이트).
 * 서버 값(헤더 인원 요약 등) 동기화는 MemberActions 내부의 router.refresh() 가 뒤이어 처리한다.
 */
export default function MemberRow({
  memberId,
  displayName,
  phone,
  initialRole,
  initialActive,
  isMe,
  canAct,
  myRole,
  postCount,
}: {
  memberId: string;
  displayName: string;
  phone: string | null;
  initialRole: Role;
  initialActive: boolean;
  isMe: boolean;
  canAct: boolean;
  myRole: Role;
  postCount: number;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [isActive, setIsActive] = useState(initialActive);
  const [deleted, setDeleted] = useState(false);

  if (deleted) return null; // 완전삭제 → 행 즉시 사라짐

  return (
    <li
      className={`grid grid-cols-[1fr_5.5rem_5rem_2rem] items-center gap-2 px-4 py-3.5 ${
        isActive ? '' : 'opacity-50'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-wash text-sm font-bold text-brand">
          {displayName.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            {displayName}
            {isMe && <span className="ml-1 text-xs font-normal text-ink-faint">(나)</span>}
          </span>
          {phone && <span className="block truncate text-xs text-ink-faint">{phone}</span>}
        </span>
      </span>
      <span>
        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${roleBadgeStyle[role]}`}>
          {roleLabel[role]}
        </span>
        {!isActive && <span className="ml-1 text-xs text-warn">(나감)</span>}
      </span>
      <span className="text-sm text-ink-soft">글 {postCount}</span>
      <span className="flex justify-end">
        {canAct && (
          <MemberActions
            memberId={memberId}
            memberRole={role}
            isActive={isActive}
            myRole={myRole}
            onRoleChange={setRole}
            onActiveChange={setIsActive}
            onDelete={() => setDeleted(true)}
          />
        )}
      </span>
    </li>
  );
}
