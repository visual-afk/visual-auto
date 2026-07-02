'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/** 이번 주 / 이번 달 토글 — ?period=week|month 쿼리로 서버 컴포넌트 재조회 */
export default function PeriodToggle({ value }: { value: 'week' | 'month' }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(next: 'week' | 'month') {
    const p = new URLSearchParams(params.toString());
    p.set('period', next);
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="inline-flex rounded-xl border border-line bg-surface p-0.5 text-sm">
      {(['week', 'month'] as const).map((k) => (
        <button
          key={k}
          onClick={() => set(k)}
          className={`rounded-lg px-3 py-1.5 font-semibold transition ${
            value === k ? 'bg-brand text-brand-ink' : 'text-ink-soft'
          }`}
        >
          {k === 'week' ? '이번 주' : '이번 달'}
        </button>
      ))}
    </div>
  );
}
