'use client';

import { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Camera } from 'lucide-react';
import type { ImageCard } from '@/lib/cardnews/cards';
import { MAX_CARDS } from '@/lib/cardnews/cards';

/** 이미지형 슬라이드 편집 — 순서(↑↓), 한 줄 문구, 사진 추가/삭제. 마지막 카드가 자동으로 CTA. */
export default function ImageCardsEditor({
  cards,
  photoUrls,
  onChange,
  onPhotoAdded,
}: {
  cards: ImageCard[];
  photoUrls: Record<string, string>;
  onChange: (cards: ImageCard[]) => void;
  onPhotoAdded: (path: string, url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  function normalize(list: ImageCard[]): ImageCard[] {
    return list.map((c, i) => ({ ...c, idx: i, is_cta: i === list.length - 1 }));
  }

  function patch(i: number, p: Partial<ImageCard>) {
    onChange(normalize(cards.map((c, j) => (j === i ? { ...c, ...p } : c))));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= cards.length) return;
    const next = [...cards];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(normalize(next));
  }

  function remove(i: number) {
    if (cards.length <= 1) return;
    onChange(normalize(cards.filter((_, j) => j !== i)));
  }

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || cards.length >= MAX_CARDS) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('photo', file);
      form.append('slot', String(cards.length + 1));
      const res = await fetch('/api/upload-photo', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '사진 업로드 실패');
      onPhotoAdded(data.storage_path, data.url);
      onChange(normalize([...cards, { idx: 0, photo_path: data.storage_path, phrase: '', is_cta: false }]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {cards.map((c, i) => (
        <div key={`${c.photo_path}-${i}`} className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
          {c.photo_path && photoUrls[c.photo_path] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrls[c.photo_path]} alt="" className="h-24 w-[4.8rem] shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-24 w-[4.8rem] shrink-0 items-center justify-center rounded-xl bg-ink-faint/10 text-ink-faint">
              <Camera size={20} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-faint">
                {i + 1}번 카드{c.is_cta ? ' · 예약 배지' : ''}
              </span>
              <span className="flex items-center gap-2 text-ink-soft">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30" aria-label="위로">
                  <ArrowUp size={15} />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === cards.length - 1} className="disabled:opacity-30" aria-label="아래로">
                  <ArrowDown size={15} />
                </button>
                <button onClick={() => remove(i)} disabled={cards.length <= 1} className="text-warn disabled:opacity-30" aria-label="삭제">
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
            <input
              className="field py-2.5"
              placeholder="한 줄 문구 (예: 10년 곱슬, 오늘 결마지)"
              value={c.phrase}
              onChange={(e) => patch(i, { phrase: e.target.value })}
            />
          </div>
        </div>
      ))}
      {cards.length < MAX_CARDS && (
        <label className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3 text-sm font-medium text-ink-soft">
          <Camera size={16} /> {uploading ? '올리는 중…' : '사진 추가'}
          <input type="file" accept="image/*" className="hidden" onChange={addPhoto} disabled={uploading} />
        </label>
      )}
      {error && <p className="text-sm text-warn">{error}</p>}
    </div>
  );
}
