import { loadAndAggregate, syncProductSheet } from '../lib/product-sheet/sync';
// env는 실행 환경에서 주입 (dotenv 미사용 — crawl-handsos.ts와 동일)

/**
 * 제품 브랜드 매출 구글시트 → Supabase 동기화.
 *
 * 실행:
 *   tsx scripts/sync-product-sheet.ts --dry-run   # 집계만 출력, DB 안 건드림
 *   tsx scripts/sync-product-sheet.ts             # full refresh 동기화
 *
 * 필요 env: PRODUCT_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
 *           NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (dry-run은 앞 3개만)
 */

const won = (n: number) => n.toLocaleString('ko-KR') + '원';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    const { aggRows, summary, masterRows, badRows } = await loadAndAggregate();
    console.log('=== 제품 마스터 ===');
    const byBrand = new Map<string, number>();
    for (const m of masterRows) byBrand.set(m.brandRaw, (byBrand.get(m.brandRaw) || 0) + 1);
    for (const [b, n] of byBrand) console.log(`  ${b}: ${n}개 제품${!masterRows.find((m) => m.brandRaw === b)?.brand ? ' (매핑 제외)' : ''}`);

    console.log('\n=== 브랜드×채널 총계 ===');
    const totals = new Map<string, { qty: number; orders: number; revenue: number }>();
    const monthly = new Map<string, number>();
    for (const r of aggRows.filter((r) => r.scope === 'channel')) {
      const k = `${r.brand} · ${r.channel}`;
      const t = totals.get(k) || { qty: 0, orders: 0, revenue: 0 };
      t.qty += r.qty; t.orders += r.orders; t.revenue += r.revenue;
      totals.set(k, t);
      const mk = `${r.brand} ${r.date.slice(0, 7)}`;
      monthly.set(mk, (monthly.get(mk) || 0) + r.revenue);
    }
    for (const [k, t] of [...totals].sort()) {
      console.log(`  ${k}: 매출 ${won(t.revenue)} / 수량 ${t.qty} / 주문 ${t.orders}건`);
    }
    console.log('\n=== 브랜드×월 매출 ===');
    for (const [k, v] of [...monthly].sort()) console.log(`  ${k}: ${won(v)}`);

    console.log('\n=== 데이터 품질 ===');
    console.log(`  원본 행: ${summary.totalRows} (파싱 불가 행 ${badRows})`);
    console.log(`  완전 중복 제거: ${summary.exactDups} / 환불(음수) 차감 행: ${summary.refundRows}`);
    console.log(`  금액 추정(fallback) 주문: ${summary.fallbackOrders}`);
    console.log(`  브랜드 매핑 제외 행: ${summary.skippedBrandRows} (매출 ${won(summary.skippedBrandRevenue)})`);
    if (summary.unmatchedProducts.length) {
      console.log(`  마스터 미매칭 상품 ${summary.unmatchedProducts.length}종:`);
      for (const p of summary.unmatchedProducts.slice(0, 20)) console.log(`    - ${p}`);
    }
    console.log('\n(dry-run — DB 미변경)');
    return;
  }

  const s = await syncProductSheet();
  console.log(`✅ 동기화 완료 — 브랜드 ${s.brands.join(', ')}`);
  console.log(`  products ${s.products}행 / product_sales_daily ${s.salesRows}행`);
  console.log(`  중복 ${s.exactDups} · 환불 차감 ${s.refundRows} · fallback 주문 ${s.fallbackOrders} · 매핑 제외 ${s.skippedBrandRows}행`);
}

main().catch((e) => {
  console.error('❌', (e as Error).message);
  process.exit(1);
});
