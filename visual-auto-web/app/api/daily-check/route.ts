import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';

/**
 * 매일 오픈 체크 — 시트 캘린더의 '라운딩·샴푸 점검' 역할.
 * 본사 마스터 템플릿(daily_check_templates) × 지점 일일 상태(daily_open_checks).
 */

/** GET ?branch_id&date=YYYY-MM-DD — 템플릿 + 해당일 체크 상태 */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 쓸 수 있어요' }, { status: 403 });
  }

  const url = new URL(request.url);
  const branchId = url.searchParams.get('branch_id') || member.branchId;
  const date = url.searchParams.get('date') || kstTodayStr();
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }

  const admin = getAdminSupabase();
  const [{ data: templates, error: tErr }, { data: states, error: sErr }] = await Promise.all([
    admin.from('daily_check_templates').select('id, item, sort').eq('is_active', true).order('sort'),
    admin.from('daily_open_checks').select('template_id, checked, checked_at').eq('branch_id', branchId).eq('check_date', date),
  ]);
  if (tErr || sErr) {
    return NextResponse.json({ error: (tErr || sErr)!.message }, { status: 500 });
  }
  const stateMap = new Map((states ?? []).map((s) => [s.template_id, s]));
  const items = (templates ?? []).map((t) => ({
    template_id: t.id,
    item: t.item,
    checked: stateMap.get(t.id)?.checked ?? false,
    checked_at: stateMap.get(t.id)?.checked_at ?? null,
  }));
  return NextResponse.json({ date, items });
}

/** PATCH {branch_id?, date?, template_id, checked} — 항목 토글 */
export async function PATCH(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 쓸 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId: string | null = body.branch_id || member.branchId;
  const date: string = body.date || kstTodayStr();
  const templateId: string = body.template_id || '';
  const checked = body.checked === true;
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }
  if (!templateId) return NextResponse.json({ error: '항목이 없어요' }, { status: 400 });

  const { error } = await getAdminSupabase().from('daily_open_checks').upsert(
    {
      branch_id: branchId,
      check_date: date,
      template_id: templateId,
      checked,
      checked_by: member.userId,
      checked_at: checked ? new Date().toISOString() : null,
    },
    { onConflict: 'branch_id,check_date,template_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
