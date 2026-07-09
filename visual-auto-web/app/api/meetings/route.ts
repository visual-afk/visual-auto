import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 전체미팅/디자이너미팅 일지. 시트의 미팅 탭 1:1 대응. */

const TEXT_FIELDS = ['agenda', 'goals', 'review'] as const;
const ID_ARRAYS = ['attendee_ids', 'late_ids', 'absent_ids'] as const;

function sanitizeIdArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0) : [];
}

/** GET ?branch_id — 지점 미팅 목록 (최신순) */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 볼 수 있어요' }, { status: 403 });
  }

  const url = new URL(request.url);
  const branchId = url.searchParams.get('branch_id') || member.branchId;
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }

  const { data, error } = await getAdminSupabase()
    .from('meetings')
    .select('*')
    .eq('branch_id', branchId)
    .order('held_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meetings: data ?? [] });
}

/** POST — 미팅 생성 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 기록할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId: string | null = body.branch_id || member.branchId;
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }
  const kind = body.kind === 'designer' ? 'designer' : 'all';

  const row: Record<string, unknown> = {
    branch_id: branchId,
    kind,
    held_at: typeof body.held_at === 'string' && body.held_at ? body.held_at : undefined,
    facilitator_id: body.facilitator_id || null,
  };
  for (const k of TEXT_FIELDS) row[k] = body[k] ? String(body[k]) : null;
  for (const k of ID_ARRAYS) row[k] = sanitizeIdArray(body[k]);

  const { data, error } = await getAdminSupabase().from('meetings').insert(row).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meeting: data });
}

/** PATCH {id, ...fields} — 미팅 수정 */
export async function PATCH(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 수정할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id: string = body.id || '';
  if (!id) return NextResponse.json({ error: '미팅이 없어요' }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: meeting } = await admin.from('meetings').select('id, branch_id').eq('id', id).maybeSingle();
  if (!meeting) return NextResponse.json({ error: '미팅을 찾을 수 없어요' }, { status: 404 });
  if (!canActOnBranch(member, meeting.branch_id)) {
    return NextResponse.json({ error: '다른 지점 미팅이에요' }, { status: 403 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.held_at === 'string' && body.held_at) patch.held_at = body.held_at;
  if (body.kind === 'all' || body.kind === 'designer') patch.kind = body.kind;
  if ('facilitator_id' in body) patch.facilitator_id = body.facilitator_id || null;
  for (const k of TEXT_FIELDS) if (k in body) patch[k] = body[k] ? String(body[k]) : null;
  for (const k of ID_ARRAYS) if (k in body) patch[k] = sanitizeIdArray(body[k]);

  const { data, error } = await admin.from('meetings').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meeting: data });
}

/** DELETE {id} — 미팅 삭제 */
export async function DELETE(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 지울 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id: string = body.id || '';
  if (!id) return NextResponse.json({ error: '미팅이 없어요' }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: meeting } = await admin.from('meetings').select('id, branch_id').eq('id', id).maybeSingle();
  if (!meeting) return NextResponse.json({ error: '미팅을 찾을 수 없어요' }, { status: 404 });
  if (!canActOnBranch(member, meeting.branch_id)) {
    return NextResponse.json({ error: '다른 지점 미팅이에요' }, { status: 403 });
  }

  const { error } = await admin.from('meetings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
