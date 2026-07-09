import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstThisMonth } from '@/lib/kst';
import { nextMonthStart, type ContentType } from '@/lib/contentCalendar';
import { upsertScheduleEvent, type GcalScheduleItem } from '@/lib/gcal';

/**
 * 콘텐츠 일정(계획) CRUD. 읽기는 전 역할(자기 지점), 쓰기는 본사·원장만.
 * 저장 시 구글 캘린더로 best-effort 내보내기 (lib/gcal.ts).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: ContentType[] = ['blog', 'reels', 'etc'];

/** GET ?month=YYYY-MM&branch_id=<uuid|all> — 해당 월 일정 목록 (클라이언트 갱신용) */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const url = new URL(request.url);
  const month = url.searchParams.get('month') || kstThisMonth();
  const branchParam = url.searchParams.get('branch_id');

  let q = getAdminSupabase()
    .from('content_schedule')
    .select('id, branch_id, content_type, title, scheduled_date, assignee_id, status, memo, post_id, reel_id')
    .gte('scheduled_date', `${month}-01`)
    .lt('scheduled_date', nextMonthStart(month))
    .order('scheduled_date');

  if (branchParam === 'all') {
    if (member.role !== 'hq_admin') {
      return NextResponse.json({ error: '전사 조회는 본사만 가능해요' }, { status: 403 });
    }
  } else {
    const branchId = branchParam || member.branchId;
    if (!branchId || !canActOnBranch(member, branchId)) {
      return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
    }
    q = q.eq('branch_id', branchId);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data ?? [] });
}

/** POST {branch_id, content_type, title, scheduled_date, assignee_id?, memo?} — 일정 생성 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 일정을 등록할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId: string | null = body.branch_id || member.branchId;
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }
  const title = String(body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: '제목을 입력해주세요' }, { status: 400 });
  if (!DATE_RE.test(String(body.scheduled_date ?? ''))) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않아요' }, { status: 400 });
  }
  const contentType: ContentType = TYPES.includes(body.content_type) ? body.content_type : 'blog';

  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('content_schedule')
    .insert({
      branch_id: branchId,
      content_type: contentType,
      title,
      scheduled_date: body.scheduled_date,
      assignee_id: body.assignee_id || null,
      memo: body.memo ? String(body.memo) : null,
      created_by: member.userId,
    })
    .select('id, branch_id, content_type, title, scheduled_date, assignee_id, status, memo, post_id, reel_id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 구글 캘린더 내보내기 (best-effort — 실패해도 저장은 성공)
  const { data: branch } = await admin.from('branches').select('name').eq('id', branchId).maybeSingle();
  const eventId = await upsertScheduleEvent(data as GcalScheduleItem, branch?.name ?? null);
  if (eventId) {
    await admin.from('content_schedule').update({ gcal_event_id: eventId }).eq('id', data.id);
  }

  return NextResponse.json({ item: data });
}
