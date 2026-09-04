/**
 * 네이버 검색 오픈API (developers.naver.com — 비로그인, 25,000회/일).
 * 블로그 검색(blog) 결과 순서 ≈ 네이버 블로그탭 순위. 통합검색 스마트블록과는 다르다.
 * 환경변수: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
 */

export interface NaverSearchItem {
  title: string;
  link: string;
}

export interface NaverSearchResult {
  items: NaverSearchItem[];
  total: number;
}

export function hasNaverKeys(): boolean {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

/** 검색 API 1회 호출 (display=100 → 상위 100개). kind: 'blog' | 'webkr'(웹문서) */
export async function naverSearch(kind: 'blog' | 'webkr', query: string): Promise<NaverSearchResult> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 없어요');

  const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=100`;
  const res = await fetch(url, {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`네이버 검색 API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { total?: number; items?: { title?: string; link?: string }[] };
  return {
    total: Number(json.total ?? 0),
    items: (json.items ?? []).map((i) => ({ title: String(i.title ?? ''), link: String(i.link ?? '') })),
  };
}

/**
 * 네이버 블로그 글 URL → 'blogId/logNo' 키 정규화.
 * blog.naver.com/{id}/{logNo}, m.blog.naver.com/{id}/{logNo},
 * blog.naver.com/PostView.naver?blogId=...&logNo=... 모두 처리.
 */
export function naverPostKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)blog\.naver\.com$/.test(u.hostname)) return null;
    const blogIdQ = u.searchParams.get('blogId');
    const logNoQ = u.searchParams.get('logNo');
    if (blogIdQ && logNoQ) return `${blogIdQ.toLowerCase()}/${logNoQ}`;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && /^\d+$/.test(parts[1])) return `${parts[0].toLowerCase()}/${parts[1]}`;
    return null;
  } catch {
    return null;
  }
}

/** 네이버 블로그 URL → blogId (지점/개인 블로그 소유 판정 폴백용) */
export function naverBlogId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)blog\.naver\.com$/.test(u.hostname)) return null;
    const blogIdQ = u.searchParams.get('blogId');
    if (blogIdQ) return blogIdQ.toLowerCase();
    const first = u.pathname.split('/').filter(Boolean)[0];
    return first ? first.toLowerCase() : null;
  } catch {
    return null;
  }
}
