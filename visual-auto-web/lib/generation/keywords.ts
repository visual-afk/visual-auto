import * as XLSX from 'xlsx';
import { getAdminSupabase } from '@/lib/supabase/admin';

/**
 * 키워드 조사 엑셀 파싱 + 프롬프트 주입용 컨텍스트.
 * 엑셀 구조(확정): 한 파일 안에 지점별 시트 1개씩.
 * 컬럼: 지점명 | 키워드 분류 | 세부 카테고리 | 추천 키워드 | 월간 최소 검색량 | 경쟁강도 | 신규블로그추천(⭐)
 */

export type Competition = '낮음' | '중간' | '높음';

export interface KeywordRow {
  keyword: string;
  category: string; // 키워드 분류 (지역/시술 등)
  subcategory: string; // 세부 카테고리
  volume: number | null; // 월간 최소 검색량
  competition: Competition | null;
  recommend: boolean; // 신규블로그추천 ⭐ → 추천 주제에 밀어줄지
}

export interface SheetParseResult {
  sheet: string; // 시트명 = 지점명
  rows: KeywordRow[];
}

// 헤더 라벨 → 필드 매핑 (부분일치, 공백 무시)
const HEADER_MAP: { test: (h: string) => boolean; field: keyof KeywordRow }[] = [
  { test: (h) => h.includes('추천') && h.includes('키워드'), field: 'keyword' },
  { test: (h) => h.includes('분류'), field: 'category' },
  { test: (h) => h.includes('세부') || h.includes('카테고리'), field: 'subcategory' },
  { test: (h) => h.includes('검색량'), field: 'volume' },
  { test: (h) => h.includes('경쟁'), field: 'competition' },
  { test: (h) => h.includes('신규') || h.includes('추천블로그') || h.includes('블로그추천'), field: 'recommend' },
];

function norm(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, '').trim();
}

function toCompetition(v: unknown): Competition | null {
  const s = String(v ?? '').trim();
  if (s.includes('낮')) return '낮음';
  if (s.includes('중')) return '중간';
  if (s.includes('높')) return '높음';
  return null;
}

function toVolume(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toRecommend(v: unknown): boolean {
  const s = String(v ?? '').trim();
  if (!s) return false;
  return /[⭐★✓✔ovOyYtT1]|있|추천/.test(s) || s === 'true';
}

/** 워크북 버퍼 → 시트별 파싱 결과. 시트당 헤더 행을 찾고 데이터 행을 KeywordRow로. */
export function parseKeywordWorkbook(buffer: ArrayBuffer | Buffer): SheetParseResult[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const out: SheetParseResult[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
    if (!matrix.length) continue;

    // 헤더 행 = '추천 키워드' 같은 키워드 컬럼이 있는 첫 행
    let headerIdx = -1;
    for (let i = 0; i < Math.min(matrix.length, 5); i++) {
      const cells = (matrix[i] || []).map(norm);
      if (cells.some((c) => c.includes('추천') && c.includes('키워드'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) continue;

    // 컬럼 인덱스 → 필드
    const headerCells = (matrix[headerIdx] || []).map(norm);
    const colField: Record<number, keyof KeywordRow> = {};
    headerCells.forEach((h, idx) => {
      const m = HEADER_MAP.find((x) => x.test(h));
      if (m && !Object.values(colField).includes(m.field)) colField[idx] = m.field;
    });
    const keywordCol = Object.entries(colField).find(([, f]) => f === 'keyword')?.[0];
    if (keywordCol == null) continue;

    const rows: KeywordRow[] = [];
    for (let i = headerIdx + 1; i < matrix.length; i++) {
      const raw = matrix[i] || [];
      const keyword = String(raw[Number(keywordCol)] ?? '').trim();
      if (!keyword) continue;
      const row: KeywordRow = {
        keyword,
        category: '',
        subcategory: '',
        volume: null,
        competition: null,
        recommend: false,
      };
      for (const [idxStr, field] of Object.entries(colField)) {
        const cell = raw[Number(idxStr)];
        if (field === 'volume') row.volume = toVolume(cell);
        else if (field === 'competition') row.competition = toCompetition(cell);
        else if (field === 'recommend') row.recommend = toRecommend(cell);
        else if (field === 'keyword') {/* set above */}
        else row[field] = String(cell ?? '').trim() as never;
      }
      rows.push(row);
    }
    out.push({ sheet: sheetName.trim(), rows });
  }
  return out;
}

const COMP_RANK: Record<Competition, number> = { 낮음: 0, 중간: 1, 높음: 2 };

/** 추천 주제 주입용 마크다운. recommend=true 우선, 저경쟁·고검색 순. 토큰 절약 상위 N개. */
export function compileKeywordSummary(rows: KeywordRow[], limit = 25): string {
  if (!rows.length) return '';
  const sorted = [...rows].sort((a, b) => {
    if (a.recommend !== b.recommend) return a.recommend ? -1 : 1;
    const ca = a.competition ? COMP_RANK[a.competition] : 1;
    const cb = b.competition ? COMP_RANK[b.competition] : 1;
    if (ca !== cb) return ca - cb;
    return (b.volume ?? 0) - (a.volume ?? 0);
  });
  const lines = sorted.slice(0, limit).map((r) => {
    const star = r.recommend ? '⭐ ' : '';
    const vol = r.volume != null ? ` (검색량 ${r.volume.toLocaleString()})` : '';
    const comp = r.competition ? `, 경쟁 ${r.competition}` : '';
    const cat = r.category ? ` [${r.category}${r.subcategory ? '/' + r.subcategory : ''}]` : '';
    return `- ${star}${r.keyword}${vol}${comp}${cat}`;
  });
  return lines.join('\n');
}

/** 지점의 가장 최근 키워드 조사 summary. recommend-topics/generate/review-reply 공용. */
export async function loadKeywordContext(branchId: string | null): Promise<string> {
  if (!branchId) return '';
  const { data } = await getAdminSupabase()
    .from('keyword_sets')
    .select('summary, period')
    .eq('branch_id', branchId)
    .order('period', { ascending: false })
    .limit(1)
    .maybeSingle();
  const summary = (data as { summary?: string | null } | null)?.summary;
  return summary ? summary.trim() : '';
}
