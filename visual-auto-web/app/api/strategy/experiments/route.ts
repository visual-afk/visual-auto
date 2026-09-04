import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

const FIELDS = [
  'area_id', 'phenomenon', 'hypothesis', 'prediction', 'action',
  'assignee_name', 'due_date', 'check_metric_id', 'status', 'result_value', 'result_note', 'learned', 'promotion',
] as const;

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  if (res.member.role !== 'hq_admin') return NextResponse.json({ error: '본사 전용이에요' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  if (!body.area_id) return NextResponse.json({ error: '영역을 골라주세요' }, { status: 400 });
  if (body.status === '완료' && (!body.result_value || !body.learned)) {
    return NextResponse.json({ error: '완료하려면 결과 숫자와 배운 것이 필요해요' }, { status: 400 });
  }

  const row: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) row[f] = body[f] === '' ? null : body[f];

  const admin = getAdminSupabase();
  const { data, error } = await admin.from('strategy_experiments').insert(row).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}
