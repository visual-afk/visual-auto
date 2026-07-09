'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PenLine, Film, Plus, Check, RotateCcw } from 'lucide-react';
import type { CalendarDay, ScheduleItem } from '@/lib/contentCalendar';
import { scheduleChipClass, TYPE_LABEL } from './CalendarGrid';

/** 선택한 날짜의 상세: 계획 항목(상태 조작) + 발행물 링크 */
export default function DayDetail({
  date,
  day,
  canEdit,
  showBranch,
  onAdd,
  onEdit,
}: {
  date: string;
  day: CalendarDay;
  canEdit: boolean;
  showBranch: boolean;
  onAdd: () => void;
  onEdit: (item: ScheduleItem) => void;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(item: ScheduleItem, status: ScheduleItem['status']) {
    setBusyId(item.id);
    const res = await fetch(`/api/schedule/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || '변경에 실패했어요');
      return;
    }
    router.refresh();
  }

  const [, m, d] = date.split('-');
  const label = `${Number(m)}월 ${Number(d)}일`;

  return (
    <div className="rounded-xl2 border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{label}</h3>
        {canEdit && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink"
          >
            <Plus size={13} /> 일정 추가
          </button>
        )}
      </div>

      {day.schedule.length === 0 && day.published.length === 0 && (
        <p className="mt-3 text-sm text-ink-faint">이 날은 등록된 일정과 발행물이 없어요.</p>
      )}

      {day.schedule.length > 0 && (
        <ul className="mt-3 space-y-2">
          {day.schedule.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${scheduleChipClass(s)}`}>
                {TYPE_LABEL[s.content_type]}
              </span>
              <button
                onClick={() => canEdit && onEdit(s)}
                className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${
                  s.status === 'canceled' ? 'text-ink-faint line-through' : ''
                }`}
              >
                {s.title}
                <span className="ml-1.5 text-xs font-normal text-ink-faint">
                  {showBranch && s.branchName ? `${s.branchName} · ` : ''}
                  {s.assigneeName ?? ''}
                </span>
              </button>
              {canEdit &&
                (s.status === 'planned' ? (
                  <button
                    onClick={() => setStatus(s, 'done')}
                    disabled={busyId === s.id}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-ok px-2.5 py-1 text-xs font-medium text-ok"
                  >
                    <Check size={12} /> 완료
                  </button>
                ) : (
                  <button
                    onClick={() => setStatus(s, 'planned')}
                    disabled={busyId === s.id}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft"
                  >
                    <RotateCcw size={12} /> 예정으로
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}

      {day.published.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold text-ink-faint">이 날 발행됨</p>
          <ul className="mt-1.5 space-y-1.5">
            {day.published.map((p) => {
              const Icon = p.kind === 'post' ? PenLine : Film;
              const inner = (
                <span className="flex items-center gap-2 text-sm">
                  <Icon size={14} className="shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate">
                    {showBranch && p.branchName ? `${p.branchName} · ` : ''}
                    {p.title}
                  </span>
                  {p.views != null && (
                    <span className="shrink-0 text-xs font-semibold text-brand">{p.views.toLocaleString()}회</span>
                  )}
                </span>
              );
              return (
                <li key={`${p.kind}-${p.id}`}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer" className="block hover:opacity-70">
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
