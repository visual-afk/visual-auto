import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage, type MemberContext } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { upsertTopicEvent, deleteScheduleEvent, type GcalTopicItem } from '@/lib/gcal';

/** 카드뉴스 주제 수정/삭제 — 본사·해당 브랜드 원장만. 구글 캘린더 동기화는 best-effort. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['planning', 'reference', 'filmed', 'uploaded', 'skipped'] as const;

const TOPIC_SELECT =
  'id, branch_id, topic_date, entry_id, section, pool_label, material, frame, fact_seed, hint, headline_draft, bubble, verify_needed, fact_confirmed, live_slot, status, memo, reference_url, card_news_id, gcal_event_id';

async function loadAndAuthorize(id: string, member: MemberContext) {
  if (!canManage(member.role)) {
    return { error: NextResponse.json({ error: '원장·본사만 주제를 수정할 수 있어요' }, { status: 403 }) };
  }
  const { data: row } = await getAdminSupabase().from('cardnews_topics').select(TOPIC_SELECT).eq('id', id).maybeSingle();
  if (!row) return { error: NextResponse.json({ error: '주제를 찾을 수 없어요' }, { status: 404 }) };
  if (!canActOnBranch(member, row.branch_id)) {
    return { error: NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 }) };
  }
  return { row };
}

const TEXT_FIELDS = ['material', 'frame', 'section', 'fact_seed', 'hint', 'headline_draft', 'bubble', 'memo', 'reference_url'] as const;

/** PATCH — 소재/프레임/팩트시드/헤드라인/말풍선/팩트확정/상태/메모/날짜 부분 수정 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { id } = await params;
  const loaded = await loadAndAuthorize(id, res.member);
  if ('error' in loaded) return loaded.error;

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of TEXT_FIELDS) {
    if (key in body) {
      const v = String(body[key] ?? '').trim();
      if (key === 'material' && !v) return NextResponse.json({ error: '소재를 입력해주세요' }, { status: 400 });
      patch[key] = key === 'material' || key === 'frame' || key === 'section' ? v : v || null;
    }
  }
  if ('topic_date' in body) {
    if (!DATE_RE.test(String(body.topic_date ?? ''))) {
      return NextResponse.json({ error: '날짜 형식이 올바르지 않아요' }, { status: 400 });
    }
    patch.topic_date = body.topic_date;
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: '알 수 없는 상태예요' }, { status: 400 });
    }
    patch.status = body.status;
  }
  if ('fact_confirmed' in body) patch.fact_confirmed = !!body.fact_confirmed;

  const admin = getAdminSupabase();
  const { data, error } = await admin.from('cardnews_topics').update(patch).eq('id', id).select(TOPIC_SELECT).single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '옮기려는 날짜에 이미 주제가 있어요' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 구글 캘린더 동기화: 건너뜀은 이벤트 삭제, 그 외 변경은 upsert
  if (data.status === 'skipped') {
    await deleteScheduleEvent(data.gcal_event_id);
    if (data.gcal_event_id) {
      await admin.from('cardnews_topics').update({ gcal_event_id: null }).eq('id', id);
    }
  } else {
    const { data: branch } = await admin.from('branches').select('name').eq('id', data.branch_id).maybeSingle();
    const eventId = await upsertTopicEvent(data as GcalTopicItem, branch?.name ?? null);
    if (eventId && eventId !== data.gcal_event_id) {
      await admin.from('cardnews_topics').update({ gcal_event_id: eventId }).eq('id', id);
    }
  }

  return NextResponse.json({ topic: data });
}

/** DELETE — 주제 삭제. 미래 날짜는 다음 크론 때 은행에서 재시드되니, 비우려면 상태를 '건너뜀'으로. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { id } = await params;
  const loaded = await loadAndAuthorize(id, res.member);
  if ('error' in loaded) return loaded.error;

  await deleteScheduleEvent(loaded.row.gcal_event_id);
  const { error } = await getAdminSupabase().from('cardnews_topics').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
