'use client';

import { useState } from 'react';
import { Lightbulb, Copy, Check } from 'lucide-react';
import MemberActions from './MemberActions';
import { roleLabel, type Role } from '@/lib/roles';
import type { MemberCoaching } from '@/lib/coaching';

const roleBadgeStyle: Record<Role, string> = {
  hq_admin: 'bg-ink/10 text-ink',
  branch_owner: 'bg-brand-wash text-brand',
  designer: 'bg-canvas text-ink-soft border border-line',
  intern: 'bg-warn/15 text-warn',
};

/**
 * 코칭 카드 한 개 — 사람별 활동/조회수/저장률 + (플래그 시) 코칭 문구 + 카톡 복사 버튼.
 * 관리(역할변경·내보내기·삭제)는 우상단 ⋯ 메뉴(MemberActions)로.
 */
export default function MemberCoachingCard({
  memberId,
  displayName,
  initialRole,
  initialActive,
  isMe,
  canAct,
  myRole,
  coaching,
  assignableBranches = [],
  currentBranchIds = [],
  homeBranchId = null,
}: {
  memberId: string;
  displayName: string;
  initialRole: Role;
  initialActive: boolean;
  isMe: boolean;
  canAct: boolean;
  myRole: Role;
  coaching: MemberCoaching;
  assignableBranches?: { id: string; name: string }[];
  currentBranchIds?: string[];
  homeBranchId?: string | null;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const [isActive, setIsActive] = useState(initialActive);
  const [deleted, setDeleted] = useState(false);
  const [copied, setCopied] = useState(false);

  if (deleted) return null;

  const warn = coaching.status === 'warn';
  const lowSave = coaching.flags.includes('low_save');

  async function copyKakao() {
    if (!coaching.kakao) return;
    try {
      await navigator.clipboard.writeText(coaching.kakao);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* 복사 실패는 무시 */
    }
  }

  return (
    <div
      className={`rounded-xl2 border bg-surface p-4 shadow-card ${warn ? 'border-warn/50' : 'border-line'} ${
        isActive ? '' : 'opacity-50'
      }`}
    >
      {/* 헤더: 이름 + 역할 / 상태 배지 + 관리 메뉴 */}
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-wash text-sm font-bold text-brand">
            {displayName.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold">
              {displayName}
              {isMe && <span className="ml-1 text-xs font-normal text-ink-faint">(나)</span>}
              {(role === 'intern' || role === 'branch_owner') && (
                <span className={`ml-1.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold ${roleBadgeStyle[role]}`}>
                  {roleLabel[role]}
                </span>
              )}
            </span>
            {!isActive && <span className="text-xs text-warn">나감</span>}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-bold ${
              warn ? 'bg-warn/15 text-warn' : 'bg-ok/10 text-ok'
            }`}
          >
            {warn ? '주의' : '잘하고 있어요'}
          </span>
          {canAct && (
            <MemberActions
              memberId={memberId}
              memberRole={role}
              isActive={isActive}
              myRole={myRole}
              onRoleChange={setRole}
              onActiveChange={setIsActive}
              onDelete={() => setDeleted(true)}
              assignableBranches={assignableBranches}
              currentBranchIds={currentBranchIds}
              homeBranchId={homeBranchId}
            />
          )}
        </span>
      </div>

      {/* 활동 · 조회수 · 저장률 */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-ink-soft">
          릴스 {coaching.reelsCount} · 블로그 {coaching.blogCount} · 리뷰 {coaching.reviewCount}
        </span>
        <span className="flex items-baseline gap-3">
          <span className="text-ink-soft">
            평균 <span className="font-semibold text-ink">{coaching.avgViews.toLocaleString()}</span>
          </span>
          <span className={lowSave ? 'text-warn' : 'text-ink-soft'}>
            저장률{' '}
            <span className={`font-semibold ${lowSave ? 'text-warn' : 'text-ink'}`}>
              {coaching.saveRate != null ? `${(coaching.saveRate * 100).toFixed(1)}%` : '—'}
            </span>
          </span>
        </span>
      </div>

      {/* 코칭 문구 + 카톡 복사 */}
      {coaching.tip && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-canvas p-3">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">{coaching.tip}</p>
          {coaching.kakao && (
            <button
              onClick={copyKakao}
              className="shrink-0 self-center rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink"
            >
              <span className="inline-flex items-center gap-1">
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? '복사됨' : coaching.actionLabel}
              </span>
            </button>
          )}
        </div>
      )}
      {copied && <p className="mt-1.5 text-right text-xs text-ok">복사됐어요. 카톡에 붙여넣으세요.</p>}
    </div>
  );
}
