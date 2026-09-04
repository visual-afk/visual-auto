/**
 * 제품 브랜드(누혜·트리필드·아카데미) 대시보드 집계.
 * 데이터: product_sales_daily (구글시트 주문데이터를 야간 cron이 집계한 것).
 * 매출은 환불(취소) 차감 순액 — 환불이 큰 달은 음수일 수 있다.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { resolveRange, type PeriodType } from '@/lib/metrics';

const pct = (cur: number, prev: number): number | null => (prev > 0 ? (cur - prev) / prev : null);

export interface BrandChannelStat {
  channel: string;
  revenue: number;
  qty: number;
  orders: number;
  ratio: number; // 양수 매출 합 대비 비중 (0~1)
}

export interface BrandTopProduct {
  name: string;
  code: string;
  qty: number;
  revenue: number;
}

export interface BrandDashboard {
  hasData: boolean;
  range: { label: string };
  sales: { total: number; totalDelta: number | null };
  qty: number;
  orders: number;
  avgOrder: number;
  channels: BrandChannelStat[];
  topProducts: BrandTopProduct[];
}

interface SalesRow {
  channel: string;
  scope: string;
  product_name: string;
  product_code: string;
  qty: number;
  orders: number;
  revenue: number;
}

async function fetchRows(branchId: string, start: string, end: string): Promise<SalesRow[]> {
  const { data } = await getAdminSupabase()
    .from('product_sales_daily')
    .select('channel,scope,product_name,product_code,qty,orders,revenue')
    .eq('branch_id', branchId)
    .gte('date', start)
    .lte('date', end);
  return (data || []) as SalesRow[];
}

export async function aggregateBrand(branchId: string, type: PeriodType, ref?: string): Promise<BrandDashboard> {
  const range = resolveRange(type, ref);
  const [cur, prev] = await Promise.all([
    fetchRows(branchId, range.start, range.end),
    fetchRows(branchId, range.prevStart, range.prevEnd),
  ]);

  const chRows = cur.filter((r) => r.scope === 'channel');
  const total = chRows.reduce((a, r) => a + r.revenue, 0);
  const qty = chRows.reduce((a, r) => a + r.qty, 0);
  const orders = chRows.reduce((a, r) => a + r.orders, 0);
  const prevTotal = prev.filter((r) => r.scope === 'channel').reduce((a, r) => a + r.revenue, 0);

  // 채널별 합산
  const chMap = new Map<string, { revenue: number; qty: number; orders: number }>();
  for (const r of chRows) {
    const c = chMap.get(r.channel) || { revenue: 0, qty: 0, orders: 0 };
    c.revenue += r.revenue;
    c.qty += r.qty;
    c.orders += r.orders;
    chMap.set(r.channel, c);
  }
  const positiveSum = [...chMap.values()].reduce((a, c) => a + Math.max(c.revenue, 0), 0);
  const channels: BrandChannelStat[] = [...chMap.entries()]
    .map(([channel, c]) => ({
      channel,
      ...c,
      ratio: positiveSum > 0 ? Math.max(c.revenue, 0) / positiveSum : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // 제품별 Top 8 (채널 합산, 매출순)
  const prMap = new Map<string, BrandTopProduct>();
  for (const r of cur.filter((r) => r.scope === 'product')) {
    const p = prMap.get(r.product_name) || { name: r.product_name, code: r.product_code, qty: 0, revenue: 0 };
    p.qty += r.qty;
    p.revenue += r.revenue;
    prMap.set(r.product_name, p);
  }
  const topProducts = [...prMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  return {
    hasData: chRows.length > 0,
    range: { label: range.label },
    sales: { total, totalDelta: pct(total, prevTotal) },
    qty,
    orders,
    avgOrder: orders > 0 ? Math.round(total / orders) : 0,
    channels,
    topProducts,
  };
}

export interface ProductCatalogRow {
  id: string;
  name: string;
  code: string;
  event_channel: string;
  event_price: number | null;
  consumer_price: number | null;
  wholesale_price: number | null;
  salon_price: number | null;
  ship_from: string;
  synced_at: string;
}

/** 접이식 제품·가격 표용 카탈로그 (마스터 시트 순서 유지) */
export async function fetchProductCatalog(branchId: string): Promise<ProductCatalogRow[]> {
  const { data } = await getAdminSupabase()
    .from('products')
    .select('id,name,code,event_channel,event_price,consumer_price,wholesale_price,salon_price,ship_from,synced_at')
    .eq('branch_id', branchId)
    .order('sort_order', { ascending: true });
  return (data || []) as ProductCatalogRow[];
}
