'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

/** 내 글 목록에서 발행 안 한 초안을 지우는 버튼 (발행 글엔 안 보임) */
export default function DraftDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!window.confirm('이 초안을 지울까요? 되돌릴 수 없어요.')) return;
    setBusy(true);
    const res = await fetch('/api/posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '초안을 못 지웠어요');
    }
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-full border border-warn px-2.5 py-1 text-xs font-medium text-warn disabled:opacity-50"
    >
      <Trash2 size={12} /> {busy ? '지우는 중…' : '초안 지우기'}
    </button>
  );
}
