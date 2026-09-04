import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { analyzeInterview, friendlyAIError } from '@/lib/generation/ai-client';

export const maxDuration = 300;

const BUCKET = 'interview-audio';

/**
 * 면담 녹음 AI 분석 — 업로드 완료 후 클라이언트가 호출.
 * 스토리지에서 오디오를 내려받아 Gemini로 전사·요약·점수 제안까지 뽑는다.
 * 실패 시 status='failed' 로 남겨 재시도 버튼이 다시 이 라우트를 부른다.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  const { id } = await params;

  const admin = getAdminSupabase();
  const { data: interview } = await admin.from('interviews').select('*').eq('id', id).maybeSingle();
  if (!interview) return NextResponse.json({ error: '면담을 찾을 수 없어요' }, { status: 404 });
  if (!canManage(member.role) || !canActOnBranch(member, interview.branch_id)) {
    return NextResponse.json({ error: '권한이 없어요' }, { status: 403 });
  }
  if (interview.method !== 'audio' || !interview.audio_path) {
    return NextResponse.json({ error: '녹음 면담이 아니에요' }, { status: 400 });
  }
  if (interview.status === 'processing') {
    return NextResponse.json({ error: '이미 분석 중이에요. 잠시만 기다려주세요.' }, { status: 409 });
  }
  if (interview.status === 'confirmed') {
    return NextResponse.json({ error: '이미 확정된 면담이에요' }, { status: 409 });
  }

  await admin.from('interviews').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', id);

  try {
    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(interview.audio_path);
    if (dlErr || !blob) throw new Error('녹음 파일을 읽지 못했어요. 업로드가 끝났는지 확인해주세요.');
    const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
    const mimeType = blob.type || 'audio/webm';

    // 대상 구성원 이름 (프롬프트 맥락용)
    const { data: subject } = await admin
      .from('branch_users')
      .select('display_name')
      .eq('id', interview.subject_member_id)
      .maybeSingle();

    const analysis = await analyzeInterview(base64, mimeType, subject?.display_name ?? '구성원');

    const { data: updated, error: upErr } = await admin
      .from('interviews')
      .update({
        status: 'ready',
        transcript: analysis.transcript,
        summary: analysis.summary,
        goal_professional: analysis.goalProfessional || null,
        goal_personal: analysis.goalPersonal || null,
        risk_flags: analysis.riskFlags,
        suggested_scores: analysis.suggestedScores,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, status')
      .single();
    if (upErr) throw new Error(upErr.message);

    return NextResponse.json({
      interview: updated,
      suggested_scores: analysis.suggestedScores,
    });
  } catch (e) {
    await admin
      .from('interviews')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', id);
    const friendly = friendlyAIError(e);
    console.error('[interviews/process]', (e as Error).message);
    return NextResponse.json({ error: friendly.message }, { status: friendly.status });
  }
}
