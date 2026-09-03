'use client';

import { useState } from 'react';
import { Trash2, Plus, Camera } from 'lucide-react';
import type { InfoCard } from '@/lib/cardnews/cards';
import { MAX_CARDS } from '@/lib/cardnews/cards';

const KIND_LABEL: Record<InfoCard['kind'], string> = { cover: '표지', point: '포인트', cta: 'CTA' };

/**
 * 정보형 카드 편집 — 표지 훅 / 포인트 제목+본문 / CTA 제목+배지.
 * 표지에는 사진(교체 가능)과 말풍선 대사가 붙는다 (사진 표지 브랜드용, 없으면 그냥 빈 값).
 */
export default function InfoCardsEditor({
  cards,
  photoUrls,
  onChange,
  onPhotoAdded,
}: {
  cards: InfoCard[];
  photoUrls: Record<string, string>;
  onChange: (cards: InfoCard[]) => void;
  onPhotoAdded: (path: string, url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');

  function patch(idx: number, p: Partial<InfoCard>) {
    onChange(cards.map((c) => (c.idx === idx ? { ...c, ...p } : c)));
  }

  /** 표지 사진 업로드 — 이미지형 편집기와 같은 /api/upload-photo 사용 */
  async function uploadCoverPhoto(e: React.ChangeEvent<HTMLInputElement>, idx: number) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setPhotoError('');
    try {
      const form = new FormData();
      form.append('photo', file);
      form.append('slot', '0');
      const res = await fetch('/api/upload-photo', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '사진 업로드 실패');
      onPhotoAdded(data.storage_path, data.url);
      patch(idx, { photo_path: data.storage_path });
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setUploading(false);
    }
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
          {c.kind === 'cover' && (
            <div className="mb-2 flex gap-3">
              {c.photo_path && photoUrls[c.photo_path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrls[c.photo_path]} alt="" className="h-24 w-[4.8rem] shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-24 w-[4.8rem] shrink-0 items-center justify-center rounded-xl bg-ink-faint/10 text-ink-faint">
                  <Camera size={20} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-xs font-medium text-ink-soft">
                  <Camera size={14} />
                  {uploading ? '올리는 중…' : c.photo_path ? '사진 바꾸기' : '표지 사진 넣기'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => uploadCoverPhoto(e, c.idx)}
                    disabled={uploading}
                  />
                </label>
                {c.photo_hint && <p className="mt-1.5 text-xs text-ink-faint">추천 사진: {c.photo_hint}</p>}
                {!c.photo_path && !c.photo_hint && (
                  <p className="mt-1.5 text-xs text-ink-faint">사진을 넣기 전엔 &lsquo;사진 자리&rsquo;로 나와요</p>
                )}
              </div>
            </div>
          )}
          <textarea
            className="field min-h-0 resize-none py-2.5"
            rows={2}
            placeholder={c.kind === 'cover' ? '표지 훅 한 줄' : '카드 제목'}
            value={c.title}
            onChange={(e) => patch(c.idx, { title: e.target.value })}
          />
          {c.kind === 'cover' && (
            <input
              className="field mt-2 py-2.5"
              placeholder="말풍선 대사 (8~14자, 비우면 안 나와요)"
              value={c.bubble ?? ''}
              onChange={(e) => patch(c.idx, { bubble: e.target.value })}
            />
          )}
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
      {photoError && <p className="text-sm text-warn">{photoError}</p>}
      {cards.length < MAX_CARDS && (
        <button onClick={addPoint} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-3 text-sm font-medium text-ink-soft">
          <Plus size={16} /> 포인트 카드 추가
        </button>
      )}
    </div>
  );
}
