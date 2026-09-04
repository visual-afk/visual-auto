import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { deleteScheduleEvent } from '@/lib/gcal';

/** 콘텐츠 일정 선택/일괄 삭제 — 캘린더 선택 모드용. 구글 캘린더 이벤트도 best-effort 삭제. */

const MAX_IDS = 500;

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 일정을 삭제할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: '삭제할 일정이 없어요' }, { status: 400 });
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `한 번에 ${MAX_IDS}건까지 삭제할 수 있어요` }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: rows, error } = await admin
    .from('content_schedule')
    .select('id, branch_id, gcal_event_id')
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (rows ?? []) as { id: string; branch_id: string; gcal_event_id: string | null }[];
  // 전건 권한 검증 — 하나라도 남의 지점이면 아무것도 지우지 않는다
  if (items.some((r) => !canActOnBranch(member, r.branch_id))) {
    return NextResponse.json({ error: '소속되지 않은 지점의 일정이 섞여 있어요' }, { status: 403 });
  }
  if (items.length === 0) return NextResponse.json({ deleted: 0 });

  await Promise.allSettled(items.map((r) => deleteScheduleEvent(r.gcal_event_id)));

  const { error: delError } = await admin
    .from('content_schedule')
    .delete()
    .in('id', items.map((r) => r.id));
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

  return NextResponse.json({ deleted: items.length });
}
