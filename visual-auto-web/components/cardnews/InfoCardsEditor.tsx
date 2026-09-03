'use client';

import { useState } from 'react';
import { Trash2, Plus, Camera, Sparkles } from 'lucide-react';
import type { InfoCard } from '@/lib/cardnews/cards';
import { MAX_CARDS, LETTER_SPACING_MIN, LETTER_SPACING_MAX, clampLetterSpacing } from '@/lib/cardnews/cards';
import PhotoAdjuster from './PhotoAdjuster';

const KIND_LABEL: Record<InfoCard['kind'], string> = { cover: '표지', point: '포인트', cta: 'CTA' };

/**
 * 정보형 카드 편집 — 표지 훅 / 포인트 제목+본문 / CTA 제목+배지.
 * 표지에는 사진(교체 가능)과 말풍선 대사가 붙는다 (사진 표지 브랜드용, 없으면 그냥 빈 값).
 */
export default function InfoCardsEditor({
  cards,
  cardNewsId,
  photoUrls,
  photoCards,
  onChange,
  onPhotoAdded,
}: {
  cards: InfoCard[];
  cardNewsId: string; // AI 사진 생성 요청에 필요
  photoUrls: Record<string, string>;
  photoCards: boolean; // 사진 카드 브랜드면 카드마다 사진 넣기 UI를 띄운다
  onChange: (cards: InfoCard[]) => void;
  onPhotoAdded: (path: string, url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState('');

  function patch(idx: number, p: Partial<InfoCard>) {
    onChange(cards.map((c) => (c.idx === idx ? { ...c, ...p } : c)));
  }

  /** 카드 사진 업로드 — 이미지형 편집기와 같은 /api/upload-photo 사용 */
  async function uploadCardPhoto(e: React.ChangeEvent<HTMLInputElement>, idx: number) {
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

  /** 사진 지시문대로 AI가 사진을 만들어 넣는다 (브랜드 사진 톤 파일 적용) */
  async function generateCardPhoto(card: InfoCard) {
    setGeneratingIdx(card.idx);
    setPhotoError('');
    try {
      const res = await fetch('/api/card-news/generate-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_news_id: cardNewsId, idx: card.idx, hint: card.photo_hint ?? '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '사진 생성 실패');
      onPhotoAdded(data.storage_path, data.url);
      // 새 사진이니 확대·위치는 기본으로
      patch(card.idx, { photo_path: data.storage_path, photo_scale: 1, photo_x: 0, photo_y: 0 });
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setGeneratingIdx(null);
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
  const letterSpacing = clampLetterSpacing(cards[0]?.letter_spacing);

  /** 자간은 카드마다 저장하되 슬라이더 하나로 전체에 적용한다 */
  function setLetterSpacing(v: number) {
    const ls = clampLetterSpacing(v);
    onChange(cards.map((c) => ({ ...c, letter_spacing: ls })));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-faint">자간 (글자 사이 간격)</span>
          <span className="flex items-center gap-2 text-xs text-ink-soft">
            {letterSpacing > 0 ? `+${letterSpacing}` : letterSpacing}
            {letterSpacing !== 0 && (
              <button onClick={() => setLetterSpacing(0)} className="font-medium text-brand">
                기본값
              </button>
            )}
          </span>
        </div>
        <input
          type="range"
          min={LETTER_SPACING_MIN}
          max={LETTER_SPACING_MAX}
          step={0.5}
          value={letterSpacing}
          onChange={(e) => setLetterSpacing(Number(e.target.value))}
          className="w-full accent-brand"
          aria-label="자간"
        />
        <p className="mt-1 text-xs text-ink-faint">왼쪽으로 갈수록 좁아지고 오른쪽으로 갈수록 넓어져요 (모든 카드에 적용)</p>
      </div>
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
          {photoCards && (
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
                <div className="flex gap-2">
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-xs font-medium text-ink-soft">
                    <Camera size={14} />
                    {uploading ? '올리는 중…' : c.photo_path ? '사진 바꾸기' : '사진 넣기'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadCardPhoto(e, c.idx)}
                      disabled={uploading || generatingIdx !== null}
                    />
                  </label>
                  <button
                    onClick={() => generateCardPhoto(c)}
                    disabled={generatingIdx !== null || uploading}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand py-2 text-xs font-semibold text-brand disabled:opacity-50"
                  >
                    <Sparkles size={14} />
                    {generatingIdx === c.idx ? '만드는 중…' : 'AI 생성'}
                  </button>
                </div>
                {c.photo_hint && <p className="mt-1.5 text-xs text-ink-faint">추천 사진: {c.photo_hint}</p>}
                {!c.photo_path && !c.photo_hint && (
                  <p className="mt-1.5 text-xs text-ink-faint">사진을 넣기 전엔 &lsquo;사진 자리&rsquo;로 나와요</p>
                )}
              </div>
            </div>
          )}
          {photoCards && c.photo_path && photoUrls[c.photo_path] && (
            <PhotoAdjuster
              photoUrl={photoUrls[c.photo_path]}
              scale={c.photo_scale}
              x={c.photo_x}
              y={c.photo_y}
              onChange={(v) => patch(c.idx, v)}
            />
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
