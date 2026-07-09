import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr, kstThisMonth } from '@/lib/kst';

/**
 * 원장 업무일지. 지점당 하루 1행(오전/오후) upsert.
 * 원장·본사만 접근 (디자이너는 nav에 없고 여기서도 403).
 */

/** GET ?branch_id&month=YYYY-MM — 해당 월 일지 목록 */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 쓸 수 있어요' }, { status: 403 });
  }

  const url = new URL(request.url);
  const branchId = url.searchParams.get('branch_id') || member.branchId;
  const month = url.searchParams.get('month') || kstThisMonth();
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }

  const { data, error } = await getAdminSupabase()
    .from('director_journals')
    .select('id, journal_date, am_text, pm_text, updated_at')
    .eq('branch_id', branchId)
    .gte('journal_date', `${month}-01`)
    .lt('journal_date', nextMonthStart(month))
    .order('journal_date', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ journals: data ?? [], today: kstTodayStr() });
}

/** POST {branch_id?, journal_date?, am_text?, pm_text?} — 오늘(또는 지정일) 일지 upsert */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 쓸 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId: string | null = body.branch_id || member.branchId;
  const journalDate: string = body.journal_date || kstTodayStr();
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(journalDate)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않아요' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('am_text' in body) patch.am_text = body.am_text == null ? null : String(body.am_text);
  if ('pm_text' in body) patch.pm_text = body.pm_text == null ? null : String(body.pm_text);

  const { data, error } = await getAdminSupabase()
    .from('director_journals')
    .upsert(
      { branch_id: branchId, author_id: member.userId, journal_date: journalDate, ...patch },
      { onConflict: 'branch_id,journal_date' },
    )
    .select('id, journal_date, am_text, pm_text, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ journal: data });
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
