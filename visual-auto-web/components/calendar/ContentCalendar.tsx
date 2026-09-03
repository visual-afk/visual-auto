'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Table2, Trash2, RefreshCw, MousePointerClick, X } from 'lucide-react';
import type { CalendarDay, ScheduleItem, PublishedItem, TopicItem } from '@/lib/contentCalendar';
import { EMPTY_DAY } from '@/lib/contentCalendar';
import CalendarGrid, { type PlanKind } from './CalendarGrid';
import DayDetail from './DayDetail';
import ScheduleEditor, { type AssigneeOpt, type BranchOpt } from './ScheduleEditor';
import ContentDetailModal from './ContentDetailModal';
import BulkPlanner from './BulkPlanner';
import TopicEditor from '@/components/cardnews/TopicEditor';

function shiftMonth(month: string, diff: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + diff;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * 콘텐츠 캘린더 본체: 월 네비 + 지점 필터 + 그리드 + 날짜 상세 + 편집 모달.
 * 달력에서 직접 조작: 칩 드래그 = 날짜 이동, 선택 모드 = 일괄 삭제.
 */
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
  const [topicEdit, setTopicEdit] = useState<TopicItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // ── 선택 모드 (일괄 삭제) ──
  const [selectMode, setSelectMode] = useState(false);
  const [selSchedule, setSelSchedule] = useState<Set<string>>(new Set());
  const [selTopics, setSelTopics] = useState<Set<string>>(new Set());

  const canEdit = editableBranches.length > 0;
  const showBranch = branchParam === 'all';
  const [y, m] = month.split('-');

  const allDays = Object.values(days);
  const allScheduleIds = allDays.flatMap((d) => d.schedule.map((s) => s.id));
  const allTopicIds = allDays.flatMap((d) => d.topics.map((t) => t.id));
  const selCount = selSchedule.size + selTopics.size;
  const allSelected = selCount > 0 && selCount === allScheduleIds.length + allTopicIds.length;

  function setQuery(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    p.set(key, value);
    router.push(`${pathname}?${p.toString()}`);
  }

  const toggleIn = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggleSelect = (kind: PlanKind, id: string) => {
    if (kind === 'schedule') setSelSchedule((s) => toggleIn(s, id));
    else setSelTopics((s) => toggleIn(s, id));
  };
  const clearSelection = () => {
    setSelSchedule(new Set());
    setSelTopics(new Set());
  };
  const toggleAll = () => {
    if (allSelected) clearSelection();
    else {
      setSelSchedule(new Set(allScheduleIds));
      setSelTopics(new Set(allTopicIds));
    }
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };

  /** 칩 드래그 → 날짜 이동 */
  async function moveItem(kind: PlanKind, id: string, date: string) {
    const res = await fetch(kind === 'schedule' ? `/api/schedule/${id}` : `/api/cardnews-topics/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kind === 'schedule' ? { scheduled_date: date } : { topic_date: date }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || '날짜 이동에 실패했어요');
      return;
    }
    router.refresh();
  }

  async function removeSelected() {
    if (selCount === 0) return;
    const parts = [
      selSchedule.size > 0 ? `일정 ${selSchedule.size}` : '',
      selTopics.size > 0 ? `주제 ${selTopics.size}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (!confirm(`선택한 ${selCount}개(${parts})를 삭제할까요?\n주제 삭제는 영구예요 — 자동 편성이 되살리지 않아요.`)) return;
    setBusy(true);
    let failed = '';
    if (selSchedule.size > 0) {
      const res = await fetch('/api/schedule/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selSchedule] }),
      });
      if (!res.ok) failed = (await res.json().catch(() => ({}))).error || '일정 삭제 실패';
    }
    if (!failed && selTopics.size > 0) {
      const res = await fetch('/api/cardnews-topics/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selTopics] }),
      });
      if (!res.ok) failed = (await res.json().catch(() => ({}))).error || '주제 삭제 실패';
    }
    setBusy(false);
    if (failed) {
      alert(failed);
      return;
    }
    clearSelection();
    router.refresh();
  }

  async function reseed() {
    if (!confirm('브랜드 주제를 지금 다시 편성할까요? (마지막 편성일 이후를 은행에서 채워요)')) return;
    setBusy(true);
    const res = await fetch('/api/cardnews-topics/reseed', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      alert(body.error || '편성에 실패했어요');
      return;
    }
    alert(body.inserted > 0 ? `${body.inserted}개 주제를 새로 편성했어요` : '추가할 날짜가 없어요 (이미 채워져 있어요)');
    router.refresh();
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canEdit && !selectMode && (
            <>
              <button
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand"
              >
                <MousePointerClick size={15} /> 선택
              </button>
              <button
                onClick={reseed}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
              >
                <RefreshCw size={15} /> 주제 편성
              </button>
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
          {canEdit && selectMode && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-ink-soft">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-brand" />
                전체 선택
              </label>
              <button
                onClick={removeSelected}
                disabled={busy || selCount === 0}
                className="flex items-center gap-1.5 rounded-2xl border border-warn px-4 py-2 text-sm font-semibold text-warn disabled:opacity-40"
              >
                <Trash2 size={15} /> 선택 삭제{selCount > 0 ? ` (${selCount})` : ''}
              </button>
              <button
                onClick={exitSelectMode}
                className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft"
              >
                <X size={15} /> 완료
              </button>
            </>
          )}
        </div>
      </div>

      {selectMode && (
        <p className="text-xs text-ink-soft">칩을 클릭해서 고르세요 — 일정·주제만 선택돼요 (발행물 제외).</p>
      )}

      <CalendarGrid
        month={month}
        days={days}
        todayStr={todayStr}
        selectedDate={selectedDate}
        onSelect={(d) => setSelectedDate(d === selectedDate ? null : d)}
        onOpenPublished={setDetail}
        onOpenTopic={canEdit ? setTopicEdit : undefined}
        showBranch={showBranch}
        canEdit={canEdit}
        onMove={canEdit ? moveItem : undefined}
        selectMode={selectMode}
        selSchedule={selSchedule}
        selTopics={selTopics}
        onToggleSelect={toggleSelect}
      />

      {selectedDate && (
        <DayDetail
          date={selectedDate}
          day={days[selectedDate] ?? EMPTY_DAY}
          todayStr={todayStr}
          canEdit={canEdit}
          showBranch={showBranch}
          onAdd={() => setEditor({ open: true, item: null })}
          onEdit={(item) => setEditor({ open: true, item })}
          onOpenPublished={setDetail}
          onEditTopic={canEdit ? setTopicEdit : undefined}
          selectMode={selectMode}
          selSchedule={selSchedule}
          selTopics={selTopics}
          onToggleSelect={toggleSelect}
        />
      )}

      {topicEdit && <TopicEditor topic={topicEdit} onClose={() => setTopicEdit(null)} />}

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
