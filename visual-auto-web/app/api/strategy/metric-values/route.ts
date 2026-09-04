import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
import { logEdits } from '@/lib/strategy/history';

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  if (res.member.role !== 'hq_admin') return NextResponse.json({ error: '본사 전용이에요' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const metricId: string = body.metric_id;
  const value = body.value;
  if (!metricId || value == null || Number.isNaN(Number(value))) {
    return NextResponse.json({ error: '지표와 숫자를 확인해주세요' }, { status: 400 });
  }
  const weekOf = kstTodayStr();
  const admin = getAdminSupabase();

  const { error } = await admin
    .from('strategy_metric_values')
    .upsert(
      { metric_id: metricId, value: Number(value), context_note: body.context_note ?? null, week_of: weekOf, entered_by: res.member.userId, entered_at: new Date().toISOString() },
      { onConflict: 'metric_id,week_of' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 첫 값이 들어오면 미확보 해제
  await admin.from('strategy_metrics').update({ is_unknown: false }).eq('id', metricId);
  await logEdits(admin, 'metric_value', metricId, res.member.userId, [{ field: 'value', oldValue: null, newValue: value }]);
  return NextResponse.json({ ok: true });
}
