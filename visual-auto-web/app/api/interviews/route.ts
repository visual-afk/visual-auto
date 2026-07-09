import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

const BUCKET = 'interview-audio';

/**
 * 개인면담 목록/생성.
 * 녹음 파일은 라우트로 프록시하지 않는다(Vercel 바디 한계) —
 * 생성 시 서명 업로드 URL을 돌려주고 클라이언트가 스토리지에 직접 올린다.
 */

/** GET ?branch_id — 지점 면담 목록 + 구성원별 마지막 면담·컨디션 요약 */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 볼 수 있어요' }, { status: 403 });
  }

  const url = new URL(request.url);
  const branchId = url.searchParams.get('branch_id') || member.branchId;
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }

  const admin = getAdminSupabase();
  const [{ data: interviews, error: iErr }, { data: conditions, error: cErr }] = await Promise.all([
    admin
      .from('interviews')
      .select('id, subject_member_id, interviewed_at, method, status, summary, risk_flags, created_at')
      .eq('branch_id', branchId)
      .order('interviewed_at', { ascending: false })
      .limit(200),
    admin
      .from('member_conditions')
      .select('member_id, recorded_at, mental, physical, leader_support, popularity')
      .eq('branch_id', branchId)
      .order('recorded_at', { ascending: false })
      .limit(500),
  ]);
  if (iErr || cErr) return NextResponse.json({ error: (iErr || cErr)!.message }, { status: 500 });
  return NextResponse.json({ interviews: interviews ?? [], conditions: conditions ?? [] });
}

/** POST {branch_id?, subject_member_id, method?} — 면담 생성(+오디오면 서명 업로드 URL) */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 기록할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId: string | null = body.branch_id || member.branchId;
  const subjectMemberId: string = body.subject_member_id || '';
  const method: 'audio' | 'manual' = body.method === 'manual' ? 'manual' : 'audio';
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }
  if (!subjectMemberId) {
    return NextResponse.json({ error: '누구와 면담했는지 골라주세요' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  // 면담 대상이 이 지점 구성원인지 확인
  const { data: subject } = await admin
    .from('branch_users')
    .select('id, display_name, branch_id')
    .eq('id', subjectMemberId)
    .maybeSingle();
  if (!subject) return NextResponse.json({ error: '구성원을 찾을 수 없어요' }, { status: 400 });

  const audioPath = method === 'audio' ? `${branchId}/${crypto.randomUUID()}.webm` : null;
  const { data: interview, error } = await admin
    .from('interviews')
    .insert({
      branch_id: branchId,
      interviewer_id: member.userId,
      subject_member_id: subjectMemberId,
      method,
      status: method === 'manual' ? 'ready' : 'draft',
      audio_path: audioPath,
    })
    .select('id, subject_member_id, method, status')
    .single();
  if (error || !interview) {
    return NextResponse.json({ error: error?.message || '면담 생성에 실패했어요' }, { status: 500 });
  }

  // 오디오 면담: 클라이언트 직접 업로드용 서명 URL
  if (method === 'audio' && audioPath) {
    const { data: signed, error: sErr } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(audioPath);
    if (sErr || !signed) {
      await admin.from('interviews').delete().eq('id', interview.id);
      return NextResponse.json({ error: '업로드 준비에 실패했어요. 다시 시도해주세요.' }, { status: 500 });
    }
    return NextResponse.json({
      interview,
      upload: { path: audioPath, token: signed.token, signedUrl: signed.signedUrl },
    });
  }
  return NextResponse.json({ interview });
}
