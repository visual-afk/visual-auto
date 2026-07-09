import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 인스타그램 연결 해제 (본인 것만) */
export async function DELETE() {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const { error } = await getAdminSupabase()
    .from('instagram_accounts')
    .delete()
    .eq('user_id', member.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
