import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage, type MemberContext } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logAccess } from '@/lib/access-log';

const BUCKET = 'interview-audio';

/** 텍스트 필드 허용 목록 (검토 화면에서 편집 가능한 것들) */
const EDITABLE = ['summary', 'goal_professional', 'goal_personal', 'leader_feedback', 'interviewed_at'] as const;

async function loadInterview(id: string, member: MemberContext) {
  const admin = getAdminSupabase();
  const { data } = await admin.from('interviews').select('*').eq('id', id).maybeSingle();
  if (!data) return { error: NextResponse.json({ error: '면담을 찾을 수 없어요' }, { status: 404 }) };
  if (!canManage(member.role) || !canActOnBranch(member, data.branch_id)) {
    return { error: NextResponse.json({ error: '볼 수 없는 면담이에요' }, { status: 403 }) };
  }
  return { interview: data, admin };
}

/** GET — 면담 상세. ?action=audio_url 이면 녹음 재생용 서명 URL(10분) + 열람 로그 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  const { id } = await params;

  const loaded = await loadInterview(id, member);
  if ('error' in loaded) return loaded.error;
  const { interview, admin } = loaded;

  const url = new URL(request.url);
  if (url.searchParams.get('action') === 'audio_url') {
    if (!interview.audio_path || interview.audio_deleted_at) {
      return NextResponse.json({ error: '녹음이 없거나 보존기간(90일)이 지나 삭제됐어요' }, { status: 404 });
    }
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(interview.audio_path, 600);
    if (!signed) return NextResponse.json({ error: '재생 URL 생성에 실패했어요' }, { status: 500 });
    void logAccess(member, '/interviews', `play_interview_audio:${id}`);
    return NextResponse.json({ audio_url: signed.signedUrl });
  }

  // 대상 구성원 이름 붙여서 반환
  const { data: subject } = await admin
    .from('branch_users')
    .select('id, display_name, role')
    .eq('id', interview.subject_member_id)
    .maybeSingle();
  return NextResponse.json({ interview: { ...interview, subject_name: subject?.display_name ?? null } });
}

/**
 * PATCH — action 기반:
 *  - save_review: 요약/목표/피드백/점수 수정 (확정 전 검토 저장)
 *  - confirm: 면담 확정 → member_conditions 1행 append
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  const { id } = await params;

  const loaded = await loadInterview(id, member);
  if ('error' in loaded) return loaded.error;
  const { interview, admin } = loaded;

  const body = await request.json().catch(() => ({}));
  const action: string = body.action || 'save_review';

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) patch[k] = body[k] == null ? null : String(body[k]);

  if (action === 'confirm') {
    if (interview.status === 'confirmed') {
      return NextResponse.json({ error: '이미 확정된 면담이에요' }, { status: 409 });
    }
    patch.status = 'confirmed';

    const scores = body.scores ?? {};
    const clamp = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n) : null;
    };
    const { error: cErr } = await admin.from('member_conditions').insert({
      member_id: interview.subject_member_id,
      branch_id: interview.branch_id,
      interview_id: interview.id,
      recorded_at: (typeof body.interviewed_at === 'string' && body.interviewed_at) || interview.interviewed_at,
      mental: clamp(scores.mental),
      physical: clamp(scores.physical),
      leader_support: clamp(scores.leader_support),
      popularity: clamp(scores.popularity),
      source: body.scores_source === 'ai' ? 'ai' : interview.method === 'manual' ? 'manual' : 'adjusted',
      note: body.condition_note ? String(body.condition_note) : null,
    });
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const { data, error } = await admin
    .from('interviews')
    .update(patch)
    .eq('id', id)
    .select('id, status, summary, goal_professional, goal_personal, leader_feedback, interviewed_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interview: data });
}

/** DELETE — 확정 전 면담만 삭제 (녹음 파일도 함께) */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  const { id } = await params;

  const loaded = await loadInterview(id, member);
  if ('error' in loaded) return loaded.error;
  const { interview, admin } = loaded;

  if (interview.status === 'confirmed') {
    return NextResponse.json({ error: '확정된 면담은 지울 수 없어요' }, { status: 403 });
  }
  if (interview.audio_path) {
    await admin.storage.from(BUCKET).remove([interview.audio_path]).catch(() => {});
  }
  const { error } = await admin.from('interviews').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
