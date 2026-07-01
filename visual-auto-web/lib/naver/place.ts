/**
 * 네이버 공개 플레이스(pcmap.place.naver.com) 리뷰 유틸.
 *
 * - reviewPageUrl / resolvePlaceId 는 안정적(딥링크용).
 * - fetchPublicReviews 는 실험적. 네이버가 서버 요청에 WtmCaptcha 챌린지를 반환하므로
 *   대부분 ReviewsBlockedError 로 실패한다 → 화면은 "리뷰 보러가기" 딥링크로 폴백.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface PublicReview {
  author: string;
  date: string;
  rating: number | null;
  text: string;
}

/** 네이버가 자동 수집을 막았을 때(캡차/봇차단) 던지는 에러 */
export class ReviewsBlockedError extends Error {
  constructor(msg = '네이버가 자동 수집을 막았어요') {
    super(msg);
    this.name = 'ReviewsBlockedError';
  }
}

/** 공개 리뷰 페이지 딥링크. 사용자가 새 탭에서 열어 직접 보고 복사. */
export function reviewPageUrl(placeId: string): string {
  return `https://pcmap.place.naver.com/hairshop/${placeId}/review/visitor`;
}

/**
 * naver.me 단축링크를 따라가 최종 URL 에서 placeId 추출.
 * placeId 를 아직 모르는 지점(사가정1호점 등) 폴백용.
 */
export async function resolvePlaceId(shortUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shortUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': UA },
    });
    const finalUrl = res.url || '';
    const m = finalUrl.match(/(?:place|hairshop|restaurant|hospital)\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** GraphQL 응답이 캡차/셸 HTML 인지 감지 */
function looksBlocked(text: string): boolean {
  return /WtmCaptcha|wtm_captcha|<html/i.test(text.slice(0, 500));
}

/**
 * `x-wtm-graphql` 게이트키퍼 헤더. 서명이 아니라 base64(JSON) + 패딩 제거.
 * 이게 없으면 네이버가 캡차로 막는다. type 은 businessType 과 일치시켜야 함.
 */
function wtmHeader(placeId: string, businessType: string): string {
  return Buffer.from(JSON.stringify({ arg: placeId, type: businessType, source: 'place' }))
    .toString('base64')
    .replace(/=+$/, '');
}

/**
 * 공개 방문자 리뷰 수집(실험적). 성공 시 최대 size개 반환, 차단 시 ReviewsBlockedError.
 * 네이버 GraphQL 스키마가 바뀌면 깨질 수 있음.
 * businessType: 미용실=hairshop(기본), 거부되면 'place' 폴백.
 */
export async function fetchPublicReviews(
  placeId: string,
  size = 10,
  businessType = 'hairshop',
): Promise<PublicReview[]> {
  const body = [
    {
      operationName: 'getVisitorReviews',
      variables: {
        input: {
          businessId: placeId,
          businessType,
          item: '0',
          page: 1,
          size,
          includeContent: true,
          getUserStats: false,
          cidList: [],
          getReactions: false,
          getTrailer: false,
        },
      },
      query: `query getVisitorReviews($input: VisitorReviewsInput) {
  visitorReviews(input: $input) {
    items { id rating body created author { nickname } }
    total
  }
}`,
    },
  ];

  const res = await fetch('https://pcmap-api.place.naver.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: reviewPageUrl(placeId),
      Origin: 'https://pcmap.place.naver.com',
      'x-wtm-graphql': wtmHeader(placeId, businessType),
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (res.status === 429 || res.status === 405 || looksBlocked(raw)) throw new ReviewsBlockedError();

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ReviewsBlockedError('리뷰 응답을 해석하지 못했어요');
  }

  const arr = Array.isArray(json) ? json : [json];
  const items =
    (arr[0] as { data?: { visitorReviews?: { items?: unknown[] } } })?.data?.visitorReviews?.items ?? [];

  return (items as Array<Record<string, unknown>>)
    .map((it) => ({
      author: ((it.author as { nickname?: string })?.nickname ?? '').toString(),
      date: (it.created ?? '').toString(),
      rating: typeof it.rating === 'number' ? it.rating : null,
      text: (it.body ?? '').toString().trim(),
    }))
    .filter((r) => r.text);
}
