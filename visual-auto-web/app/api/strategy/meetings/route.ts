import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  if (res.member.role !== 'hq_admin') return NextResponse.json({ error: '본사 전용이에요' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('strategy_meetings')
    .insert({
      meeting_date: body.meeting_date || kstTodayStr(),
      attendees: Array.isArray(body.attendees) ? body.attendees : [],
      minutes: body.minutes ?? {},
      created_experiment_ids: Array.isArray(body.created_experiment_ids) ? body.created_experiment_ids : [],
      created_by: res.member.userId,
    })
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}
