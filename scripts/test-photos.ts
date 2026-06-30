import { getBeforeAfterPhotos, getReviewPhotos, photoIdToUrl } from './get-real-photos.js';

console.log('=== 비포애프터 사진 테스트 ===');
const baPhotos = await getBeforeAfterPhotos('머릿결 관리법', 3);
console.log(`비포애프터: ${baPhotos.length}장`);
for (const id of baPhotos) {
  console.log(`  ${photoIdToUrl(id)}`);
}

console.log('\n=== 강남신사점 리뷰 캡처 테스트 ===');
const reviewPhotos = await getReviewPhotos('강남신사점', 2);
console.log(`리뷰: ${reviewPhotos.length}장`);
for (const id of reviewPhotos) {
  console.log(`  ${photoIdToUrl(id)}`);
}
