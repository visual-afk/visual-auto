import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { analyzeVideo, loadPromptFor, parseJsonResponse } from '@/lib/generation/ai-client';

export const maxDuration = 120;

/** 레퍼런스 영상 업로드 → 구조 분석. (Gemini, inline ≲20MB) */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '영상 분석은 Gemini 설정이 필요해요. 관리자에게 문의해주세요.' }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '영상 파일을 올려주세요' }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: '영상이 너무 커요(20MB 이하). 짧게 잘라서 올려주세요.' }, { status: 400 });
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const instruction = await loadPromptFor('reels-analyze', member.branchId);
    const text = await analyzeVideo(base64, file.type || 'video/mp4', instruction);
    const analysis = parseJsonResponse(text);
    return NextResponse.json({ analysis });
  } catch (e) {
    console.error('[reels analyze]', (e as Error).message);
    return NextResponse.json({ error: '영상 분석 중 문제가 생겼어요. 다른 영상으로 다시 시도해주세요.' }, { status: 500 });
  }
}
