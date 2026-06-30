import * as XLSX from 'xlsx';

/**
 * 아카데미(아임웹) 마케팅 엑셀 파싱 → marketing_daily 행.
 * 기대 포맷: 크롤러 '일별_마케팅' 시트 (날짜 | 유입채널 | 전체방문횟수 | 방문자수 | 회원전환수 | 구매자수 | 구매량 | 총구매금액).
 */

export interface MarketingRow {
  date: string;
  channel: string;
  total_visits: number;
  visitors: number;
  signups: number;
  buyers: number;
  purchase_count: number;
  purchase_amount: number;
}

const num = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[, ₩]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

function toDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // excel serial
    const d = XLSX.SSF ? new Date(Math.round((v - 25569) * 86400 * 1000)) : null;
    return d ? d.toISOString().slice(0, 10) : null;
  }
  const s = String(v).trim();
  const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '').trim();

export function parseMarketingWorkbook(buffer: Buffer): MarketingRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  // '마케팅' 또는 '일별' 들어간 시트 우선, 없으면 첫 시트
  const sheetName =
    wb.SheetNames.find((n) => n.includes('마케팅')) ||
    wb.SheetNames.find((n) => n.includes('일별')) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  if (!matrix.length) return [];

  // 헤더 행 = '유입채널' 포함 행
  let h = -1;
  for (let i = 0; i < Math.min(matrix.length, 6); i++) {
    if ((matrix[i] || []).map(norm).some((c) => c.includes('유입채널') || c.includes('채널'))) {
      h = i;
      break;
    }
  }
  if (h === -1) return [];

  const header = (matrix[h] || []).map(norm);
  const col = (kw: string) => header.findIndex((c) => c.includes(kw));
  const idx = {
    date: col('날짜'),
    channel: header.findIndex((c) => c.includes('유입채널') || c.includes('채널')),
    visits: col('전체방문'),
    visitors: col('방문자'),
    signups: col('회원전환수') !== -1 ? col('회원전환수') : col('회원전환'),
    buyers: col('구매자'),
    purchaseCount: col('구매량'),
    purchaseAmount: col('총구매금액') !== -1 ? col('총구매금액') : col('구매금액'),
  };
  if (idx.channel === -1) return [];

  const rows: MarketingRow[] = [];
  for (let i = h + 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const date = idx.date !== -1 ? toDate(r[idx.date]) : null;
    const channel = String(r[idx.channel] ?? '').trim();
    if (!date || !channel) continue;
    rows.push({
      date,
      channel,
      total_visits: idx.visits !== -1 ? num(r[idx.visits]) : 0,
      visitors: idx.visitors !== -1 ? num(r[idx.visitors]) : 0,
      signups: idx.signups !== -1 ? num(r[idx.signups]) : 0,
      buyers: idx.buyers !== -1 ? num(r[idx.buyers]) : 0,
      purchase_count: idx.purchaseCount !== -1 ? num(r[idx.purchaseCount]) : 0,
      purchase_amount: idx.purchaseAmount !== -1 ? num(r[idx.purchaseAmount]) : 0,
    });
  }
  return rows;
}
