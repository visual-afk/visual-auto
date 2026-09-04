import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  parseKeywordWorkbook,
  compileKeywordSummary,
  type KeywordRow,
} from '@/lib/generation/keywords';

export const maxDuration = 60;

/** 파일명/입력값에서 'YYYY-MM' 추출. 실패 시 이번 달. */
function resolvePeriod(input: string | null, filename: string): string {
  const pick = (s: string) => {
    const m = s.match(/(20\d{2})[._\-\s]*(\d{1,2})/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`;
    return null;
  };
  const fromInput = input ? pick(input) || (/^\d{4}-\d{2}$/.test(input.trim()) ? input.trim() : null) : null;
  if (fromInput) return fromInput;
  const fromFile = pick(filename);
  if (fromFile) return fromFile;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 업로드: 한 엑셀(지점별 시트) → 지점별 keyword_sets upsert. 본사 전용. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (member.role !== 'hq_admin') {
    return NextResponse.json({ error: '본사 계정만 업로드할 수 있어요' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '엑셀 파일을 올려주세요' }, { status: 400 });
  }
  const period = resolvePeriod((form?.get('period') as string) || null, file.name);

  let sheets;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    sheets = parseKeywordWorkbook(buf);
  } catch (e) {
    console.error('[keyword-research parse]', (e as Error).message);
    return NextResponse.json({ error: '엑셀을 읽지 못했어요. 형식을 확인해주세요.' }, { status: 400 });
  }
  if (!sheets.length) {
    return NextResponse.json({ error: '읽을 수 있는 시트가 없어요 (지점별 시트 + "추천 키워드" 컬럼 필요)' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: branches } = await admin.from('branches').select('id, name');
  const branchByName = new Map((branches || []).map((b) => [b.name.trim(), b.id]));

  const saved: { sheet: string; matched: boolean; count: number }[] = [];
  let total = 0;
  for (const s of sheets) {
    const branchId = branchByName.get(s.sheet) ?? null;
    const summary = compileKeywordSummary(s.rows);
    const { error } = await admin
      .from('keyword_sets')
      .upsert(
        {
          branch_id: branchId,
          branch_label: s.sheet,
          period,
          rows: s.rows,
          summary,
          source_filename: file.name,
          uploaded_by: member.userId,
        },
        { onConflict: 'branch_label,period' },
      );
    if (error) console.error('[keyword-research upsert]', s.sheet, error.message);
    saved.push({ sheet: s.sheet, matched: branchId != null, count: s.rows.length });
    total += s.rows.length;
  }

  return NextResponse.json({
    period,
    filename: file.name,
    total,
    sheets: saved,
    unmatched: saved.filter((x) => !x.matched).map((x) => x.sheet),
  });
}

/** 이력 + 특정 지점 rows 조회. ?branch_id= 주면 해당 지점 최신 rows. */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const admin = getAdminSupabase();
  const url = new URL(request.url);
  const branchId = url.searchParams.get('branch_id');

  let query = admin
    .from('keyword_sets')
    .select('id, branch_id, branch_label, period, rows, source_filename, created_at')
    .order('period', { ascending: false })
    .order('branch_label', { ascending: true });

  // 본사 외엔 자기 지점(들)만
  if (member.role !== 'hq_admin') {
    if (member.branchIds.length === 0) return NextResponse.json({ sets: [] });
    query = query.in('branch_id', member.branchIds);
  } else if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sets: data || [] });
}

/** 특정 키워드 set의 row recommend 토글 → summary 재컴파일. 본사 전용. */
export async function PATCH(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (member.role !== 'hq_admin') {
    return NextResponse.json({ error: '본사 계정만 수정할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const setId: string = body.id;
  const keyword: string = body.keyword;
  const recommend: boolean = !!body.recommend;
  if (!setId || !keyword) {
    return NextResponse.json({ error: '잘못된 요청이에요' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: set } = await admin
    .from('keyword_sets')
    .select('rows')
    .eq('id', setId)
    .maybeSingle();
  if (!set) return NextResponse.json({ error: '찾을 수 없어요' }, { status: 404 });

  const rows = (set.rows as KeywordRow[]).map((r) =>
    r.keyword === keyword ? { ...r, recommend } : r,
  );
  const summary = compileKeywordSummary(rows);
  const { error } = await admin
    .from('keyword_sets')
    .update({ rows, summary })
    .eq('id', setId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
