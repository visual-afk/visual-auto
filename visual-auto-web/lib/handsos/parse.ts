/**
 * HandSOS report HTML 파싱 — python/parser.py 이식 (정규식 동일 포팅).
 */

import { categorize, SYSTEM_STAFF_VALUES, SYSTEM_STAFF_NAMES, PROMO_KEYWORDS } from './config';

export interface SaleRow {
  cut: number;
  perm: number;
  recovery: number;
  clinic: number;
  dye: number;
  etc: number;
  new_sales: number;
  repeat_sales: number;
  guest_count: number;
  avg_price: number;
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
const toInt = (s: string) => parseInt((s || '0').replace(/,/g, ''), 10) || 0;

/** 섹션1(시술 매출 분석) → {시술명: 건수} */
export function parseSection1(html: string): Record<string, number> {
  const section = html.match(/시술 매출 분석[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (!section) return {};
  const out: Record<string, number> = {};
  for (const row of section[1].split(/<tr[^>]*>/)) {
    const nameMatch = row.match(/rowspan="3"[^>]*>([\s\S]*?)<\/td>/);
    if (!nameMatch) continue;
    const name = stripTags(nameMatch[1]);
    const countMatch = row.match(/rowspan="2"[^>]*>\s*([\d,]+)\s*</);
    if (name && countMatch) out[name] = toInt(countMatch[1]);
  }
  return out;
}

/** 섹션3(고객구분별 분석) → 신규/재방 매출 + 객단가 + 접객수 */
export function parseSection3(html: string): {
  new_sales: number;
  repeat_sales: number;
  avg_price: number;
  guest_count: number;
} {
  const categories: Record<string, number> = {};
  const section = html.match(/고객구분별 분석[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (section) {
    const tdRe = /<td[^>]*>([\d,%.\w가-힣()]+)<\/td>/g;
    for (const rowM of section[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const tds = [...rowM[1].matchAll(tdRe)].map((m) => m[1]);
      if (tds.length >= 4) categories[tds[0]] = toInt(tds[3]);
    }
  }

  let guestCount = 0;
  let avgPrice = 0;
  const footer = html.match(/고객구분별 분석[\s\S]*?<tfoot>([\s\S]*?)<\/tfoot>/);
  if (footer) {
    const vals = [...footer[1].matchAll(/c_red"[^>]*>(?:<[^>]+>)*\s*([\d,]+)/g)].map((m) => m[1]);
    if (vals.length >= 4) {
      guestCount = toInt(vals[0]);
      avgPrice = toInt(vals[3]);
    }
  }

  const new_sales =
    (categories['신규일반'] || 0) + (categories['손님'] || 0) + (categories['신규소개'] || 0);
  const repeat_sales = (categories['재방지정'] || 0) + (categories['재방대체'] || 0);
  return { new_sales, repeat_sales, avg_price: avgPrice, guest_count: guestCount };
}

/** select 드롭다운 → 실제 디자이너 [(pkStaff, 이름)] */
export function parseDesigners(html: string): { pk: string; name: string }[] {
  const out: { pk: string; name: string }[] = [];
  for (const m of html.matchAll(/<option\s+value="(\d+)"[^>]*>([^<]+)<\/option>/g)) {
    const pk = m[1];
    const name = m[2].trim();
    if (SYSTEM_STAFF_VALUES.has(pk)) continue;
    if (SYSTEM_STAFF_NAMES.has(name)) continue;
    if (name.startsWith('비주얼살롱')) continue;
    if (PROMO_KEYWORDS.some((kw) => name.includes(kw))) continue;
    out.push({ pk, name });
  }
  return out;
}

/** 섹션1+섹션3 → metrics_daily 행(시술 카테고리 6분류 + 매출/접객/객단가) */
export function parseStaffSale(html: string): SaleRow {
  const treatments = parseSection1(html);
  const s3 = parseSection3(html);
  const row: SaleRow = {
    cut: 0, perm: 0, recovery: 0, clinic: 0, dye: 0, etc: 0,
    new_sales: s3.new_sales, repeat_sales: s3.repeat_sales,
    guest_count: s3.guest_count, avg_price: s3.avg_price,
  };
  for (const [name, count] of Object.entries(treatments)) {
    const cat = categorize(name);
    if (cat) row[cat] += count;
  }
  return row;
}
