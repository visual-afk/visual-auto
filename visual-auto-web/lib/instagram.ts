import { getAdminSupabase } from '@/lib/supabase/admin';

/**
 * Instagram API with Instagram Login (프로페셔널 계정 전용, 페이스북 페이지 불필요).
 * 디자이너가 본인 계정을 OAuth로 연결하면 릴스 조회수·저장수를 자동 수집한다.
 * 토큰은 60일 장기 토큰 — 만료 임박 시 refresh_access_token 으로 연장.
 */

const GRAPH = 'https://graph.instagram.com';
const API_VERSION = 'v23.0';

export interface IgAccount {
  user_id: string;
  ig_user_id: string;
  username: string;
  access_token: string;
  token_expires_at: string;
  last_synced_at: string | null;
}

export function igEnvReady(): boolean {
  return !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

/** OAuth redirect URI — Meta 앱에 등록한 값과 정확히 일치해야 한다. */
export function igRedirectUri(requestUrl: string): string {
  if (process.env.INSTAGRAM_REDIRECT_URI) return process.env.INSTAGRAM_REDIRECT_URI;
  return `${new URL(requestUrl).origin}/api/instagram/callback`;
}

export function igAuthorizeUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_manage_insights',
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`;
}

async function igJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: { message?: string }; error_message?: string })?.error?.message
      || (data as { error_message?: string })?.error_message
      || `Instagram API ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

/** code → 단기 토큰 → 60일 장기 토큰 + 프로필 */
export async function igExchangeCode(code: string, redirectUri: string) {
  const short = await igJson<{ access_token: string; user_id: string }>(
    'https://api.instagram.com/oauth/access_token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID!,
        client_secret: process.env.INSTAGRAM_APP_SECRET!,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    },
  );
  const long = await igJson<{ access_token: string; expires_in: number }>(
    `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${short.access_token}`,
  );
  const me = await igJson<{ user_id: string; username: string }>(
    `${GRAPH}/${API_VERSION}/me?fields=user_id,username&access_token=${long.access_token}`,
  );
  return {
    igUserId: String(me.user_id ?? short.user_id),
    username: me.username,
    accessToken: long.access_token,
    expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(),
  };
}

/** 만료 7일 전이면 토큰 연장 (실패해도 기존 토큰으로 진행) */
export async function igEnsureFreshToken(account: IgAccount): Promise<IgAccount> {
  const sevenDays = 7 * 86400_000;
  if (new Date(account.token_expires_at).getTime() - Date.now() > sevenDays) return account;
  try {
    const r = await igJson<{ access_token: string; expires_in: number }>(
      `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${account.access_token}`,
    );
    const updated = {
      ...account,
      access_token: r.access_token,
      token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
    };
    await getAdminSupabase()
      .from('instagram_accounts')
      .update({ access_token: updated.access_token, token_expires_at: updated.token_expires_at })
      .eq('user_id', account.user_id);
    return updated;
  } catch (e) {
    console.error('[instagram] token refresh failed:', (e as Error).message);
    return account;
  }
}

/** 인스타 URL(릴스/게시물)에서 shortcode 추출 — permalink 매칭 키 */
export function igShortcode(url: string | null | undefined): string | null {
  const m = (url ?? '').match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

interface IgMedia {
  id: string;
  permalink?: string;
}

// 인스타 링크로 추적하는 테이블들 — 릴스 + 카드뉴스(캐러셀). 스키마 동형(published_url/ig_media_id/views/saves).
const IG_TABLES = ['reels', 'card_news'] as const;
type IgTable = (typeof IG_TABLES)[number];

/**
 * 연결 계정의 미디어와 내 콘텐츠(published_url이 인스타 링크인 릴스·카드뉴스)를 매칭해
 * 조회수(views)·저장수(saved)를 반영한다. 캐러셀도 permalink(/p/) shortcode로 동일하게 매칭된다.
 */
export async function igSyncUser(userId: string): Promise<{ matched: number; updated: number }> {
  const admin = getAdminSupabase();
  const { data: accountRow } = await admin
    .from('instagram_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!accountRow) throw new Error('인스타그램이 연결되어 있지 않아요');
  const account = await igEnsureFreshToken(accountRow as IgAccount);

  // 인스타 링크가 등록된 내 콘텐츠 수집
  const items: { table: IgTable; id: string; shortcode: string; ig_media_id: string | null }[] = [];
  for (const table of IG_TABLES) {
    const { data } = await admin
      .from(table)
      .select('id, published_url, ig_media_id')
      .eq('author_id', userId)
      .not('published_url', 'is', null);
    for (const r of data || []) {
      const shortcode = igShortcode(r.published_url);
      if (shortcode) items.push({ table, id: r.id, shortcode, ig_media_id: r.ig_media_id });
    }
  }
  if (!items.length) {
    await admin.from('instagram_accounts').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId);
    return { matched: 0, updated: 0 };
  }

  // 최근 미디어 permalink 로 매칭 (이미 매칭된 항목은 ig_media_id 캐시 사용)
  const needMatch = items.filter((r) => !r.ig_media_id);
  const byShortcode = new Map<string, string>(); // shortcode → media id
  if (needMatch.length) {
    const media = await igJson<{ data: IgMedia[] }>(
      `${GRAPH}/${API_VERSION}/${account.ig_user_id}/media?fields=id,permalink&limit=50&access_token=${account.access_token}`,
    );
    for (const m of media.data || []) {
      const sc = igShortcode(m.permalink);
      if (sc) byShortcode.set(sc, m.id);
    }
  }

  let matched = 0;
  let updated = 0;
  for (const item of items) {
    const mediaId = item.ig_media_id || byShortcode.get(item.shortcode);
    if (!mediaId) continue;
    matched += 1;
    try {
      const ins = await igJson<{ data: { name: string; values: { value: number }[] }[] }>(
        `${GRAPH}/${API_VERSION}/${mediaId}/insights?metric=views,saved&access_token=${account.access_token}`,
      );
      const metric = (name: string) => ins.data?.find((d) => d.name === name)?.values?.[0]?.value;
      const views = metric('views');
      const saves = metric('saved');
      await admin
        .from(item.table)
        .update({
          ig_media_id: mediaId,
          ...(views != null ? { views } : {}),
          ...(saves != null ? { saves } : {}),
          views_updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      updated += 1;
    } catch (e) {
      // 인사이트 미지원 미디어(오래된 글 등)는 건너뛴다
      console.error('[instagram] insights failed:', mediaId, (e as Error).message);
    }
  }

  await admin.from('instagram_accounts').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId);
  return { matched, updated };
}
