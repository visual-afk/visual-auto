import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
import { sendOverdueAlimtalk } from '@/lib/notifications/overdue';

/** 기한 지난 계획 항목에 수동 알림톡 발송 (본사·해당 지점 원장만). 발송 후 스탬프 갱신 → 크론 중복 발송 방지. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 알림을 보낼 수 있어요' }, { status: 403 });
  }

  const { id } = await params;
  const admin = getAdminSupabase();
  const { data: row } = await admin
    .from('content_schedule')
    .select('id, branch_id, title, scheduled_date, assignee_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: '일정을 찾을 수 없어요' }, { status: 404 });
  if (!canActOnBranch(member, row.branch_id)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }
  if (row.status !== 'planned' || row.scheduled_date >= kstTodayStr()) {
    return NextResponse.json({ error: '기한이 지난 예정 항목만 알림을 보낼 수 있어요' }, { status: 409 });
  }

  const { data: branch } = await admin.from('branches').select('name').eq('id', row.branch_id).maybeSingle();
  const sent = await sendOverdueAlimtalk(row, branch?.name ?? null);
  if (sent > 0) {
    await admin.from('content_schedule').update({ overdue_notified_at: new Date().toISOString() }).eq('id', id);
  }
  return NextResponse.json({ sent });
}
