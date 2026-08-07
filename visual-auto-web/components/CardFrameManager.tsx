'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import ScaledCard from './cardnews/ScaledCard';
import type { CardFrameTokens } from '@/lib/cardnews/frames';
import type { InfoCard, ImageCard, CardNewsMode } from '@/lib/cardnews/cards';

export interface FrameEntry {
  branchId: string | null; // null = 지점(살롱) 기본
  branchName: string; // 표시용
  mode: CardNewsMode;
  tokens: CardFrameTokens;
}

const SAMPLE_INFO: InfoCard = { idx: 0, kind: 'cover', title: '매직인데\n머릿결이 좋아진다?', body: '' };
const SAMPLE_IMAGE: ImageCard = { idx: 0, photo_path: '', phrase: '10년 곱슬,\n오늘 결마지', is_cta: false };

const COLOR_FIELDS: { key: keyof CardFrameTokens; label: string; modes: CardNewsMode[] }[] = [
  { key: 'point', label: '포인트', modes: ['info', 'image'] },
  { key: 'ink', label: '텍스트', modes: ['info', 'image'] },
  { key: 'bg', label: '표지 배경', modes: ['info'] },
  { key: 'surface', label: '포인트 카드 배경', modes: ['info'] },
  { key: 'ctaBg', label: 'CTA 배경', modes: ['info'] },
  { key: 'ctaInk', label: 'CTA 텍스트', modes: ['info'] },
];

/** 브랜드별 카드 프레임(컬러·로고·모드) 편집 — 미니 미리보기가 즉시 반영된다. */
export default function CardFrameManager({ initialFrames }: { initialFrames: FrameEntry[] }) {
  const [frames, setFrames] = useState(initialFrames);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  function keyOf(f: FrameEntry) {
    return f.branchId ?? 'default';
  }

  function patch(f: FrameEntry, p: Partial<FrameEntry>) {
    setFrames((prev) => prev.map((x) => (keyOf(x) === keyOf(f) ? { ...x, ...p } : x)));
  }

  async function save(f: FrameEntry) {
    setSavingId(keyOf(f));
    setError('');
    try {
      const res = await fetch('/api/admin/card-frames', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: f.branchId, mode: f.mode, tokens: f.tokens }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setSavedId(keyOf(f));
      setTimeout(() => setSavedId(null), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {frames.map((f) => (
        <div key={keyOf(f)} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <ScaledCard
              width={168}
              mode={f.mode}
              card={f.mode === 'image' ? SAMPLE_IMAGE : SAMPLE_INFO}
              tokens={f.tokens}
              branchName={f.branchName}
              photoSrc={null}
              pageIndex={0}
              pageCount={3}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{f.branchName}</p>
                <select
                  className="rounded-xl border border-line bg-surface px-2 py-1 text-sm"
                  value={f.mode}
                  onChange={(e) => patch(f, { mode: e.target.value as CardNewsMode })}
                >
                  <option value="info">정보형 (글이 카드에)</option>
                  <option value="image">이미지형 (사진이 카드에)</option>
                </select>
              </div>
              <div>
                <p className="label">로고 텍스트 (비우면 지점명)</p>
                <input
                  className="field py-2.5"
                  value={f.tokens.logoText ?? ''}
                  onChange={(e) => patch(f, { tokens: { ...f.tokens, logoText: e.target.value } })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {COLOR_FIELDS.filter((c) => c.modes.includes(f.mode)).map((c) => (
                  <label key={c.key} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                    <input
                      type="color"
                      className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      value={(f.tokens[c.key] as string) || '#000000'}
                      onChange={(e) => patch(f, { tokens: { ...f.tokens, [c.key]: e.target.value } })}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{c.label}</span>
                    <span className="text-xs text-ink-faint">{(f.tokens[c.key] as string) || '-'}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => save(f)}
                disabled={savingId === keyOf(f)}
                className="btn-primary py-3 disabled:opacity-50"
              >
                {savingId === keyOf(f) ? (
                  '저장 중…'
                ) : savedId === keyOf(f) ? (
                  <span className="flex items-center justify-center gap-1"><Check size={16} /> 저장됐어요</span>
                ) : (
                  '이 프레임 저장'
                )}
              </button>
            </div>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-warn">{error}</p>}
    </div>
  );
}
