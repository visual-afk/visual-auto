'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Copy, Check, RefreshCw, TrendingUp, Loader2, ExternalLink, Download, ImagePlus } from 'lucide-react';
import ReviewImportHelp from './ReviewImportHelp';
import { usePersistentState } from '@/lib/usePersistentState';

export type BranchOption = {
  id: string;
  name: string;
  naverPlaceId?: string | null;
  naverShortUrl?: string | null;
};

type Reply = { text: string; keywords_used: string[] };
type CrawledReview = {
  author: string;
  date: string;
  rating: number | null;
  text: string;
  designer?: string;
  hasReply?: boolean;
};

const TREATMENTS = ['결마지', '펌', '염색', '클리닉', '컷'];
const SMARTPLACE_URL = 'https://new.smartplace.naver.com/';

/** 지점의 네이버 공개 리뷰 페이지 딥링크 (placeId > 단축링크 > 스마트플레이스 홈) */
function reviewLinkFor(b?: BranchOption): string {
  if (b?.naverPlaceId) {
    // pcmap은 PC 전용 렌더링이라 모바일에선 m.place로 열어야 리뷰 탭이 제대로 뜬다
    const mobile = typeof navigator !== 'undefined' && /iPhone|Android|Mobile/i.test(navigator.userAgent);
    const host = mobile ? 'm.place.naver.com' : 'pcmap.place.naver.com';
    return `https://${host}/hairshop/${b.naverPlaceId}/review/visitor`;
  }
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
  // 새로고침해도 안 날아가게 자동 임시저장
  const [review, setReview] = usePersistentState<string>('va:review:text', '');
  const [chips, setChips] = usePersistentState<string[]>('va:review:chips', []);
  const [branchId, setBranchId] = useState<string>(needsBranchPick ? '' : branches[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  // 북마클릿으로 가져온 리뷰 + 도움말 모달
  const [crawled, setCrawled] = useState<CrawledReview[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [showReplied, setShowReplied] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = branches.find((b) => b.id === branchId);
  const hasReviewLink = !!(selected?.naverPlaceId || selected?.naverShortUrl);

  // 북마클릿이 넘긴 리뷰(#import=...)를 받아 목록에 세팅
  useEffect(() => {
    const m = window.location.hash.match(/import=([^&]+)/);
    if (!m) return;
    try {
      const arr = JSON.parse(decodeURIComponent(m[1]));
      if (Array.isArray(arr) && arr.length) {
        setCrawled(
          arr
            .filter((r) => r && typeof r.text === 'string' && r.text.trim())
            .map((r) => ({
              text: String(r.text).trim(),
              author: String(r.author ?? ''),
              date: String(r.date ?? ''),
              rating: typeof r.rating === 'number' ? r.rating : null,
              designer: String(r.designer ?? ''),
              hasReply: !!r.hasReply,
            })),
        );
      }
    } catch {
      /* 잘못된 해시는 무시 */
    }
    history.replaceState(null, '', window.location.pathname);
  }, []);

  function toggleChip(c: string) {
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function openReviewPage() {
    window.open(reviewLinkFor(selected), '_blank', 'noopener');
  }

  // 리뷰 스크린샷 업로드 → AI가 읽어 목록으로 (휴대폰용)
  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 5);
    e.target.value = ''; // 같은 파일 다시 선택 가능하게
    if (!files.length) return;
    if (needsBranchPick && !branchId) {
      setOcrError('어느 지점 리뷰인지 먼저 골라주세요');
      return;
    }
    setOcrError('');
    setOcrLoading(true);
    setCrawled(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      if (branchId) fd.append('branch_id', branchId);
      const res = await fetch('/api/review-ocr', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setOcrError(data.error || '사진에서 리뷰를 읽지 못했어요');
      else setCrawled(data.reviews);
    } catch {
      setOcrError('사진을 읽는 중 문제가 생겼어요');
    } finally {
      setOcrLoading(false);
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
    // 실제 사용(복사)을 코칭 카운트에 반영 — 실패해도 무시
    fetch('/api/review-reply/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId || undefined }),
    }).catch(() => {});
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

        {/* 리뷰 가져오기: 사진(휴대폰) 우선 + 딥링크/북마클릿(PC) */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPickPhotos}
        />
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={ocrLoading}>
            <span className="inline-flex items-center gap-1.5">
              {ocrLoading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {ocrLoading ? '사진 읽는 중…' : '리뷰 사진에서 가져오기'}
            </span>
          </button>
          {hasReviewLink && (
            <>
              <button className="btn-ghost" onClick={openReviewPage}>
                <span className="inline-flex items-center gap-1.5">
                  <ExternalLink size={16} />
                  이 지점 리뷰 보러가기
                </span>
              </button>
              <button className="btn-ghost" onClick={() => setImportOpen(true)}>
                <span className="inline-flex items-center gap-1.5">
                  <Download size={16} />
                  리뷰 자동 가져오기 (PC)
                </span>
              </button>
            </>
          )}
        </div>
        {ocrError && <p className="text-sm text-warn">{ocrError}</p>}

        {/* 북마클릿으로 가져온 리뷰 목록 */}
        {crawled &&
          crawled.length > 0 &&
          (() => {
            const needsReply = crawled.filter((r) => !r.hasReply);
            const replied = crawled.filter((r) => r.hasReply);

            const meta = (r: CrawledReview) =>
              [r.author, r.designer ? `담당 ${r.designer}` : '', r.rating ? `★${r.rating}` : '', r.date]
                .filter(Boolean)
                .join(' · ');

            return (
              <div className="space-y-2">
                <span className="label">
                  가져온 리뷰 · 눌러서 답글쓰기
                  {needsReply.length > 0 && ` (답글 필요 ${needsReply.length}개)`}
                </span>

                {needsReply.map((r, i) => (
                  <button
                    key={`n${i}`}
                    onClick={() => useReview(r.text)}
                    className="block w-full rounded-xl2 border border-line bg-surface p-3 text-left shadow-card transition hover:border-brand"
                  >
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm">{r.text}</p>
                    <p className="mt-1.5 text-xs text-ink-soft">{meta(r)}</p>
                  </button>
                ))}

                {needsReply.length === 0 && (
                  <p className="text-sm text-ink-soft">답글이 필요한 리뷰가 없어요. (모두 답글 완료)</p>
                )}

                {replied.length > 0 && (
                  <>
                    <button
                      className="text-xs font-semibold text-ink-soft underline"
                      onClick={() => setShowReplied((v) => !v)}
                    >
                      {showReplied ? '이미 답글 단 리뷰 접기' : `이미 답글 단 리뷰 ${replied.length}개 보기`}
                    </button>
                    {showReplied &&
                      replied.map((r, i) => (
                        <button
                          key={`r${i}`}
                          onClick={() => useReview(r.text)}
                          className="block w-full rounded-xl2 border border-line bg-surface p-3 text-left opacity-60 transition hover:opacity-100"
                        >
                          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">
                            <Check size={12} /> 이미 답글 완료
                          </span>
                          <p className="line-clamp-3 whitespace-pre-wrap text-sm">{r.text}</p>
                          <p className="mt-1.5 text-xs text-ink-soft">{meta(r)}</p>
                        </button>
                      ))}
                  </>
                )}
              </div>
            );
          })()}

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

      {importOpen && <ReviewImportHelp onClose={() => setImportOpen(false)} />}
    </div>
  );
}
