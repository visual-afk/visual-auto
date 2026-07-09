import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { checkBranch, checkAllBranches } from '@/lib/rank/check';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export interface RankRow {
  keyword: string;
  source: 'naver_blog' | 'naver_web' | 'gsc';
  rank: number | null;
  matched_url: string | null;
  post_id: string | null;
  total_results: number | null;
  impressions: number | null;
  clicks: number | null;
  check_date: string;
}

/** 상위노출 체크 결과 조회 (?branch_id=&period=). 최신 + 직전 체크일 (추이 계산용). */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const url = new URL(request.url);
  const branchId = url.searchParams.get('branch_id') || member.branchId;
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }

  const admin = getAdminSupabase();
  let period = url.searchParams.get('period');
  if (!period) {
    const { data: latest } = await admin
      .from('keyword_ranks')
      .select('period')
      .eq('branch_id', branchId)
      .order('check_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    period = (latest as { period?: string } | null)?.period ?? null;
  }
  if (!period) return NextResponse.json({ period: null, checkDate: null, rows: [], prevRows: [] });

  const { data, error } = await admin
    .from('keyword_ranks')
    .select('keyword, source, rank, matched_url, post_id, total_results, impressions, clicks, check_date')
    .eq('branch_id', branchId)
    .eq('period', period)
    .order('check_date', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = (data ?? []) as RankRow[];
  const dates = [...new Set(all.map((r) => r.check_date))]; // desc 정렬 유지
  const latestDate = dates[0] ?? null;
  const prevDate = dates[1] ?? null;
  return NextResponse.json({
    period,
    checkDate: latestDate,
    rows: latestDate ? all.filter((r) => r.check_date === latestDate) : [],
    prevRows: prevDate ? all.filter((r) => r.check_date === prevDate) : [],
  });
}

/** "지금 체크" — 본사 전용. body {branch_id?} 단일 지점 또는 전체. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  if (member.role !== 'hq_admin') {
    return NextResponse.json({ error: '상위노출 체크는 본사만 실행할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId: string | null = body.branch_id || null;

  try {
    const results = branchId ? [await checkBranch(branchId)] : await checkAllBranches();
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
