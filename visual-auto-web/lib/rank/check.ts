import { getAdminSupabase } from '@/lib/supabase/admin';
import type { KeywordRow } from '@/lib/generation/keywords';
import { naverSearch, naverPostKey, naverBlogId, hasNaverKeys } from './naver';
import { gscQueryStats, normalizeQuery } from './gsc';

/**
 * 키워드 상위노출 체크 오케스트레이터 (수동 버튼 + cron 공용).
 * 지점의 최신 키워드 조사(keyword_sets) 키워드마다 네이버 블로그 검색 API로
 * 우리 글(지점/개인 블로그) 순위를 찾고, 지점당 GSC 1콜로 구글 통계를 붙여
 * keyword_ranks 에 하루 1스냅샷으로 upsert 한다.
 */

export interface RankCheckResult {
  branchId: string;
  branchName: string;
  period: string | null;
  checked: number; // 체크한 키워드 수
  found: number; // 네이버 100위 안에 잡힌 키워드 수
  gsc: boolean; // GSC 데이터 수집 여부
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** KST 오늘 (하루 1스냅샷 기준일) */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

interface RankRowInsert {
  branch_id: string;
  period: string;
  keyword: string;
  source: 'naver_blog' | 'naver_web' | 'gsc';
  rank: number | null;
  matched_url: string | null;
  post_id: string | null;
  total_results: number | null;
  impressions: number | null;
  clicks: number | null;
  check_date: string;
}

/** 지점 1곳 체크. 키워드마다 검색 API 1콜(150ms 간격) + GSC 1콜 → upsert. */
export async function checkBranch(branchId: string, opts?: { sleepMs?: number }): Promise<RankCheckResult> {
  const sleepMs = opts?.sleepMs ?? 150;
  const admin = getAdminSupabase();

  const { data: branch } = await admin
    .from('branches')
    .select('id, name, naver_blog_url, imweb_url')
    .eq('id', branchId)
    .maybeSingle();
  if (!branch) {
    return { branchId, branchName: '?', period: null, checked: 0, found: 0, gsc: false, error: '지점을 찾을 수 없어요' };
  }
  const base: RankCheckResult = {
    branchId,
    branchName: branch.name,
    period: null,
    checked: 0,
    found: 0,
    gsc: false,
  };
  if (!hasNaverKeys()) return { ...base, error: 'NAVER_CLIENT_ID/SECRET 환경변수가 없어요' };

  // 최신 키워드 조사
  const { data: kwSet } = await admin
    .from('keyword_sets')
    .select('period, rows')
    .eq('branch_id', branchId)
    .order('period', { ascending: false })
    .limit(1)
    .maybeSingle();
  const rows = ((kwSet as { rows?: KeywordRow[] } | null)?.rows ?? []).filter((r) => r.keyword?.trim());
  const period = (kwSet as { period?: string } | null)?.period ?? null;
  if (!period || !rows.length) return { ...base, error: '키워드 조사 데이터가 없어요 — 먼저 엑셀을 업로드해주세요' };
  base.period = period;

  // 매칭 타깃: 발행된 네이버 글(postKey→post) + 지점/개인 블로그 blogId 셋
  const { data: posts } = await admin
    .from('posts')
    .select('id, published_url')
    .eq('branch_id', branchId)
    .eq('status', 'published')
    .eq('publish_target', 'naver')
    .not('published_url', 'is', null);
  const postByKey = new Map<string, { id: string; url: string }>();
  for (const p of (posts ?? []) as { id: string; published_url: string }[]) {
    const key = naverPostKey(p.published_url);
    if (key) postByKey.set(key, { id: p.id, url: p.published_url });
  }

  const blogIds = new Set<string>();
  const branchBlogId = naverBlogId(branch.naver_blog_url);
  if (branchBlogId) blogIds.add(branchBlogId);
  const { data: members } = await admin
    .from('branch_users')
    .select('naver_blog_url')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .not('naver_blog_url', 'is', null);
  for (const m of (members ?? []) as { naver_blog_url: string }[]) {
    const id = naverBlogId(m.naver_blog_url);
    if (id) blogIds.add(id);
  }

  const checkDate = kstToday();
  const inserts: RankRowInsert[] = [];

  // 네이버 블로그탭 순위 (키워드마다 1콜)
  for (const row of rows) {
    const keyword = row.keyword.trim();
    try {
      const { items, total } = await naverSearch('blog', keyword);
      let rank: number | null = null;
      let matchedUrl: string | null = null;
      let postId: string | null = null;
      for (let i = 0; i < items.length; i++) {
        const key = naverPostKey(items[i].link);
        const bid = naverBlogId(items[i].link);
        const post = key ? postByKey.get(key) : undefined;
        if (post || (bid && blogIds.has(bid))) {
          rank = i + 1;
          matchedUrl = items[i].link;
          postId = post?.id ?? null;
          break;
        }
      }
      inserts.push({
        branch_id: branchId,
        period,
        keyword,
        source: 'naver_blog',
        rank,
        matched_url: matchedUrl,
        post_id: postId,
        total_results: total,
        impressions: null,
        clicks: null,
        check_date: checkDate,
      });
      base.checked += 1;
      if (rank != null) base.found += 1;
    } catch (e) {
      console.warn(`[rank check] ${branch.name} "${keyword}" 실패:`, (e as Error).message);
    }
    await sleep(sleepMs);
  }

  // 구글 서치콘솔 (지점당 1콜) — 아임웹 경로 프리픽스로 필터
  let pagePrefix: string | null = null;
  try {
    pagePrefix = branch.imweb_url ? new URL(branch.imweb_url).pathname : null;
    if (pagePrefix === '/') pagePrefix = null;
  } catch {
    pagePrefix = null;
  }
  const gscMap = await gscQueryStats(pagePrefix);
  if (gscMap) {
    base.gsc = true;
    for (const row of rows) {
      const keyword = row.keyword.trim();
      const stat = gscMap.get(normalizeQuery(keyword));
      if (!stat) continue;
      inserts.push({
        branch_id: branchId,
        period,
        keyword,
        source: 'gsc',
        rank: Math.round(stat.position),
        matched_url: null,
        post_id: null,
        total_results: null,
        impressions: stat.impressions,
        clicks: stat.clicks,
        check_date: checkDate,
      });
    }
  }

  if (inserts.length) {
    const { error } = await admin
      .from('keyword_ranks')
      .upsert(inserts, { onConflict: 'branch_id,period,keyword,source,check_date' });
    if (error) return { ...base, error: error.message };
  }
  return base;
}

/** 전 지점 순차 실행. 지점 단위 upsert라 중간 타임아웃에도 앞 지점은 저장됨. */
export async function checkAllBranches(opts?: { sleepMs?: number }): Promise<RankCheckResult[]> {
  const { data: branches } = await getAdminSupabase().from('branches').select('id, name').order('name');
  const results: RankCheckResult[] = [];
  for (const b of (branches ?? []) as { id: string; name: string }[]) {
    results.push(await checkBranch(b.id, opts));
  }
  return results;
}
