'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PenLine, Film, Plus, Check, RotateCcw, Bell } from 'lucide-react';
import type { CalendarDay, ScheduleItem, PublishedItem } from '@/lib/contentCalendar';
import { isOverdue } from '@/lib/contentCalendar';
import { scheduleChipClass, TYPE_LABEL } from './CalendarGrid';

/** YYYY-MM-DD 간 경과 일수 (b - a) */
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400_000);
}

/** 선택한 날짜의 상세: 계획 항목(상태·알림 조작) + 발행물(상세 팝업) */
export default function DayDetail({
  date,
  day,
  todayStr,
  canEdit,
  showBranch,
  onAdd,
  onEdit,
  onOpenPublished,
}: {
  date: string;
  day: CalendarDay;
  todayStr: string;
  canEdit: boolean;
  showBranch: boolean;
  onAdd: () => void;
  onEdit: (item: ScheduleItem) => void;
  onOpenPublished: (item: PublishedItem) => void;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function sendReminder(item: ScheduleItem) {
    setBusyId(item.id);
    setNotice(null);
    const res = await fetch(`/api/schedule/${item.id}/notify`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setNotice(body.error || '알림 발송에 실패했어요');
      return;
    }
    setNotice(body.sent > 0 ? `알림톡 ${body.sent}건을 보냈어요` : '발송 대상 연락처가 없거나 알림톡이 설정되지 않았어요');
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
          {day.schedule.map((s) => {
            const overdue = isOverdue(s, todayStr);
            return (
              <li key={s.id} className="flex items-center gap-2">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${scheduleChipClass(s, todayStr)}`}
                >
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
                  {overdue && (
                    <span className="ml-1.5 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">
                      {daysBetween(s.scheduled_date, todayStr)}일 지남
                    </span>
                  )}
                </button>
                {canEdit && overdue && (
                  <button
                    onClick={() => sendReminder(s)}
                    disabled={busyId === s.id}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-warn px-2.5 py-1 text-xs font-medium text-warn disabled:opacity-50"
                  >
                    <Bell size={12} /> 알림
                  </button>
                )}
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
            );
          })}
        </ul>
      )}

      {notice && <p className="mt-2 text-xs text-ink-soft">{notice}</p>}

      {day.published.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold text-ink-faint">이 날 발행됨</p>
          <ul className="mt-1.5 space-y-1.5">
            {day.published.map((p) => {
              const Icon = p.kind === 'post' ? PenLine : Film;
              return (
                <li key={`${p.kind}-${p.id}`}>
                  <button onClick={() => onOpenPublished(p)} className="flex w-full items-center gap-2 text-left text-sm hover:opacity-70">
                    <Icon size={14} className="shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate">
                      {showBranch && p.branchName ? `${p.branchName} · ` : ''}
                      {p.title}
                      {p.authorName && <span className="ml-1.5 text-xs text-ink-faint">{p.authorName}</span>}
                    </span>
                    {p.views != null && (
                      <span className="shrink-0 text-xs font-semibold text-brand">{p.views.toLocaleString()}회</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
