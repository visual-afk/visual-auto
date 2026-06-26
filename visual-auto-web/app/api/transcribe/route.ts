import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { transcribeAudio } from '@/lib/generation/ai-client';

export const maxDuration = 60;

/** 녹음(오디오) → 텍스트. WriteStudio "기록" 칸의 녹음하기 버튼이 호출한다. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;

  const body = await request.json().catch(() => ({}));
  const audio: string = body.audio || '';
  const mimeType: string = body.mime_type || 'audio/webm';
  if (!audio) {
    return NextResponse.json({ error: '녹음 데이터가 비어있어요' }, { status: 400 });
  }

  try {
    const text = await transcribeAudio(audio, mimeType);
    return NextResponse.json({ text });
  } catch (e) {
    const raw = (e as Error).message || '';
    // 디자이너에게는 영어 원문 대신 친절한 안내로 (원문은 서버 로그에)
    console.error('[transcribe]', raw);
    let friendly = '지금 녹음 변환이 안 돼요. 잠시 후 다시 하거나 직접 타이핑해주세요.';
    if (/429|quota|rate.?limit/i.test(raw)) {
      friendly = '오늘 녹음 변환 한도를 다 썼어요. 잠시 후 다시 시도하거나 직접 타이핑해주세요.';
    } else if (/api.?key|invalid|401|403/i.test(raw)) {
      friendly = '녹음 기능 설정에 문제가 있어요. 관리자에게 알려주세요. (직접 타이핑은 가능)';
    }
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
