import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { deleteScheduleEvent } from '@/lib/gcal';

/** 주제 선택/일괄 삭제 — 보드의 체크박스 삭제용. 삭제는 영구 (시드는 마지막 편성일 이후만 추가). */

const MAX_IDS = 500;

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 주제를 삭제할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: '삭제할 주제가 없어요' }, { status: 400 });
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `한 번에 ${MAX_IDS}건까지 삭제할 수 있어요` }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: rows, error } = await admin
    .from('cardnews_topics')
    .select('id, branch_id, gcal_event_id')
    .in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (rows ?? []) as { id: string; branch_id: string; gcal_event_id: string | null }[];
  // 전건 권한 검증 — 하나라도 남의 지점이면 아무것도 지우지 않는다
  if (items.some((r) => !canActOnBranch(member, r.branch_id))) {
    return NextResponse.json({ error: '소속되지 않은 지점의 주제가 섞여 있어요' }, { status: 403 });
  }
  if (items.length === 0) return NextResponse.json({ deleted: 0 });

  // 구글캘린더 이벤트 정리 (best-effort)
  await Promise.allSettled(items.map((r) => deleteScheduleEvent(r.gcal_event_id)));

  const { error: delError } = await admin
    .from('cardnews_topics')
    .delete()
    .in('id', items.map((r) => r.id));
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

  return NextResponse.json({ deleted: items.length });
}
