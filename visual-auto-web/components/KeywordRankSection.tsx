'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';

type RankRow = {
  keyword: string;
  source: 'naver_blog' | 'naver_web' | 'gsc';
  rank: number | null;
  matched_url: string | null;
  impressions: number | null;
  clicks: number | null;
  check_date: string;
};

type RankData = {
  period: string | null;
  checkDate: string | null;
  rows: RankRow[];
  prevRows: RankRow[];
};

function fmtDate(d: string | null): string {
  if (!d) return '';
  const [, m, day] = d.split('-');
  return `${Number(m)}.${Number(day)}`;
}

/** 키워드별 상위노출 현황 — 네이버 블로그탭 순위 + 구글 서치콘솔. 키워드 조사 탭 하단에 붙는다. */
export default function KeywordRankSection({ branchId }: { branchId: string }) {
  const [data, setData] = useState<RankData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rank-check?branch_id=${branchId}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setData(json);
      else setError(json.error || '조회에 실패했어요');
    } catch {
      setError('조회 중 문제가 생겼어요');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setError('');
    setData(null);
    load();
  }, [load]);

  async function runCheck() {
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/rank-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error || '체크에 실패했어요');
      else if (json.results?.[0]?.error) setError(json.results[0].error);
      await load();
    } catch {
      setError('체크 중 문제가 생겼어요');
    } finally {
      setChecking(false);
    }
  }

  const naverRows = (data?.rows ?? []).filter((r) => r.source === 'naver_blog');
  const gscByKeyword = new Map((data?.rows ?? []).filter((r) => r.source === 'gsc').map((r) => [r.keyword, r]));
  const prevNaver = new Map(
    (data?.prevRows ?? []).filter((r) => r.source === 'naver_blog').map((r) => [r.keyword, r.rank]),
  );
  const hasGsc = gscByKeyword.size > 0;

  return (
    <div className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">상위노출 현황</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            네이버 블로그탭 기준 순위예요 (통합검색 노출과는 다를 수 있어요)
            {data?.checkDate && ` · 마지막 체크: ${fmtDate(data.checkDate)}`}
          </p>
        </div>
        <button className="btn-ghost w-auto whitespace-nowrap px-4" onClick={runCheck} disabled={checking}>
          <span className="inline-flex items-center gap-1.5">
            {checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {checking ? '체크 중… (1~2분)' : '지금 체크'}
          </span>
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-warn">{error}</p>}

      {loading ? (
        <p className="mt-4 text-center text-sm text-ink-faint">불러오는 중…</p>
      ) : naverRows.length === 0 ? (
        <p className="mt-4 rounded-xl2 border border-line bg-surface px-4 py-6 text-center text-sm text-ink-faint">
          아직 체크한 기록이 없어요. &lsquo;지금 체크&rsquo;를 눌러주세요.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl2 border border-line bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint">
            <span className="flex-1">키워드</span>
            <span className="w-16 text-center">네이버</span>
            <span className="w-12 text-center">추이</span>
            {hasGsc && <span className="w-28 text-center">구글 노출·클릭</span>}
            {hasGsc && <span className="w-14 text-center">구글 순위</span>}
            <span className="w-10 text-center">글</span>
          </div>
          <ul className="divide-y divide-line">
            {naverRows.map((r) => {
              const prev = prevNaver.get(r.keyword);
              const delta = r.rank != null && prev != null ? prev - r.rank : null; // +N = 상승
              const gsc = gscByKeyword.get(r.keyword);
              return (
                <li key={r.keyword} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 truncate text-sm font-semibold">{r.keyword}</span>
                  <span
                    className={`w-16 text-center text-sm font-bold tabular-nums ${
                      r.rank != null && r.rank <= 10 ? 'text-ok' : r.rank != null ? '' : 'text-ink-faint'
                    }`}
                  >
                    {r.rank != null ? `${r.rank}위` : '-'}
                  </span>
                  <span
                    className={`w-12 text-center text-xs font-semibold tabular-nums ${
                      delta == null || delta === 0 ? 'text-ink-faint' : delta > 0 ? 'text-ok' : 'text-warn'
                    }`}
                  >
                    {delta == null ? '·' : delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '-'}
                  </span>
                  {hasGsc && (
                    <span className="w-28 text-center text-xs tabular-nums text-ink-soft">
                      {gsc ? `${(gsc.impressions ?? 0).toLocaleString()} · ${(gsc.clicks ?? 0).toLocaleString()}` : '-'}
                    </span>
                  )}
                  {hasGsc && (
                    <span className="w-14 text-center text-sm tabular-nums">
                      {gsc?.rank != null ? `${gsc.rank}위` : '-'}
                    </span>
                  )}
                  <span className="flex w-10 justify-center">
                    {r.matched_url ? (
                      <a
                        href={r.matched_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:opacity-70"
                        aria-label="잡힌 글 열기"
                      >
                        <ExternalLink size={15} />
                      </a>
                    ) : (
                      <span className="text-ink-faint">·</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
