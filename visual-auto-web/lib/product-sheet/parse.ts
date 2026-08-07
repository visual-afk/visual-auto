/**
 * 주문데이터/제품 마스터 탭 파서.
 * 시트 값이 지저분하다: 금액이 "64000"/"₩190,000"/"-₩31,900"/"#ERROR!" 혼재,
 * 날짜가 "2025. 09. 01  15:18:55" / "2025-06-27 10:35:43" / "2025. 9. 30" 혼재,
 * 개별구매 탭 헤더엔 숫자 접미사("이벤트수량5")가 붙는다.
 */

import { SHEET_BRAND_TO_DB, type OrderChannel } from './config';

/** "₩190,000" → 190000, "-₩31,900" → -31900, ""/"#ERROR!"/비숫자 → null */
export function parseMoney(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (!s || s.includes('#ERROR') || s.includes('#REF') || s.includes('#N/A')) return null;
  const cleaned = s.replace(/[₩,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned));
}

/** "2025. 09. 01  15:18:55" | "2025. 9. 30" | "2025-06-27 10:35:43" → "YYYY-MM-DD" (KST 그대로) */
export function parseDate(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

/** 헤더명 정규화: 공백 제거 + 끝 숫자 제거 ("이벤트수량5"→"이벤트수량", "구매 시점"→"구매시점") */
const normHeader = (h: string) => h.replace(/\s+/g, '').replace(/\d+$/, '');

/** 정규화된 헤더가 key로 시작하는 첫 컬럼 index (없으면 -1) */
function findCol(headers: string[], key: string): number {
  return headers.findIndex((h) => normHeader(h).startsWith(key));
}

export interface OrderRow {
  ts: string; // 구매시점 원문 (주문 그룹핑 키의 일부)
  date: string; // YYYY-MM-DD
  brandRaw: string; // 시트 브랜드명 (퓨어모션 등)
  brand: string | null; // DB 브랜드명 (누혜 등) — 매핑 안 되면 null
  product: string;
  qty: number;
  rowTotal: number | null; // 최종금액 (파싱 실패 시 null)
  groupId: string; // 같은 주문 판별용: ts + 수신자 연락처
  unitOverride: number | null; // 개별구매 탭 '수정 단가'
}

export interface MasterRow {
  brandRaw: string;
  brand: string | null;
  name: string;
  keywords: string;
  code: string;
  eventChannel: string;
  eventQty: number | null;
  eventBonusQty: number | null;
  eventPrice: number | null;
  consumerPrice: number | null;
  wholesalePrice: number | null;
  salonPrice: number | null;
  shipFrom: string;
}

/** 브랜드명이 비어 있으면 상품명 접두어로 추정 ("트리필드 개인 맞춤 결제창" 같은 행) */
function resolveBrandRaw(brandCell: string, product: string): string {
  const b = brandCell.trim();
  if (b) return b;
  for (const sheetBrand of Object.keys(SHEET_BRAND_TO_DB)) {
    if (product.trim().startsWith(sheetBrand)) return sheetBrand;
  }
  return '';
}

/** 주문데이터 탭 → OrderRow[]. 날짜 파싱 실패/상품명 없는 행은 건너뛰고 카운트만 리턴. */
export function parseOrderTab(
  values: string[][],
  channel: OrderChannel,
): { rows: OrderRow[]; badRows: number } {
  if (values.length < 2) return { rows: [], badRows: 0 };
  const headers = values[0];
  const col = {
    ts: findCol(headers, '구매시점'),
    brand: findCol(headers, '브랜드명'),
    product: findCol(headers, '구매상품'),
    qty: findCol(headers, '주문수량'),
    buyer: findCol(headers, '구매채널'), // 개별구매 탭에선 구매자(지점명)
    recvName: findCol(headers, '받는분성명'),
    recvPhone: findCol(headers, '받는분전화번호'),
    sendPhone: findCol(headers, '보내는분전화번호'),
    total: findCol(headers, '최종금액'),
    unitOverride: findCol(headers, '수정단가'),
  };

  const rows: OrderRow[] = [];
  let badRows = 0;
  for (const r of values.slice(1)) {
    const at = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const ts = at(col.ts);
    const product = at(col.product);
    const date = parseDate(ts);
    if (!date || !product) {
      if (r.some((c) => c.trim())) badRows++;
      continue;
    }
    const brandRaw = resolveBrandRaw(at(col.brand), product);
    // 주문 그룹핑 키: 구매시점 + 수신자 연락처(없으면 이름/구매자)
    const contact = at(col.recvPhone) || at(col.sendPhone) || at(col.recvName) || at(col.buyer);
    rows.push({
      ts,
      date,
      brandRaw,
      brand: SHEET_BRAND_TO_DB[brandRaw] ?? null,
      product,
      qty: parseMoney(at(col.qty)) ?? 0,
      rowTotal: parseMoney(at(col.total)),
      groupId: `${channel}|${ts}|${contact}`,
      unitOverride: col.unitOverride >= 0 ? parseMoney(at(col.unitOverride)) : null,
    });
  }
  return { rows, badRows };
}

/** 제품 마스터 탭 → MasterRow[] (가맹 포함 — 매출 배분 가중치용. products 저장 시엔 brand 매핑된 것만). */
export function parseMasterTab(values: string[][]): MasterRow[] {
  if (values.length < 2) return [];
  const headers = values[0];
  const col = {
    brand: findCol(headers, '브랜드'),
    name: findCol(headers, '제품명'),
    keywords: findCol(headers, '핵심키워드'),
    code: findCol(headers, '코드'),
    eventChannel: findCol(headers, '이벤트적용채널'),
    eventQty: findCol(headers, '이벤트적용수량'),
    eventBonusQty: findCol(headers, '이벤트제공수량'),
    eventPrice: findCol(headers, '이벤트할인가'),
    consumerPrice: findCol(headers, '소비자가'),
    wholesalePrice: findCol(headers, '도매가'),
    salonPrice: findCol(headers, '비주얼살롱가'),
    shipFrom: findCol(headers, '배송출발지'),
  };
  const out: MasterRow[] = [];
  for (const r of values.slice(1)) {
    const at = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const name = at(col.name);
    if (!name) continue;
    const brandRaw = at(col.brand);
    out.push({
      brandRaw,
      brand: SHEET_BRAND_TO_DB[brandRaw] ?? null,
      name,
      keywords: at(col.keywords),
      code: at(col.code),
      eventChannel: at(col.eventChannel),
      eventQty: parseMoney(at(col.eventQty)),
      eventBonusQty: parseMoney(at(col.eventBonusQty)),
      eventPrice: parseMoney(at(col.eventPrice)),
      consumerPrice: parseMoney(at(col.consumerPrice)),
      wholesalePrice: parseMoney(at(col.wholesalePrice)),
      salonPrice: parseMoney(at(col.salonPrice)),
      shipFrom: at(col.shipFrom),
    });
  }
  return out;
}
