import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch } from '@/lib/auth';
import { canManage } from '@/lib/roles';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 지점 플레이스 통계 스냅샷 조회 (?branch_id=) */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const branchId = new URL(request.url).searchParams.get('branch_id') || member.branchId;
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }

  const { data, error } = await getAdminSupabase()
    .from('place_stats')
    .select('id, stat_date, period, place_views, inflows, review_count, created_at')
    .eq('branch_id', branchId)
    .order('stat_date', { ascending: false })
    .limit(12);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stats: data });
}

/** 플레이스 통계 저장 (OCR 검수 후). 원장·본사만. 같은 기간이면 덮어쓴다. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  if (!canManage(member.role)) {
    return NextResponse.json({ error: '플레이스 통계는 원장님·본사만 기록할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId: string | null = body.branch_id || member.branchId;
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }

  const statDate = String(body.stat_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(statDate)) {
    return NextResponse.json({ error: '통계 기준일을 확인해주세요 (예: 2026-07-01)' }, { status: 400 });
  }
  const period = ['day', 'week', 'month'].includes(body.period) ? body.period : 'week';
  const inflows = Array.isArray(body.inflows)
    ? body.inflows
        .filter((i: { name?: string; count?: number }) => i?.name && Number.isFinite(Number(i.count)))
        .map((i: { name: string; count: number }) => ({ name: String(i.name).trim(), count: Number(i.count) }))
    : [];

  const { data, error } = await getAdminSupabase()
    .from('place_stats')
    .upsert(
      {
        branch_id: branchId,
        stat_date: statDate,
        period,
        place_views: body.place_views == null || body.place_views === '' ? null : Number(body.place_views) || 0,
        review_count: body.review_count == null || body.review_count === '' ? null : Number(body.review_count) || 0,
        inflows,
        source: 'ocr',
        created_by: member.userId,
      },
      { onConflict: 'branch_id,period,stat_date' },
    )
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stat: data });
}
