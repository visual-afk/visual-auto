/**
 * 주문행 → 일별 집계.
 *
 * 핵심 문제: 아임웹/스마트스토어 탭은 한 주문의 여러 상품 행마다 "최종금액"에
 * 주문 총액이 반복 기입돼 있어 단순 합산하면 매출이 상품 수만큼 부풀려진다.
 * 주문ID 컬럼이 없으므로 (구매시점+수신자 연락처)로 주문을 묶고,
 * 주문 총액을 상품 행에 가중 배분(수량×마스터 단가)한다.
 * 개별구매 탭은 행별 최종금액이 이미 정확(수량×단가)해서 배분 없이 그대로 쓴다.
 * "[취소]" 환불 행은 수량·최종금액이 음수로 들어오는데, 제외하지 않고 그대로
 * 차감 반영한다(제외하면 매출이 환불액만큼 부풀려진다 — 아임웹에만 1억 이상).
 */

import type { OrderChannel } from './config';
import type { MasterRow, OrderRow } from './parse';

export interface AggRow {
  brand: string; // DB 브랜드명 (누혜/트리필드/아카데미)
  date: string;
  channel: OrderChannel;
  scope: 'channel' | 'product';
  product_name: string; // scope='channel'이면 ''
  product_code: string;
  qty: number;
  orders: number;
  revenue: number;
}

