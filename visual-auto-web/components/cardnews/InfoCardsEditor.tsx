'use client';

import { Trash2, Plus } from 'lucide-react';
import type { InfoCard } from '@/lib/cardnews/cards';
import { MAX_CARDS } from '@/lib/cardnews/cards';

const KIND_LABEL: Record<InfoCard['kind'], string> = { cover: '표지', point: '포인트', cta: 'CTA' };

/** 정보형 카드 텍스트 편집 — 표지 훅 / 포인트 제목+본문 / CTA 제목+배지. */
export default function InfoCardsEditor({
  cards,
  onChange,
}: {
  cards: InfoCard[];
  onChange: (cards: InfoCard[]) => void;
}) {
  function patch(idx: number, p: Partial<InfoCard>) {
    onChange(cards.map((c) => (c.idx === idx ? { ...c, ...p } : c)));
  }

  function reindex(list: InfoCard[]): InfoCard[] {
    return list.map((c, i) => ({ ...c, idx: i }));
  }

  function removePoint(idx: number) {
    onChange(reindex(cards.filter((c) => c.idx !== idx)));
  }

  function addPoint() {
    if (cards.length >= MAX_CARDS) return;
    const cta = cards[cards.length - 1];
    onChange(reindex([...cards.slice(0, -1), { idx: 0, kind: 'point', title: '', body: '' }, cta]));
  }

  const pointCount = cards.filter((c) => c.kind === 'point').length;

  return (
    <div className="space-y-3">
      {cards.map((c) => (
        <div key={`${c.kind}-${c.idx}`} className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-faint">
              {c.kind === 'point' ? `${KIND_LABEL[c.kind]} ${String(c.idx).padStart(2, '0')}` : KIND_LABEL[c.kind]}
            </span>
            {c.kind === 'point' && pointCount > 1 && (
              <button onClick={() => removePoint(c.idx)} className="text-warn" aria-label="카드 삭제">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <textarea
            className="field min-h-0 resize-none py-2.5"
            rows={2}
            placeholder={c.kind === 'cover' ? '표지 훅 한 줄' : '카드 제목'}
            value={c.title}
            onChange={(e) => patch(c.idx, { title: e.target.value })}
          />
          {c.kind !== 'cover' && (
            <textarea
              className="field mt-2 min-h-0 resize-none py-2.5"
              rows={2}
              placeholder={c.kind === 'cta' ? '배지 문구 (예: 프로필 링크 ↓)' : '본문 최대 2줄'}
              value={c.body}
              onChange={(e) => patch(c.idx, { body: e.target.value })}
            />
          )}
        </div>
      ))}
      {cards.length < MAX_CARDS && (
        <button onClick={addPoint} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3 text-sm font-medium text-ink-soft">
          <Plus size={16} /> 포인트 카드 추가
        </button>
      )}
    </div>
  );
}
