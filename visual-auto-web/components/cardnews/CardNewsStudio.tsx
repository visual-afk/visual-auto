'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Send, RotateCw, Check, Trash2 } from 'lucide-react';
import type { CardNews, InfoCard, ImageCard } from '@/lib/cardnews/cards';
import type { CardFrame } from '@/lib/cardnews/frames';
import ScaledCard from './ScaledCard';
import InfoCardsEditor from './InfoCardsEditor';
import ImageCardsEditor from './ImageCardsEditor';
import CaptionPanel from './CaptionPanel';

/**
 * 카드뉴스 에디터 — 미리보기 스트립 + 카드 편집 + 저장/다운로드/인스타/링크 등록.
 * 릴스의 "올리고 링크 등록 → 조회수 추적" 패턴을 그대로 따른다.
 */
export default function CardNewsStudio({
  initial,
  frame,
  branchName,
  photoUrls: initialPhotoUrls,
}: {
  initial: CardNews;
  frame: CardFrame;
  branchName: string;
  photoUrls: Record<string, string>; // storage_path → 공개 URL
}) {
  const router = useRouter();
  const mode = initial.mode;
  const [cards, setCards] = useState(initial.cards);
  const [caption, setCaption] = useState(initial.caption ?? '');
  const [hashtags, setHashtags] = useState<string[]>(initial.hashtags ?? []);
  const [photoUrls, setPhotoUrls] = useState(initialPhotoUrls);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState(initial.published_url ?? '');
  const [published, setPublished] = useState(initial.status === 'published');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  function updateCards(next: typeof cards) {
    setCards(next);
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/card-news/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', cards, caption, hashtags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setDirty(false);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** AI로 현재 장수 기준 다시 구성 (정보형) */
  async function regenerate() {
    if (!initial.post_id) return;
    if (!window.confirm('지금 카드 내용을 버리고 AI가 다시 구성할까요?')) return;
    setRegenerating(true);
    setError('');
    try {
      const res = await fetch('/api/card-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: initial.post_id, card_count: cards.length, card_news_id: initial.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '다시 구성 실패');
      setCards(data.cardNews.cards);
      if (data.cardNews.caption != null) setCaption(data.cardNews.caption);
      if (data.cardNews.hashtags) setHashtags(data.cardNews.hashtags);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  }

  /** 카드 전부 PNG 저장 — 연속 다운로드 스로틀을 피해 400ms 간격 */
  async function downloadAll() {
    if (dirty && !(await save())) return;
    setError('');
    for (let i = 0; i < cards.length; i++) {
      setDownloading(`${i + 1}/${cards.length} 저장 중…`);
      try {
        const res = await fetch(`/api/card-news/${initial.id}/render/${i}`);
        if (!res.ok) throw new Error('카드 이미지를 못 만들었어요');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `카드뉴스-${branchName}-${i + 1}.png`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError((e as Error).message);
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    setDownloading(null);
  }

  async function openInstagram() {
    if (mode === 'image' && (caption || hashtags.length)) {
      try {
        await navigator.clipboard.writeText([caption.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n'));
      } catch {
        /* 무시 */
      }
    }
    window.open('https://www.instagram.com/', '_blank');
  }

  async function registerLink() {
    if (!publishedUrl.trim()) {
      setError('올린 게시물 주소를 붙여넣어 주세요');
      return;
    }
    setRegistering(true);
    setError('');
    try {
      const publishRes = await fetch(`/api/card-news/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', published_url: publishedUrl.trim() }),
      });
      if (!publishRes.ok) throw new Error('링크 등록 실패');
      await fetch(`/api/card-news/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_views', published_url: publishedUrl.trim(), next_check: true }),
      });
      setPublished(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegistering(false);
    }
  }

  async function discard() {
    if (!window.confirm('이 카드뉴스를 버릴까요? 되돌릴 수 없어요.')) return;
    const res = await fetch(`/api/card-news/${initial.id}`, { method: 'DELETE' });
    if (res.ok) router.push('/card-news');
  }

  const photoSrcOf = (c: InfoCard | ImageCard) =>
    mode === 'image' ? (photoUrls[(c as ImageCard).photo_path] ?? null) : null;

  return (
    <div className="py-6 md:py-0">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">카드뉴스</h1>
        {!published && (
          <button onClick={discard} className="flex items-center gap-1 text-sm font-medium text-warn">
            <Trash2 size={14} /> 버리기
          </button>
        )}
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        {branchName} · {mode === 'info' ? '정보형 — 글이 카드에 들어가요' : '이미지형 — 사진이 슬라이드, 글은 캡션으로'}
      </p>

      {/* 미리보기 스트립 */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {cards.map((c, i) => (
          <ScaledCard
            key={i}
            width={236}
            mode={mode}
            card={c}
            tokens={frame.tokens}
            branchName={branchName}
            photoSrc={photoSrcOf(c)}
            pageIndex={i}
            pageCount={cards.length}
          />
        ))}
      </div>

      {/* 편집 */}
      <div className="mt-5 space-y-4">
        {mode === 'info' ? (
          <>
            <InfoCardsEditor cards={cards as InfoCard[]} onChange={updateCards} />
            {initial.post_id && (
              <button
                onClick={regenerate}
                disabled={regenerating}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-brand bg-brand-wash py-3 text-sm font-semibold text-brand disabled:opacity-50"
              >
                <RotateCw size={15} /> {regenerating ? 'AI가 다시 구성 중…' : '이 장수로 AI 다시 뽑기'}
              </button>
            )}
          </>
        ) : (
          <>
            <ImageCardsEditor
              cards={cards as ImageCard[]}
              photoUrls={photoUrls}
              onChange={updateCards}
              onPhotoAdded={(path, url) => setPhotoUrls((prev) => ({ ...prev, [path]: url }))}
            />
            <CaptionPanel
              caption={caption}
              hashtags={hashtags}
              onCaptionChange={(v) => {
                setCaption(v);
                setDirty(true);
              }}
              onHashtagsChange={(v) => {
                setHashtags(v);
                setDirty(true);
              }}
            />
          </>
        )}

        <button onClick={save} disabled={saving || !dirty} className="btn-ghost disabled:opacity-50">
          {saving ? '저장 중…' : savedTick ? <span className="flex items-center justify-center gap-1"><Check size={16} /> 저장됐어요</span> : '수정 저장'}
        </button>
      </div>

      {/* 내보내기 */}
      <div className="mt-6 space-y-3 border-t border-line pt-5">
        <button onClick={downloadAll} disabled={!!downloading} className="btn-primary disabled:opacity-60">
          <span className="flex items-center justify-center gap-1.5">
            <Download size={18} /> {downloading ?? `전부 저장 (${cards.length}장 PNG)`}
          </span>
        </button>
        <button onClick={openInstagram} className="btn-ghost">
          <span className="flex items-center justify-center gap-1.5">
            <Send size={18} /> 인스타 열기{mode === 'image' ? ' (캡션 복사됨)' : ''}
          </span>
        </button>
        <p className="text-center text-xs text-ink-faint">저장한 사진을 인스타에서 캐러셀로 올려주세요. 자동 업로드는 안 해요.</p>
      </div>

      {/* 올린 뒤 링크 등록 → 조회수 추적 (릴스와 동일 패턴) */}
      <div className="mt-6 border-t border-line pt-5">
        <p className="label">올리고 링크 등록</p>
        {published ? (
          <p className="flex items-center gap-1.5 rounded-2xl bg-brand-wash px-4 py-3 text-sm font-medium text-brand">
            <Check size={16} /> 추적 중이에요 — 조회수는 내 글·조회수에서 확인해요
          </p>
        ) : (
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              className="field"
              placeholder="올린 게시물 주소 붙여넣기"
              value={publishedUrl}
              onChange={(e) => setPublishedUrl(e.target.value)}
            />
            <button onClick={registerLink} disabled={registering} className="btn-primary md:w-auto md:whitespace-nowrap md:px-5">
              {registering ? '등록 중…' : '링크 등록하고 추적 시작'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
    </div>
  );
}
