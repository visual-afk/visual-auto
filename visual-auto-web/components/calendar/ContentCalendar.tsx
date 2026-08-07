'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Table2 } from 'lucide-react';
import type { CalendarDay, ScheduleItem, PublishedItem } from '@/lib/contentCalendar';
import CalendarGrid from './CalendarGrid';
import DayDetail from './DayDetail';
import ScheduleEditor, { type AssigneeOpt, type BranchOpt } from './ScheduleEditor';
import ContentDetailModal from './ContentDetailModal';
import BulkPlanner from './BulkPlanner';

function shiftMonth(month: string, diff: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + diff;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** 콘텐츠 캘린더 본체: 월 네비 + 지점 필터 + 그리드 + 날짜 상세 + 편집 모달 */
export default function ContentCalendar({
  month,
  todayStr,
  days,
  branchParam, // 'all' | branchId
  branchOpts, // 필터 셀렉트 옵션 (hq: 전 지점, 멀티 원장: 소속 지점)
  editableBranches, // 일정 등록 가능한 지점 (디자이너는 [])
  canPickBranch,
  isHq,
  assignees,
}: {
  month: string;
  todayStr: string;
  days: Record<string, CalendarDay>;
  branchParam: string;
  branchOpts: BranchOpt[];
  editableBranches: BranchOpt[];
  canPickBranch: boolean;
  isHq: boolean;
  assignees: AssigneeOpt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [selectedDate, setSelectedDate] = useState<string | null>(
    todayStr.startsWith(month) ? todayStr : null,
  );
  const [editor, setEditor] = useState<{ open: boolean; item: ScheduleItem | null }>({
    open: false,
    item: null,
  });
  const [detail, setDetail] = useState<PublishedItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const canEdit = editableBranches.length > 0;
  const showBranch = branchParam === 'all';
  const [y, m] = month.split('-');

  function setQuery(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    p.set(key, value);
    router.push(`${pathname}?${p.toString()}`);
  }

  // 편집 모달 기본 지점: 현재 필터 지점(등록 가능하면) → 첫 등록 가능 지점
  const defaultBranchId =
    editableBranches.find((b) => b.id === branchParam)?.id ?? editableBranches[0]?.id ?? '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setQuery('month', shiftMonth(month, -1))}
            className="rounded-xl border border-line bg-surface p-2 text-ink-soft hover:bg-canvas"
            aria-label="이전 달"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[7.5rem] text-center text-base font-bold">
            {y}년 {Number(m)}월
          </span>
          <button
            onClick={() => setQuery('month', shiftMonth(month, 1))}
            className="rounded-xl border border-line bg-surface p-2 text-ink-soft hover:bg-canvas"
            aria-label="다음 달"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {canPickBranch && (
          <select
            value={branchParam}
            onChange={(e) => setQuery('branch', e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium outline-none"
          >
            {isHq && <option value="all">전사 (전 지점)</option>}
            {branchOpts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => setBulkOpen(true)}
                className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand"
              >
                <Table2 size={15} /> 월 기획 짜기
              </button>
              <button
                onClick={() => setEditor({ open: true, item: null })}
                className="flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
              >
                <Plus size={15} /> 일정 추가
              </button>
            </>
          )}
        </div>
      </div>

      <CalendarGrid
        month={month}
        days={days}
        todayStr={todayStr}
        selectedDate={selectedDate}
        onSelect={(d) => setSelectedDate(d === selectedDate ? null : d)}
        onOpenPublished={setDetail}
        showBranch={showBranch}
      />

      {selectedDate && (
        <DayDetail
          date={selectedDate}
          day={days[selectedDate] ?? { schedule: [], published: [] }}
          todayStr={todayStr}
          canEdit={canEdit}
          showBranch={showBranch}
          onAdd={() => setEditor({ open: true, item: null })}
          onEdit={(item) => setEditor({ open: true, item })}
          onOpenPublished={setDetail}
        />
      )}

      {editor.open && (
        <ScheduleEditor
          item={editor.item}
          defaultDate={selectedDate ?? (todayStr.startsWith(month) ? todayStr : `${month}-01`)}
          defaultBranchId={editor.item?.branch_id ?? defaultBranchId}
          branchOpts={editableBranches}
          assignees={assignees}
          onClose={() => setEditor({ open: false, item: null })}
        />
      )}

      {detail && <ContentDetailModal item={detail} onClose={() => setDetail(null)} />}

      {bulkOpen && (
        <BulkPlanner
          month={month}
          defaultDate={selectedDate ?? (todayStr.startsWith(month) ? todayStr : `${month}-01`)}
          defaultBranchId={defaultBranchId}
          branchOpts={editableBranches}
          assignees={assignees}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
