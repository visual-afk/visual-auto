'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clapperboard, ExternalLink, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import type { CalendarDay, TopicItem, TopicStatus } from '@/lib/contentCalendar';

const COLS: { status: TopicStatus; label: string }[] = [
  { status: 'planning', label: '기획중' },
  { status: 'reference', label: '레퍼런스' },
  { status: 'filmed', label: '촬영완료' },
  { status: 'uploaded', label: '업로드완료' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateLabel(date: string): string {
  const dow = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))} (${dow})`;
}

/**
 * 카드뉴스 주제 칸반 보드 — 드래그로 상태 이동(기획중→레퍼런스→촬영완료→업로드완료),
 * 체크박스 선택/전체 삭제, "지금 다시 편성". DnD 패턴은 strategy/ExperimentBoard 계승.
 */
export default function TopicBoard({
  days,
  canEdit,
  showBranch,
  onOpen,
}: {
  days: Record<string, CalendarDay>;
  canEdit: boolean;
  showBranch: boolean;
  onOpen: (t: TopicItem) => void;
}) {
  const router = useRouter();
  const topics = Object.values(days)
    .flatMap((d) => d.topics)
    .sort((a, b) => a.topic_date.localeCompare(b.topic_date));
  const skipped = topics.filter((t) => t.status === 'skipped');

  const [dragId, setDragId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [skippedOpen, setSkippedOpen] = useState(false);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = topics.length > 0 && selected.size === topics.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(topics.map((t) => t.id)));

  async function drop(status: TopicStatus) {
    const t = topics.find((x) => x.id === dragId);
    setDragId(null);
    if (!t || !canEdit || t.status === status) return;
    const res = await fetch(`/api/cardnews-topics/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || '상태 변경에 실패했어요');
      return;
    }
    router.refresh();
  }

  async function removeSelected() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}개 주제를 삭제할까요? (삭제는 영구예요 — 자동 편성이 되살리지 않아요)`)) return;
    setBusy(true);
    const res = await fetch('/api/cardnews-topics/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      alert(body.error || '삭제에 실패했어요');
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  async function reseed() {
    if (!confirm('지금 다시 편성할까요? (마지막 편성일 이후를 은행에서 새로 채워요 — 전체 삭제 후 실행하면 오늘부터 새로 짜져요)')) return;
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

  function Card({ t }: { t: TopicItem }) {
    const factWarn = t.verify_needed && !t.fact_confirmed;
    return (
      <div
        draggable={canEdit}
        onDragStart={() => setDragId(t.id)}
        onClick={() => canEdit && onOpen(t)}
        className={`rounded-xl border bg-surface p-2.5 ${canEdit ? 'cursor-pointer hover:border-brand' : ''} ${
          t.status === 'skipped' ? 'border-line opacity-60' : 'border-line'
        }`}
      >
        <div className="flex items-start gap-2">
          {canEdit && (
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={() => toggle(t.id)}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-faint">
              {dateLabel(t.topic_date)}
              {showBranch && t.branchName ? ` · ${t.branchName}` : ''}
            </p>
            <p className={`mt-0.5 text-sm font-medium ${t.status === 'skipped' ? 'line-through' : ''}`}>{t.material}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {t.frame && <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-soft">{t.frame}</span>}
              {factWarn && (
                <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">팩트 확인 필요</span>
              )}
              {t.reference_url && (
                <a
                  href={t.reference_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-0.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft hover:border-brand hover:text-brand"
                >
                  <Clapperboard size={11} /> 레퍼런스
                </a>
              )}
              {t.card_news_id && (
                <a
                  href={`/card-news/${t.card_news_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-0.5 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-semibold text-ok"
                >
                  <ExternalLink size={11} /> 카드뉴스
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-ink-soft">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-brand" />
            전체 선택
          </label>
          <button
            onClick={removeSelected}
            disabled={busy || selected.size === 0}
            className="flex items-center gap-1.5 rounded-2xl border border-warn px-4 py-2 text-sm font-semibold text-warn disabled:opacity-40"
          >
            <Trash2 size={14} /> 선택 삭제{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <div className="ml-auto">
            <button
              onClick={reseed}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
            >
              <RefreshCw size={14} /> 지금 다시 편성
            </button>
          </div>
        </div>
      )}

      {topics.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-sm text-ink-faint">
          이 달에 편성된 주제가 없어요. {canEdit ? '"지금 다시 편성"을 누르면 은행에서 채워져요.' : ''}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {COLS.map((col) => {
          const cards = topics.filter((t) => t.status === col.status);
          return (
            <div
              key={col.status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(col.status)}
              className="min-h-[10rem] rounded-xl2 border border-line bg-canvas/50 p-2.5"
            >
              <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-ink-soft">
                {col.label} <span className="text-ink-faint">{cards.length}</span>
              </p>
              <div className="space-y-2">
                {cards.map((t) => (
                  <Card key={t.id} t={t} />
                ))}
                {cards.length === 0 && <p className="px-1 py-4 text-center text-xs text-ink-faint">없음</p>}
              </div>
            </div>
          );
        })}
      </div>

      {skipped.length > 0 && (
        <div className="rounded-xl2 border border-line bg-surface p-3">
          <button
            onClick={() => setSkippedOpen((v) => !v)}
            className="flex items-center gap-1 text-sm font-semibold text-ink-soft"
          >
            {skippedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            건너뜀 {skipped.length}개
          </button>
          {skippedOpen && (
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              {skipped.map((t) => (
                <Card key={t.id} t={t} />
              ))}
            </div>
          )}
        </div>
      )}

      {canEdit && <p className="text-xs text-ink-faint">카드를 끌어서 상태를 옮기고, 클릭하면 수정 창이 열려요.</p>}
    </div>
  );
}
