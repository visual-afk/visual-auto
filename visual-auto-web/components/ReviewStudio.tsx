'use client';

import { useState } from 'react';
import { Sparkles, Copy, Check, RefreshCw, TrendingUp, Loader2, ExternalLink, Download } from 'lucide-react';

export type BranchOption = {
  id: string;
  name: string;
  naverPlaceId?: string | null;
  naverShortUrl?: string | null;
};

type Reply = { text: string; keywords_used: string[] };
type CrawledReview = { author: string; date: string; rating: number | null; text: string };

const TREATMENTS = ['결마지', '펌', '염색', '클리닉', '컷'];
const SMARTPLACE_URL = 'https://new.smartplace.naver.com/';

/** 지점의 네이버 공개 리뷰 페이지 딥링크 (placeId > 단축링크 > 스마트플레이스 홈) */
function reviewLinkFor(b?: BranchOption): string {
  if (b?.naverPlaceId) return `https://pcmap.place.naver.com/hairshop/${b.naverPlaceId}/review/visitor`;
  if (b?.naverShortUrl) return b.naverShortUrl;
  return SMARTPLACE_URL;
}

export default function ReviewStudio({
  branches,
  needsBranchPick,
}: {
  branches: BranchOption[];
  needsBranchPick: boolean;
}) {
  const [review, setReview] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [branchId, setBranchId] = useState<string>(needsBranchPick ? '' : branches[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  // 리뷰 불러오기(크롤) 상태
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlError, setCrawlError] = useState('');
  const [crawled, setCrawled] = useState<CrawledReview[] | null>(null);

  const selected = branches.find((b) => b.id === branchId);
  const hasReviewLink = !!(selected?.naverPlaceId || selected?.naverShortUrl);

  function toggleChip(c: string) {
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function openReviewPage() {
    window.open(reviewLinkFor(selected), '_blank', 'noopener');
  }

  async function loadReviews() {
    setCrawlError('');
    setCrawled(null);
    if (needsBranchPick && !branchId) {
      setCrawlError('어느 지점 리뷰인지 골라주세요');
      return;
    }
    setCrawlLoading(true);
    try {
      const res = await fetch('/api/review-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCrawlError(data.error || '리뷰를 불러오지 못했어요');
      } else if (!data.reviews?.length) {
        setCrawlError('불러올 리뷰가 없어요. "리뷰 보러가기"로 확인해주세요.');
      } else {
        setCrawled(data.reviews);
      }
    } catch {
      setCrawlError('리뷰를 불러오는 중 문제가 생겼어요');
    } finally {
      setCrawlLoading(false);
    }
  }

  function useReview(text: string) {
    setReview(text);
    setReplies(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function generate() {
    setError('');
    if (!review.trim()) {
      setError('리뷰 내용을 붙여넣어 주세요');
      return;
    }
    if (needsBranchPick && !branchId) {
      setError('어느 지점 리뷰인지 골라주세요');
      return;
    }
    setLoading(true);
    setReplies(null);
    try {
      const res = await fetch('/api/review-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_text: review, treatment_chips: chips, branch_id: branchId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || '답글을 만들지 못했어요');
      else setReplies(data.replies);
    } catch {
      setError('답글을 만드는 중 문제가 생겼어요');
    } finally {
      setLoading(false);
    }
  }

  async function copyAndOpen(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* 클립보드 실패해도 스마트플레이스는 연다 */
    }
    window.open(SMARTPLACE_URL, '_blank', 'noopener');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">리뷰 답글</h1>
      <p className="mt-1 text-sm text-ink-soft">리뷰를 붙여넣으면 매장 톤 답글을 써드려요</p>

      {/* 입력 */}
      <section className="mt-5 space-y-4">
        {needsBranchPick && (
          <label className="block">
            <span className="label">어느 지점 리뷰예요?</span>
            <select className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">지점 선택</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* 지점 공개 리뷰 딥링크 + 불러오기 */}
        {hasReviewLink && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={openReviewPage}>
              <span className="inline-flex items-center gap-1.5">
                <ExternalLink size={16} />
                이 지점 리뷰 보러가기
              </span>
            </button>
            <button className="btn-ghost" onClick={loadReviews} disabled={crawlLoading}>
              <span className="inline-flex items-center gap-1.5">
                {crawlLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {crawlLoading ? '불러오는 중…' : '리뷰 불러오기'}
              </span>
            </button>
          </div>
        )}

        {crawlError && <p className="text-sm text-warn">{crawlError}</p>}

        {/* 불러온 리뷰 목록 */}
        {crawled && crawled.length > 0 && (
          <div className="space-y-2">
            <span className="label">불러온 리뷰 · 눌러서 답글쓰기</span>
            {crawled.map((r, i) => (
              <button
                key={i}
                onClick={() => useReview(r.text)}
                className="block w-full rounded-xl2 border border-line bg-surface p-3 text-left shadow-card transition hover:border-brand"
              >
                <p className="line-clamp-3 whitespace-pre-wrap text-sm">{r.text}</p>
                <p className="mt-1.5 text-xs text-ink-soft">
                  {[r.author, r.rating ? `★${r.rating}` : '', r.date].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))}
          </div>
        )}

        <label className="block">
          <span className="label">고객 리뷰 붙여넣기</span>
          <textarea
            className="field min-h-32 resize-y"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="스마트플레이스에 올라온 리뷰를 그대로 붙여넣어 주세요"
          />
        </label>

        <div>
          <span className="label">어떤 시술 리뷰예요? (선택)</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {TREATMENTS.map((t) => (
              <button key={t} className={`chip ${chips.includes(t) ? 'chip-on' : ''}`} onClick={() => toggleChip(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-warn">{error}</p>}

        <button className="btn-primary" onClick={generate} disabled={loading}>
          <span className="inline-flex items-center gap-1.5">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {loading ? '답글 쓰는 중…' : '답글 써드릴게요'}
          </span>
        </button>
      </section>

      {/* 결과 */}
      {replies && (
        <section className="mt-8 space-y-4">
          <h2 className="flex items-center gap-1.5 text-base font-bold">
            <Sparkles size={16} className="text-brand" /> AI 답글 · 매장 톤
          </h2>
          {replies.map((r, i) => (
            <div key={i} className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.text}</p>
              {r.keywords_used?.length > 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
                  <TrendingUp size={14} className="text-ok" />
                  상위노출 키워드 반영: <span className="font-semibold text-ink">{r.keywords_used.join(', ')}</span>
                </p>
              )}
              <button className="btn-primary mt-3" onClick={() => copyAndOpen(r.text, i)}>
                <span className="inline-flex items-center gap-1.5">
                  {copied === i ? <Check size={18} /> : <Copy size={18} />}
                  {copied === i ? '복사됐어요!' : '복사하고 스마트플레이스 열기'}
                </span>
              </button>
            </div>
          ))}
          <button className="btn-ghost" onClick={generate} disabled={loading}>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw size={16} />
              다시 쓰기
            </span>
          </button>
        </section>
      )}
    </div>
  );
}
