'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Brand = { id: string; name: string };

/**
 * 주제로 카드뉴스 만들기 — 블로그 글 없이 브랜드 + 주제만으로 정보형 카드 생성.
 * POST /api/card-news { branch_id, topic, card_count } → 생성된 초안으로 이동.
 */
export default function NewFromTopic({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(brands[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (!branchId || !topic.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/card-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId, topic: topic.trim(), card_count: count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      router.push(`/card-news/${data.cardNews.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (brands.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-semibold">주제로 카드뉴스 만들기</p>
      <div className="flex flex-col gap-2 md:flex-row">
        <select
          className="field md:w-36"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          aria-label="브랜드"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          className="field flex-1"
          placeholder="예: 새치, 뽑으면 두 개 나요?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
          }}
        />
        <select
          className="field md:w-24"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="카드 장수"
        >
          {[3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n}장
            </option>
          ))}
        </select>
        <button
          onClick={create}
          disabled={busy || !topic.trim()}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
        >
          {busy ? '만드는 중…' : '만들기'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-ink-faint">브랜드 컨셉에 맞춰 정보형 카드(표지·포인트·CTA)가 자동 생성돼요.</p>
    </div>
  );
}
