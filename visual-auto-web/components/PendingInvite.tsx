'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { roleLabel, type Role } from '@/lib/roles';

/** 수락 대기 중인 초대 카드 — 다시 보내기(링크 재공유) / 취소(삭제) */
export default function PendingInvite({
  inviteId,
  inviteeName,
  role,
  link,
  branchName,
}: {
  inviteId: string;
  inviteeName: string | null;
  role: Role;
  link: string;
  branchName?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // 데스크탑 공유시트는 카톡/문자로 전송이 안 돼서, 항상 링크를 복사해 준다.
  async function resend() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* 클립보드 실패해도 아래 안내는 그대로 */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function cancel() {
    if (!confirm('이 초대를 취소할까요?')) return;
    setBusy(true);
    const res = await fetch(`/api/invites/${inviteId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '취소에 실패했어요');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 rounded-xl2 border border-warn/40 bg-warn/5 px-4 py-3">
      <Clock size={18} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{inviteeName || '초대한 사람'}</span>
        <span className="text-ink-soft">
          {' · '}
          {roleLabel[role]}
          {branchName ? ` · ${branchName}` : ''}
          {' · 수락 대기 중'}
        </span>
      </span>
      <button onClick={resend} className="shrink-0 text-sm font-semibold text-brand">
        {copied ? '복사됐어요 ✓' : '링크 복사'}
      </button>
      <button onClick={cancel} disabled={busy} className="shrink-0 text-sm font-medium text-ink-faint hover:text-warn">
        취소
      </button>
    </div>
  );
}
