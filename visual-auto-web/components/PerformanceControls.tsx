'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PeriodType } from '@/lib/metrics';

export type BranchOpt = { id: string; name: string; hasSource: boolean; kind?: 'salon' | 'brand' };

/** 성과 페이지 공용 컨트롤: 지점/브랜드 선택 + 월간·주간 토글 + 기간 네비게이션 */
export default function PerformanceControls({
  branchId,
  period,
  refDate,
  rangeLabel,
  prevRef,
  nextRef,
  canGoNext,
  monthOptions,
  branchOpts,
  showPicker,
}: {
  branchId: string;
  period: PeriodType;
  refDate: string;
  rangeLabel: string;
  prevRef: string;
  nextRef: string;
  canGoNext: boolean;
  monthOptions: { ref: string; label: string }[];
  branchOpts: BranchOpt[];
  showPicker: boolean;
}) {
  const router = useRouter();

  const go = (next: { branch?: string; period?: string; ref?: string }) => {
    const p = new URLSearchParams();
    p.set('branch', next.branch ?? branchId);
    p.set('period', next.period ?? period);
    p.set('ref', next.ref ?? refDate);
    router.push(`/performance?${p.toString()}`);
  };

  // 월간 드롭다운의 현재 값: refDate가 속한 달의 1일
  const refMonth = `${refDate.slice(0, 7)}-01`;
  const salons = branchOpts.filter((b) => b.kind !== 'brand');
  const brands = branchOpts.filter((b) => b.kind === 'brand');
  const optionRow = (b: BranchOpt) => (
    <option key={b.id} value={b.id}>
      {b.name}
      {!b.hasSource ? ' (연동 전)' : ''}
    </option>
  );

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {showPicker && (
        <select className="field w-auto py-2" value={branchId} onChange={(e) => go({ branch: e.target.value })}>
          {brands.length ? (
            <>
              <optgroup label="지점">{salons.map(optionRow)}</optgroup>
              <optgroup label="브랜드">{brands.map(optionRow)}</optgroup>
            </>
          ) : (
            salons.map(optionRow)
          )}
        </select>
      )}
      <div className="flex gap-1 rounded-full bg-canvas p-1">
        {(['month', 'week'] as PeriodType[]).map((p) => (
          <button
            key={p}
            onClick={() => go({ period: p })}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${period === p ? 'bg-brand text-brand-ink' : 'text-ink-soft'}`}
          >
            {p === 'month' ? '월간' : '주간'}
          </button>
        ))}
      </div>

      {/* 기간 네비게이션: ◀ [기간] ▶ — 월간은 드롭다운 점프, 주간은 라벨 */}
      <div className="flex items-center gap-1 rounded-full bg-canvas p-1">
        <button
          onClick={() => go({ ref: prevRef })}
          className="rounded-full p-1.5 text-ink-soft active:bg-line"
          aria-label="이전 기간"
        >
          <ChevronLeft size={16} />
        </button>
        {period === 'month' ? (
          <select
            className="appearance-none rounded-full bg-transparent px-1 py-1 text-sm font-semibold text-ink outline-none"
            value={monthOptions.some((o) => o.ref === refMonth) ? refMonth : monthOptions[0]?.ref ?? refMonth}
            onChange={(e) => go({ ref: e.target.value })}
            aria-label="월 선택"
          >
            {monthOptions.map((o) => (
              <option key={o.ref} value={o.ref}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="px-1 text-sm font-semibold tabular-nums">{rangeLabel}</span>
        )}
        <button
          onClick={() => go({ ref: nextRef })}
          disabled={!canGoNext}
          className="rounded-full p-1.5 text-ink-soft active:bg-line disabled:opacity-30"
          aria-label="다음 기간"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
