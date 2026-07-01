import { NextResponse } from 'next/server';
import { requireMember, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getContentProfile } from '@/lib/reels';

/** 콘텐츠 프로필 조회 */
export async function GET() {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  const profile = await getContentProfile(member.userId, member.branchId);
  return NextResponse.json({ profile, canEditBranch: canManage(member.role) });
}

/** 프로필 저장 — 디자이너: persona/character / 원장·본사: 매장 톤·지역도 */
export async function PUT(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  const body = await request.json().catch(() => ({}));
  const admin = getAdminSupabase();

  // 디자이너 개인 프로필 (본인 것만)
  await admin.from('designer_profiles').upsert(
    {
      user_id: member.userId,
      branch_id: member.branchId,
      persona: body.persona ?? {},
      character: body.character ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  // 매장 톤·지역은 원장·본사만
  if (canManage(member.role) && member.branchId && (body.tone !== undefined || body.region_target !== undefined)) {
    await admin
      .from('branches')
      .update({ tone: body.tone ?? null, region_target: body.region_target ?? null })
      .eq('id', member.branchId);
  }

  return NextResponse.json({ ok: true });
}