export interface AggSummary {
  totalRows: number;
  exactDups: number;
  refundRows: number; // 최종금액 음수(취소/환불) 행 — 차감 반영됨
  fallbackOrders: number; // 최종금액 전부 파싱 불가 → 마스터 단가로 추정한 주문 수
  unmatchedProducts: string[]; // 마스터에서 못 찾은 상품명 (배분 가중치 1로 처리)
  skippedBrandRows: number; // 가맹 등 매핑 안 되는 브랜드 행 (배분엔 참여, 저장만 제외)
  skippedBrandRevenue: number;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 마스터 제품 매칭: 주문 상품명에 마스터 제품명(또는 핵심키워드)이 포함되면 매치. 긴 이름 우선. */
export function buildProductMatcher(master: MasterRow[]) {
  const sorted = [...master].sort((a, b) => b.name.length - a.name.length);
  const cache = new Map<string, MasterRow | null>();
  return (product: string): MasterRow | null => {
    if (cache.has(product)) return cache.get(product)!;
    const p = norm(product);
    let hit =
      sorted.find((m) => p.includes(norm(m.name))) ??
      sorted.find((m) => m.keywords && p.includes(norm(m.keywords))) ??
      null;
    cache.set(product, hit);
    return hit;
  };
}

/** 배분 가중치/추정용 단가: 이벤트할인가 → 소비자가 → 도매가 → 비주얼살롱가 */
function unitPrice(m: MasterRow | null): number {
  return m?.eventPrice ?? m?.consumerPrice ?? m?.wholesalePrice ?? m?.salonPrice ?? 0;
}

interface Bucket {
  qty: number;
  revenue: number;
  orders: Set<string>;
  code: string;
}

export function aggregateOrders(
  rowsByChannel: Record<OrderChannel, OrderRow[]>,
  master: MasterRow[],
): { rows: AggRow[]; summary: AggSummary } {
  const match = buildProductMatcher(master);
  const summary: AggSummary = {
    totalRows: 0,
    exactDups: 0,
    refundRows: 0,
    fallbackOrders: 0,
    unmatchedProducts: [],
    skippedBrandRows: 0,
    skippedBrandRevenue: 0,
  };
  const unmatched = new Set<string>();

  // key: brand|date|channel(|product)
  const channelBuckets = new Map<string, Bucket>();
  const productBuckets = new Map<string, Bucket>();
  const bucket = (map: Map<string, Bucket>, key: string, code = ''): Bucket => {
    let b = map.get(key);
    if (!b) map.set(key, (b = { qty: 0, revenue: 0, orders: new Set(), code }));
    return b;
  };

  /** 배분 끝난 행 하나를 집계에 반영 */
  const accumulate = (row: OrderRow, revenue: number, channel: OrderChannel) => {
    if (!row.brand) {
      summary.skippedBrandRows++;
      summary.skippedBrandRevenue += revenue;
      return;
    }
    const m = match(row.product);
    if (!m) unmatched.add(row.product);
    const productLabel = m?.name ?? row.product;
    const ch = bucket(channelBuckets, `${row.brand}|${row.date}|${channel}`);
    ch.qty += row.qty;
    ch.revenue += revenue;
    ch.orders.add(row.groupId);
    const pr = bucket(productBuckets, `${row.brand}|${row.date}|${channel}|${productLabel}`, m?.code ?? '');
    pr.qty += row.qty;
    pr.revenue += revenue;
    pr.orders.add(row.groupId);
  };

  for (const [channel, rawRows] of Object.entries(rowsByChannel) as [OrderChannel, OrderRow[]][]) {
    summary.totalRows += rawRows.length;

    // 1) 완전 중복 행 제거 (스마트스토어에 동일 행이 이중 기입된 케이스)
    const seen = new Set<string>();
    const rows: OrderRow[] = [];
    for (const r of rawRows) {
      const key = `${r.groupId}|${r.product}|${r.qty}|${r.rowTotal}`;
      if (seen.has(key)) {
        summary.exactDups++;
        continue;
      }
      seen.add(key);
      // 취소/환불 행(음수)은 그대로 차감 — 카운트만 기록
      if (r.rowTotal !== null && r.rowTotal < 0) summary.refundRows++;
      rows.push(r);
    }

    if (channel === '개별구매') {
      // 행별 최종금액이 정확 — 배분 없이 그대로
      for (const r of rows) {
        const revenue = r.rowTotal ?? r.qty * (r.unitOverride ?? unitPrice(match(r.product)));
        accumulate(r, revenue, channel);
      }
      continue;
    }

    // 3) 주문 그룹핑 (아임웹/스마트스토어: 최종금액 = 주문 총액 반복)
    const groups = new Map<string, OrderRow[]>();
    for (const r of rows) {
      const g = groups.get(r.groupId);
      if (g) g.push(r);
      else groups.set(r.groupId, [r]);
    }

    for (const group of groups.values()) {
      // 4) 주문 매출: 그룹 내 첫 유효 최종금액(환불이면 음수 그대로), 전부 불가면 마스터 단가로 추정
      const withTotal = group.find((r) => r.rowTotal !== null);
      let orderTotal = withTotal ? withTotal.rowTotal! : null;
      if (orderTotal === null) {
        orderTotal = group.reduce((a, r) => a + r.qty * unitPrice(match(r.product)), 0);
        summary.fallbackOrders++;
      }
      // 5) 상품 행에 가중 배분 (|수량|×단가, 단가 없으면 1) — 마지막 행이 반올림 잔여 흡수
      const weights = group.map((r) => Math.max(Math.abs(r.qty), 1) * (unitPrice(match(r.product)) || 1));
      const totalWeight = weights.reduce((a, w) => a + w, 0);
      let allocated = 0;
      group.forEach((r, i) => {
        const revenue =
          i === group.length - 1
            ? orderTotal! - allocated
            : Math.floor((orderTotal! * weights[i]) / totalWeight);
        allocated += revenue;
        accumulate(r, revenue, channel);
      });
    }
  }

  summary.unmatchedProducts = [...unmatched];

  const rows: AggRow[] = [];
  for (const [key, b] of channelBuckets) {
    const [brand, date, channel] = key.split('|');
    rows.push({
      brand, date, channel: channel as OrderChannel, scope: 'channel',
      product_name: '', product_code: '', qty: b.qty, orders: b.orders.size, revenue: b.revenue,
    });
  }
  for (const [key, b] of productBuckets) {
    const [brand, date, channel, ...rest] = key.split('|');
    rows.push({
      brand, date, channel: channel as OrderChannel, scope: 'product',
      product_name: rest.join('|'), product_code: b.code, qty: b.qty, orders: b.orders.size, revenue: b.revenue,
    });
  }
  return { rows, summary };
}
