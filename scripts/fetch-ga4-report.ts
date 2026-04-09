import { config } from '../lib/config.js';
import { fetchAllRows, updateCell } from '../lib/google-sheets.js';
import { SHEET_COLUMNS } from '../lib/config.js';

/**
 * GA4 데이터 수집 스크립트
 *
 * 참고: GA4 Data API는 별도 설정이 필요합니다.
 * - Google Analytics Data API 활성화
 * - Service Account에 GA4 속성 읽기 권한 부여
 *
 * 추적 방식이 변경될 수 있으므로, 이 스크립트는 기본 구조만 제공합니다.
 */
async function main() {
  if (!config.ga4.propertyId) {
    console.log('⚠️  GA4_PROPERTY_ID가 설정되지 않았습니다.');
    console.log('추적 방식이 확정되면 이 스크립트를 업데이트하세요.');
    return;
  }

  console.log('📊 GA4 리포트 수집 시작\n');

  // 발행된 글 목록 가져오기
  const rows = await fetchAllRows();
  const published = rows.filter(r => r.status === 'published' || r.status === 'tracking');

  if (published.length === 0) {
    console.log('발행된 글이 없습니다.');
    return;
  }

  console.log(`발행된 글 ${published.length}건:\n`);
  for (const row of published) {
    console.log(`  ${row.topic}`);
    if (row.imwebUrl) console.log(`    아임웹: ${row.imwebUrl}`);
    if (row.naverUrl) console.log(`    네이버: ${row.naverUrl}`);
    if (row.views) console.log(`    조회수: ${row.views}`);
    if (row.conversions) console.log(`    전환: ${row.conversions}`);
    console.log();
  }

  // TODO: GA4 Data API 연동
  // const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
  // const analyticsClient = new BetaAnalyticsDataClient();
  // ...

  console.log('💡 GA4 API 연동은 추적 방식 확정 후 구현 예정');
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
