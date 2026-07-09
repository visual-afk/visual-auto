'use client';

import { PenLine, Film, Check } from 'lucide-react';
import type { CalendarDay, ScheduleItem, PublishedItem } from '@/lib/contentCalendar';

/** 계획 칩 색: 유형별 (기존 토큰만 사용) */
export function scheduleChipClass(item: ScheduleItem): string {
  if (item.status === 'canceled') return 'bg-ink-faint/10 text-ink-faint line-through';
  if (item.content_type === 'blog') return 'bg-brand-wash text-brand';
  if (item.content_type === 'reels') return 'bg-warn/15 text-warn';
  return 'bg-ink-faint/15 text-ink-soft';
}

export const TYPE_LABEL: Record<ScheduleItem['content_type'], string> = {
  blog: '블로그',
  reels: '릴스',
  etc: '기타',
};

function ScheduleChip({ item, showBranch }: { item: ScheduleItem; showBranch: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${scheduleChipClass(item)}`}
    >
      {item.status === 'done' && <Check size={11} className="shrink-0 text-ok" />}
      <span className="truncate">
        {showBranch && item.branchName ? `${item.branchName.replace('점', '')}·` : ''}
        {item.title}
      </span>
    </span>
  );
}

function PublishedChip({ item, showBranch }: { item: PublishedItem; showBranch: boolean }) {
  const Icon = item.kind === 'post' ? PenLine : Film;
  return (
    <span className="flex items-center gap-1 truncate rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-soft">
      <Icon size={11} className="shrink-0" />
      <span className="truncate">
        {showBranch && item.branchName ? `${item.branchName.replace('점', '')}·` : ''}
        {item.title}
      </span>
    </span>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** month('YYYY-MM')의 날짜 배열: 앞쪽 null 패딩(일요일 시작) + 1..말일 */
function buildCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const lastDate = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: firstDow }, () => null);
  for (let d = 1; d <= lastDate; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}

export default function CalendarGrid({
  month,
  days,
  todayStr,
  selectedDate,
  onSelect,
  showBranch,
}: {
  month: string;
  days: Record<string, CalendarDay>;
  todayStr: string;
  selectedDate: string | null;
  onSelect: (date: string) => void;
  showBranch: boolean;
}) {
  const cells = buildCells(month);

  return (
    <>
      {/* PC: 7열 월 그리드 */}
      <div className="hidden overflow-hidden rounded-xl2 border border-line bg-surface md:block">
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`px-2 py-2 text-center text-xs font-semibold ${i === 0 ? 'text-warn' : 'text-ink-faint'}`}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} className="min-h-[6.5rem] border-b border-r border-line/60 bg-canvas/40" />;
            const day = days[date];
            const total = (day?.schedule.length ?? 0) + (day?.published.length ?? 0);
            const shown = [
              ...(day?.schedule.slice(0, 2) ?? []).map((s) => ({ kind: 'schedule' as const, s })),
              ...(day?.published.slice(0, 1) ?? []).map((p) => ({ kind: 'published' as const, p })),
            ].slice(0, 3);
            const isToday = date === todayStr;
            const isSelected = date === selectedDate;
            return (
              <button
                key={date}
                onClick={() => onSelect(date)}
                className={`min-h-[6.5rem] border-b border-r border-line/60 p-1.5 text-left align-top transition ${
                  isSelected ? 'bg-brand-wash' : 'hover:bg-canvas'
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday ? 'bg-brand text-brand-ink' : 'text-ink-soft'
                  }`}
                >
                  {Number(date.slice(8))}
                </span>
                <div className="mt-1 space-y-0.5">
                  {shown.map((c, j) =>
                    c.kind === 'schedule' ? (
                      <ScheduleChip key={`s-${j}`} item={c.s} showBranch={showBranch} />
                    ) : (
                      <PublishedChip key={`p-${j}`} item={c.p} showBranch={showBranch} />
                    ),
                  )}
                  {total > shown.length && (
                    <span className="block px-1 text-[10px] text-ink-faint">+{total - shown.length}개 더</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 모바일: 항목 있는 날짜 리스트 (오늘 포함) */}
      <div className="space-y-2 md:hidden">
        {cells
          .filter((d): d is string => !!d && (!!days[d] || d === todayStr))
          .map((date) => {
            const day = days[date] ?? { schedule: [], published: [] };
            const isToday = date === todayStr;
            const dow = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
            return (
              <button
                key={date}
                onClick={() => onSelect(date)}
                className={`w-full rounded-xl2 border p-3 text-left ${
                  date === selectedDate ? 'border-brand bg-brand-wash' : 'border-line bg-surface'
                }`}
              >
                <p className={`text-xs font-bold ${isToday ? 'text-brand' : 'text-ink-faint'}`}>
                  {Number(date.slice(5, 7))}.{Number(date.slice(8))} ({dow}){isToday ? ' · 오늘' : ''}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {day.schedule.map((s) => (
                    <ScheduleChip key={s.id} item={s} showBranch={showBranch} />
                  ))}
                  {day.published.map((p) => (
                    <PublishedChip key={`${p.kind}-${p.id}`} item={p} showBranch={showBranch} />
                  ))}
                  {day.schedule.length === 0 && day.published.length === 0 && (
                    <span className="text-xs text-ink-faint">일정 없음</span>
                  )}
                </div>
              </button>
            );
          })}
      </div>
    </>
  );
}
