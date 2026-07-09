import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage, type MemberContext } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { ContentType, ScheduleStatus } from '@/lib/contentCalendar';
import { upsertScheduleEvent, deleteScheduleEvent, type GcalScheduleItem } from '@/lib/gcal';

/** 콘텐츠 일정 수정/삭제 — 본사·해당 지점 원장만. 구글 캘린더 동기화는 best-effort. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: ContentType[] = ['blog', 'reels', 'etc'];
const STATUSES: ScheduleStatus[] = ['planned', 'done', 'canceled'];

const SELECT =
  'id, branch_id, content_type, title, scheduled_date, assignee_id, status, memo, post_id, reel_id, gcal_event_id';

async function loadAndAuthorize(id: string, member: MemberContext) {
  if (!canManage(member.role)) {
    return { error: NextResponse.json({ error: '원장·본사만 일정을 수정할 수 있어요' }, { status: 403 }) };
  }
  const { data: row } = await getAdminSupabase().from('content_schedule').select(SELECT).eq('id', id).maybeSingle();
  if (!row) return { error: NextResponse.json({ error: '일정을 찾을 수 없어요' }, { status: 404 }) };
  if (!canActOnBranch(member, row.branch_id)) {
    return { error: NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 }) };
  }
  return { row };
}

/** PATCH — title/scheduled_date/content_type/assignee_id/memo/status/post_id/reel_id 부분 수정 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { id } = await params;
  const loaded = await loadAndAuthorize(id, res.member);
  if ('error' in loaded) return loaded.error;
  const { row } = loaded;

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('title' in body) {
    const title = String(body.title ?? '').trim();
    if (!title) return NextResponse.json({ error: '제목을 입력해주세요' }, { status: 400 });
    patch.title = title;
  }
  if ('scheduled_date' in body) {
    if (!DATE_RE.test(String(body.scheduled_date ?? ''))) {
      return NextResponse.json({ error: '날짜 형식이 올바르지 않아요' }, { status: 400 });
    }
    patch.scheduled_date = body.scheduled_date;
  }
  if ('content_type' in body) {
    if (!TYPES.includes(body.content_type)) {
      return NextResponse.json({ error: '알 수 없는 콘텐츠 유형이에요' }, { status: 400 });
    }
    patch.content_type = body.content_type;
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: '알 수 없는 상태예요' }, { status: 400 });
    }
    patch.status = body.status;
  }
  if ('assignee_id' in body) patch.assignee_id = body.assignee_id || null;
  if ('memo' in body) patch.memo = body.memo ? String(body.memo) : null;
  if ('post_id' in body) patch.post_id = body.post_id || null;
  if ('reel_id' in body) patch.reel_id = body.reel_id || null;

  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('content_schedule')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 구글 캘린더 동기화: 취소는 이벤트 삭제, 그 외 변경은 upsert
  if (data.status === 'canceled') {
    await deleteScheduleEvent(data.gcal_event_id);
    if (data.gcal_event_id) {
      await admin.from('content_schedule').update({ gcal_event_id: null }).eq('id', id);
    }
  } else {
    const { data: branch } = await admin.from('branches').select('name').eq('id', row.branch_id).maybeSingle();
    const eventId = await upsertScheduleEvent(data as GcalScheduleItem, branch?.name ?? null);
    if (eventId && eventId !== data.gcal_event_id) {
      await admin.from('content_schedule').update({ gcal_event_id: eventId }).eq('id', id);
    }
  }

  return NextResponse.json({ item: data });
}

/** DELETE — 일정 삭제 (구글 캘린더 이벤트도 best-effort 삭제) */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { id } = await params;
  const loaded = await loadAndAuthorize(id, res.member);
  if ('error' in loaded) return loaded.error;

  await deleteScheduleEvent(loaded.row.gcal_event_id);
  const { error } = await getAdminSupabase().from('content_schedule').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
