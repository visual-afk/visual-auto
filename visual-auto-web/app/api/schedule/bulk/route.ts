import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { ContentType } from '@/lib/contentCalendar';
import { upsertScheduleEvent, type GcalScheduleItem } from '@/lib/gcal';

/**
 * 월 기획 일괄 등록. 전량 사전검증 → 단일 insert(all-or-nothing) → gcal export 행별 best-effort.
 * 부분 저장을 만들지 않는다 — 실패 행 인덱스를 돌려줘 UI가 행을 하이라이트한다.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: ContentType[] = ['blog', 'reels', 'etc'];
const MAX_ROWS = 50;

interface BulkItem {
  branch_id?: string;
  content_type?: string;
  title?: string;
  scheduled_date?: string;
  assignee_id?: string | null;
  memo?: string | null;
}

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 일정을 등록할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const items: BulkItem[] = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: '등록할 행이 없어요' }, { status: 400 });
  if (items.length > MAX_ROWS) {
    return NextResponse.json({ error: `한 번에 ${MAX_ROWS}행까지 등록할 수 있어요` }, { status: 400 });
  }

  // 전량 사전검증 — 하나라도 실패하면 아무것도 저장하지 않는다
  const rowErrors: { index: number; error: string }[] = [];
  for (const [i, it] of items.entries()) {
    if (!it.branch_id || !canActOnBranch(member, it.branch_id)) {
      rowErrors.push({ index: i, error: '소속되지 않은 지점이에요' });
      continue;
    }
    if (!String(it.title ?? '').trim()) {
      rowErrors.push({ index: i, error: '제목을 입력해주세요' });
      continue;
    }
    if (!DATE_RE.test(String(it.scheduled_date ?? ''))) {
      rowErrors.push({ index: i, error: '날짜 형식이 올바르지 않아요' });
    }
  }
  if (rowErrors.length > 0) {
    return NextResponse.json({ error: '일부 행에 문제가 있어요', rows: rowErrors }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const rows = items.map((it) => ({
    branch_id: it.branch_id!,
    content_type: TYPES.includes(it.content_type as ContentType) ? (it.content_type as ContentType) : 'blog',
    title: String(it.title).trim(),
    scheduled_date: it.scheduled_date!,
    assignee_id: it.assignee_id || null,
    memo: it.memo ? String(it.memo) : null,
    created_by: member.userId,
  }));

  // 단일 insert 문 = all-or-nothing
  const { data, error } = await admin
    .from('content_schedule')
    .insert(rows)
    .select('id, branch_id, content_type, title, scheduled_date, assignee_id, status, memo, post_id, reel_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const saved = data ?? [];

  // gcal export: 행별 best-effort
  const { data: branches } = await admin.from('branches').select('id, name');
  const branchNames = new Map((branches ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
  const exports = await Promise.allSettled(
    saved.map(async (row) => {
      const eventId = await upsertScheduleEvent(row as GcalScheduleItem, branchNames.get(row.branch_id) ?? null);
      if (eventId) await admin.from('content_schedule').update({ gcal_event_id: eventId }).eq('id', row.id);
      return !!eventId;
    }),
  );
  const gcalFailed = exports.filter((e) => e.status !== 'fulfilled' || !e.value).length;

  return NextResponse.json({ items: saved, gcalFailed });
}
