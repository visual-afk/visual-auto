import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { analyzeVideo, parseJsonResponse } from '@/lib/generation/ai-client';

export const maxDuration = 120;

const INSTRUCTION = [
  '너는 미용실 릴스 분석가다. 이 짧은 영상이 "왜 잘 됐는지"를 초 단위로 분석한다(13강).',
  '훅(첫 1~3초에 시선을 잡는 요소), 컷별 타이밍/내용, 화면 자막, 저장을 부르는 포인트를 본다.',
  'JSON으로만 답한다(코드블록/설명 금지):',
  '{"hook":"첫 1~3초가 시선을 잡는 이유","cuts":[{"time":"0~3초","what":"무엇이 보이는지"}],"captions":["화면 자막"],"why":"이 릴스가 잘 된 이유 2~3개를 한 문장으로"}',
].join(' ');

/** 레퍼런스 영상 업로드 → 구조 분석. (Gemini, inline ≲20MB) */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;

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
    const text = await analyzeVideo(base64, file.type || 'video/mp4', INSTRUCTION);
    const analysis = parseJsonResponse(text);
    return NextResponse.json({ analysis });
  } catch (e) {
    console.error('[reels analyze]', (e as Error).message);
    return NextResponse.json({ error: '영상 분석 중 문제가 생겼어요. 다른 영상으로 다시 시도해주세요.' }, { status: 500 });
  }
}
