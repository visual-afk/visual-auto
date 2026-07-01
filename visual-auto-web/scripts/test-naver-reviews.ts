/**
 * 네이버 공개 리뷰 수집 실측 테스트.
 * 실행: tsx scripts/test-naver-reviews.ts [placeId]
 *   기본 placeId = 성수점(1335021795)
 *
 * 주의: 짧은 시간에 여러 번 호출하면 네이버가 IP를 5~30분 일시 차단(캡차)한다.
 * BLOCKED 가 뜨면 잠시 뒤(다른 네트워크에서) 다시 시도. 프로덕션(Vercel icn1)이 최종 판정 환경.
 */

import { fetchPublicReviews, ReviewsBlockedError } from '../lib/naver/place';

async function main() {
  const placeId = process.argv[2] || '1335021795';
  for (const businessType of ['hairshop', 'place']) {
    try {
      const reviews = await fetchPublicReviews(placeId, 5, businessType);
      console.log(`[${businessType}] OK — ${reviews.length}개`);
      for (const r of reviews) {
        console.log(`  · ${r.author || '익명'} ${r.rating ? `★${r.rating}` : ''} ${r.date}`);
        console.log(`    ${r.text.slice(0, 80)}`);
      }
      return;
    } catch (e) {
      const why = e instanceof ReviewsBlockedError ? '차단(캡차/429/405)' : (e as Error).message;
      console.log(`[${businessType}] 실패 — ${why}`);
    }
  }
  console.log('두 타입 모두 실패. IP 쿨다운 후 재시도하거나 승급 경로(관리형 API/북마클릿) 검토.');
}

main();
