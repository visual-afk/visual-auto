import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { analyzeVideo, friendlyAIError, loadPromptFor, parseJsonResponse } from '@/lib/generation/ai-client';

export const maxDuration = 300;

const BUCKET = 'reels-video';
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * 업로드된 레퍼런스 영상 분석 — 클라이언트가 스토리지 업로드를 마친 뒤 호출.
 * 스토리지에서 영상을 내려받아 Gemini(Files API)로 구조를 분석하고, 임시 영상은 곧바로 지운다.
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '영상 분석은 Gemini 설정이 필요해요. 관리자에게 문의해주세요.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const path: string = typeof body.path === 'string' ? body.path : '';
  // 경로 접두어(소유자)가 본인 지점/계정인지 검증 — 임의 객체 열람 방지
  const owner = path.split('/')[0];
  const allowed = new Set<string>([member.userId, ...(member.branchIds ?? [])]);
  if (!path || !owner || !allowed.has(owner)) {
    return NextResponse.json({ error: '잘못된 요청이에요. 영상을 다시 올려주세요.' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  try {
    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path);
    if (dlErr || !blob) {
      return NextResponse.json({ error: '영상을 읽지 못했어요. 업로드가 끝났는지 확인하고 다시 시도해주세요.' }, { status: 400 });
    }
    if (blob.size > MAX_BYTES) {
      return NextResponse.json({ error: '영상이 너무 커요(50MB 이하). 짧게 잘라서 올려주세요.' }, { status: 400 });
    }

    const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
    const mimeType = blob.type || 'video/mp4';
    const instruction = await loadPromptFor('reels-analyze', member.branchId);
    const text = await analyzeVideo(base64, mimeType, instruction);
    const analysis = parseJsonResponse(text);
    return NextResponse.json({ analysis });
  } catch (e) {
    console.error('[reels analyze]', (e as Error).message);
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  } finally {
    // 분석용 임시 영상은 성공/실패 무관 항상 정리
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
  }
}
