import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { nextMonthStart } from '@/lib/contentCalendar';

/** 카드뉴스 주제 편성 조회/수동 추가 — 수정·삭제는 [id] 라우트. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const TOPIC_SELECT =
  'id, branch_id, topic_date, entry_id, section, pool_label, material, frame, fact_seed, hint, headline_draft, bubble, verify_needed, fact_confirmed, live_slot, status, memo, card_news_id, gcal_event_id';

/** GET ?month=YYYY-MM&branch_id= — 한 달치 주제 (branch_id 없으면 볼 수 있는 브랜드 전체) */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  const branchId = url.searchParams.get('branch_id');
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'month 형식은 YYYY-MM 이에요' }, { status: 400 });
  }
  if (branchId && !canActOnBranch(member, branchId) && member.role !== 'hq_admin') {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }

  const admin = getAdminSupabase();
  let q = admin
    .from('cardnews_topics')
    .select(TOPIC_SELECT)
    .gte('topic_date', `${month}-01`)
    .lt('topic_date', nextMonthStart(month))
    .order('topic_date');
  if (branchId) q = q.eq('branch_id', branchId);
  else if (member.role !== 'hq_admin') q = q.in('branch_id', member.branchIds);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topics: data ?? [] });
}

/** POST — 주제 수동 추가 (해당 날짜에 편성이 없을 때) */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 주제를 추가할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId = String(body.branch_id ?? '').trim();
  const topicDate = String(body.topic_date ?? '').trim();
  const material = String(body.material ?? '').trim();
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }
  if (!DATE_RE.test(topicDate)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않아요' }, { status: 400 });
  }
  if (!material) return NextResponse.json({ error: '소재를 입력해주세요' }, { status: 400 });

  const { data, error } = await getAdminSupabase()
    .from('cardnews_topics')
    .insert({
      branch_id: branchId,
      topic_date: topicDate,
      material,
      section: String(body.section ?? '').trim(),
      frame: String(body.frame ?? '').trim(),
      fact_seed: body.fact_seed ? String(body.fact_seed) : null,
      headline_draft: body.headline_draft ? String(body.headline_draft) : null,
      bubble: body.bubble ? String(body.bubble) : null,
      memo: body.memo ? String(body.memo) : null,
      created_by: member.userId,
    })
    .select(TOPIC_SELECT)
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이 날짜에는 이미 주제가 있어요 — 기존 주제를 수정해주세요' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ topic: data });
}
