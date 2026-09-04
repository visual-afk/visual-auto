import { google } from 'googleapis';

/**
 * Google Search Console — 쿼리별 노출/클릭/평균순위 (최근 28일, 데이터 2~3일 지연).
 * 환경변수: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GSC_SITE_URL
 * 사전 작업: 서치콘솔 속성에 서비스 계정 이메일을 사용자(제한된 권한 이상)로 추가.
 * 미설정/권한 없음 → null 반환하고 네이버 체크만 진행한다.
 */

export interface GscQueryStat {
  impressions: number;
  clicks: number;
  position: number; // 평균 순위
}

export function hasGscConfig(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GSC_SITE_URL,
  );
}

/** 소문자 + 공백 제거 — GSC 쿼리와 조사 키워드 매칭용 */
export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, '');
}

/** 지점 페이지 프리픽스(아임웹 경로)로 필터한 쿼리별 통계. 실패 시 null (경고 로그만). */
export async function gscQueryStats(pagePrefix: string | null): Promise<Map<string, GscQueryStat> | null> {
  if (!hasGscConfig()) return null;
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    const searchconsole = google.searchconsole({ version: 'v1', auth });

    // GSC 데이터는 2~3일 지연 → 3일 전을 끝으로 28일 창
    const end = new Date(Date.now() + 9 * 3600e3 - 3 * 24 * 3600e3);
    const start = new Date(end.getTime() - 27 * 24 * 3600e3);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const { data } = await searchconsole.searchanalytics.query({
      siteUrl: process.env.GSC_SITE_URL!,
      requestBody: {
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: ['query'],
        ...(pagePrefix
          ? {
              dimensionFilterGroups: [
                { filters: [{ dimension: 'page', operator: 'contains', expression: pagePrefix }] },
              ],
            }
          : {}),
        rowLimit: 5000,
      },
    });

    const map = new Map<string, GscQueryStat>();
    for (const row of data.rows ?? []) {
      const query = row.keys?.[0];
      if (!query) continue;
      map.set(normalizeQuery(query), {
        impressions: Math.round(row.impressions ?? 0),
        clicks: Math.round(row.clicks ?? 0),
        position: row.position ?? 0,
      });
    }
    return map;
  } catch (e) {
    console.warn('[rank gsc] 서치콘솔 조회 실패 — 네이버만 진행:', (e as Error).message);
    return null;
  }
}
