/**
 * 구글시트 → Supabase 동기화 오케스트레이션.
 * 시트가 소급 수정되고 주문ID가 없어 증분이 불가능하므로, 브랜드별 full refresh
 * (delete → insert). 소스가 ~3.5천 행이라 매 실행 수 초면 끝난다.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { isProductSheetConfigured, ORDER_CHANNELS, TAB_RANGES, type OrderChannel } from './config';
import { fetchTab } from './sheets';
import { parseMasterTab, parseOrderTab, type OrderRow } from './parse';
import { aggregateOrders, type AggRow, type AggSummary } from './aggregate';

export interface SyncSummary extends AggSummary {
  products: number;
  salesRows: number;
  badRows: number;
  brands: string[];
}

const CHUNK = 500;

/** 시트 4탭을 읽어 집계까지만 수행 (dry-run/실행 공용) */
export async function loadAndAggregate(): Promise<{
  aggRows: AggRow[];
  summary: AggSummary;
  masterRows: ReturnType<typeof parseMasterTab>;
  badRows: number;
}> {
  if (!isProductSheetConfigured()) {
    throw new Error('PRODUCT_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 설정이 필요해요');
  }
  const [masterVals, imwebVals, smartVals, directVals] = await Promise.all([
    fetchTab(TAB_RANGES.master),
    fetchTab(TAB_RANGES.아임웹),
    fetchTab(TAB_RANGES.스마트스토어),
    fetchTab(TAB_RANGES.개별구매),
  ]);
  const masterRows = parseMasterTab(masterVals);
  const parsed: Record<OrderChannel, { rows: OrderRow[]; badRows: number }> = {
    아임웹: parseOrderTab(imwebVals, '아임웹'),
    스마트스토어: parseOrderTab(smartVals, '스마트스토어'),
    개별구매: parseOrderTab(directVals, '개별구매'),
  };
  const rowsByChannel = Object.fromEntries(
    ORDER_CHANNELS.map((c) => [c, parsed[c].rows]),
  ) as Record<OrderChannel, OrderRow[]>;
  const badRows = ORDER_CHANNELS.reduce((a, c) => a + parsed[c].badRows, 0);
  const { rows: aggRows, summary } = aggregateOrders(rowsByChannel, masterRows);
  return { aggRows, summary, masterRows, badRows };
}

export async function syncProductSheet(): Promise<SyncSummary> {
  const { aggRows, summary, masterRows, badRows } = await loadAndAggregate();
  const admin = getAdminSupabase();

  // 브랜드명 → branch_id (kind='brand', 0013에서 시드됨)
  const { data: brandBranches, error: bErr } = await admin
    .from('branches')
    .select('id, name')
    .eq('kind', 'brand');
  if (bErr) throw new Error(`branches 조회 실패: ${bErr.message}`);
  const brandId = new Map((brandBranches || []).map((b) => [b.name, b.id]));

  const syncedAt = new Date().toISOString();
  let productCount = 0;
  let salesCount = 0;
  const brands: string[] = [];

  for (const [brand, branchId] of brandId) {
    // unique(branch_id,name) 위반 방지: 같은 제품명이 마스터에 두 번 있으면 첫 행만
    const seenNames = new Set<string>();
    const products = masterRows
      .filter((m) => m.brand === brand && !seenNames.has(m.name) && !!seenNames.add(m.name))
      .map((m, i) => ({
        branch_id: branchId,
        name: m.name,
        code: m.code,
        keywords: m.keywords,
        event_channel: m.eventChannel,
        event_qty: m.eventQty,
        event_bonus_qty: m.eventBonusQty,
        event_price: m.eventPrice,
        consumer_price: m.consumerPrice,
        wholesale_price: m.wholesalePrice,
        salon_price: m.salonPrice,
        ship_from: m.shipFrom,
        sort_order: i,
        synced_at: syncedAt,
      }));
    const sales = aggRows
      .filter((r) => r.brand === brand)
      .map((r) => ({
        branch_id: branchId,
        date: r.date,
        channel: r.channel,
        scope: r.scope,
        product_name: r.product_name,
        product_code: r.product_code,
        qty: r.qty,
        orders: r.orders,
        revenue: r.revenue,
      }));
    if (!products.length && !sales.length) continue;
    brands.push(brand);

    // full refresh: 삭제 직후 바로 insert — 빈 창은 수 ms (cron은 새벽 실행)
    const { error: dpErr } = await admin.from('products').delete().eq('branch_id', branchId);
    if (dpErr) throw new Error(`products 삭제 실패(${brand}): ${dpErr.message}`);
    for (let i = 0; i < products.length; i += CHUNK) {
      const { error } = await admin.from('products').insert(products.slice(i, i + CHUNK));
      if (error) throw new Error(`products 저장 실패(${brand}): ${error.message}`);
    }
    productCount += products.length;

    const { error: dsErr } = await admin.from('product_sales_daily').delete().eq('branch_id', branchId);
    if (dsErr) throw new Error(`product_sales_daily 삭제 실패(${brand}): ${dsErr.message}`);
    for (let i = 0; i < sales.length; i += CHUNK) {
      const { error } = await admin.from('product_sales_daily').insert(sales.slice(i, i + CHUNK));
      if (error) throw new Error(`product_sales_daily 저장 실패(${brand}): ${error.message}`);
    }
    salesCount += sales.length;
  }

  return { ...summary, products: productCount, salesRows: salesCount, badRows, brands };
}
