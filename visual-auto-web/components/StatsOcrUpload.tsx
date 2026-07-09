'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Loader2, Check, X } from 'lucide-react';

type BlogItem = {
  ocrTitle: string;
  views: number;
  post: { id: string; title: string | null; views: number | null } | null;
};

type PlaceData = {
  statDate?: string;
  period?: 'day' | 'week' | 'month';
  placeViews?: number | null;
  inflows?: { name: string; count: number }[];
  reviewCount?: number | null;
};

/**
 * 통계 스크린샷 업로드 → OCR → 확인 후 적용.
 * - mode='blog': 네이버 블로그 통계 화면 → 내 글 조회수 일괄 입력 (record_views 재사용)
 * - mode='place': 스마트플레이스 통계 화면 → place_stats 저장 (원장·본사)
 */
export default function StatsOcrUpload({ mode, branchId }: { mode: 'blog' | 'place'; branchId?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [blogItems, setBlogItems] = useState<BlogItem[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [place, setPlace] = useState<PlaceData | null>(null);

  function reset() {
    setBlogItems(null);
    setPlace(null);
    setChecked(new Set());
    setError('');
  }

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 5);
    e.target.value = '';
    if (!files.length) return;
    reset();
    setDone('');
    setLoading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const res = await fetch('/api/stats-ocr', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '사진에서 통계를 읽지 못했어요');
        return;
      }
      if (data.type === 'blog') {
        if (mode !== 'blog') {
          setError('블로그 통계 화면이에요. 조회수는 "내 글·조회수" 화면에서 올려주세요.');
          return;
        }
        const items: BlogItem[] = data.items || [];
        setBlogItems(items);
        setChecked(new Set(items.filter((i) => i.post).map((i) => i.post!.id)));
      } else if (data.type === 'place') {
        if (mode !== 'place') {
          setError('스마트플레이스 통계 화면이에요. 성과 대시보드에서 올려주세요.');
          return;
        }
        setPlace({
          statDate: data.place.statDate || new Date().toISOString().slice(0, 10),
          period: data.place.period || 'week',
          placeViews: data.place.placeViews,
          inflows: data.place.inflows || [],
          reviewCount: data.place.reviewCount,
        });
      }
    } catch {
      setError('사진을 읽는 중 문제가 생겼어요');
    } finally {
      setLoading(false);
    }
  }

  async function applyBlog() {
    if (!blogItems) return;
    setApplying(true);
    setError('');
    let ok = 0;
    for (const item of blogItems) {
      if (!item.post || !checked.has(item.post.id)) continue;
      const res = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.post.id, action: 'record_views', views: item.views }),
      });
      if (res.ok) ok += 1;
    }
    setApplying(false);
    setDone(`${ok}개 글 조회수를 기록했어요`);
    reset();
    router.refresh();
  }

  async function applyPlace() {
    if (!place) return;
    setApplying(true);
    setError('');
    const res = await fetch('/api/place-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branchId,
        stat_date: place.statDate,
        period: place.period,
        place_views: place.placeViews,
        review_count: place.reviewCount,
        inflows: place.inflows,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setApplying(false);
    if (!res.ok) {
      setError(data.error || '저장에 실패했어요');
      return;
    }
    setDone('플레이스 통계를 기록했어요');
    reset();
    router.refresh();
  }

  const label = mode === 'blog' ? '블로그 통계 스크린샷으로 한 번에 입력' : '스마트플레이스 통계 스크린샷 올리기';
  const hint =
    mode === 'blog'
      ? '네이버 블로그 앱 → 통계 화면을 캡처해서 올리면, 글별 조회수를 자동으로 채워요.'
      : '스마트플레이스 앱 → 통계 화면을 캡처해서 올리면, 플레이스 조회·유입·리뷰 수를 기록해요.';

  return (
    <div className="rounded-xl2 border border-line bg-surface p-4">
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickPhotos} />
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand/50 bg-brand/5 px-4 py-3 text-sm font-semibold text-brand disabled:opacity-50"
        onClick={() => fileRef.current?.click()}
        disabled={loading || applying}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
        {loading ? '사진 읽는 중…' : label}
      </button>
      <p className="mt-2 text-xs text-ink-faint">{hint}</p>
      {error && <p className="mt-2 text-sm text-warn">{error}</p>}
      {done && (
        <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-ok">
          <Check size={14} /> {done}
        </p>
      )}

      {/* 블로그: 매칭 결과 확인 */}
      {blogItems && (
        <div className="mt-3 space-y-2">
          {blogItems.map((item, i) => {
            const matched = !!item.post;
            const on = matched && checked.has(item.post!.id);
            return (
              <button
                key={i}
                type="button"
                disabled={!matched}
                onClick={() => {
                  if (!item.post) return;
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.post!.id)) next.delete(item.post!.id);
                    else next.add(item.post!.id);
                    return next;
                  });
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm ${
                  !matched ? 'border-line bg-canvas opacity-50' : on ? 'border-brand bg-brand/5' : 'border-line bg-surface'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{item.post?.title || item.ocrTitle}</span>
                  <span className="text-xs text-ink-faint">
                    {matched
                      ? `${item.post!.views != null ? `${item.post!.views.toLocaleString()} → ` : ''}${item.views.toLocaleString()}회`
                      : '앱에서 쓴 글이 아니에요 (건너뜀)'}
                  </span>
                </span>
                {matched && (on ? <Check size={16} className="shrink-0 text-brand" /> : <X size={16} className="shrink-0 text-ink-faint" />)}
              </button>
            );
          })}
          <button className="btn-primary" onClick={applyBlog} disabled={applying || checked.size === 0}>
            {applying ? '기록 중…' : `${checked.size}개 조회수 기록하기`}
          </button>
        </div>
      )}

      {/* 플레이스: 값 검수 후 저장 */}
      {place && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">기준일</label>
              <input
                className="field"
                type="date"
                value={place.statDate || ''}
                onChange={(e) => setPlace({ ...place, statDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">기간</label>
              <select
                className="field"
                value={place.period || 'week'}
                onChange={(e) => setPlace({ ...place, period: e.target.value as PlaceData['period'] })}
              >
                <option value="day">하루</option>
                <option value="week">주간</option>
                <option value="month">월간</option>
              </select>
            </div>
            <div>
              <label className="label">플레이스 조회수</label>
              <input
                className="field"
                inputMode="numeric"
                value={place.placeViews ?? ''}
                onChange={(e) => setPlace({ ...place, placeViews: e.target.value === '' ? null : Number(e.target.value.replace(/[^0-9]/g, '')) })}
              />
            </div>
            <div>
              <label className="label">리뷰 수</label>
              <input
                className="field"
                inputMode="numeric"
                value={place.reviewCount ?? ''}
                onChange={(e) => setPlace({ ...place, reviewCount: e.target.value === '' ? null : Number(e.target.value.replace(/[^0-9]/g, '')) })}
              />
            </div>
          </div>
          {!!place.inflows?.length && (
            <div>
              <p className="label">유입 (읽은 값)</p>
              <ul className="space-y-1 text-sm">
                {place.inflows.map((f, i) => (
                  <li key={i} className="flex justify-between rounded-lg bg-canvas px-3 py-1.5">
                    <span className="truncate text-ink-soft">{f.name}</span>
                    <span className="font-semibold tabular-nums">{f.count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn-primary" onClick={applyPlace} disabled={applying}>
            {applying ? '저장 중…' : '이대로 기록하기'}
          </button>
        </div>
      )}
    </div>
  );
}
