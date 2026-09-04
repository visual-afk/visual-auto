import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { callAI, friendlyAIError, parseJsonResponse } from '@/lib/generation/ai-client';

export const maxDuration = 60;

interface OcrReview {
  text: string;
  author?: string;
  date?: string;
  designer?: string;
  hasReply?: boolean;
}

const OCR_SYSTEM = [
  '너는 네이버 플레이스/스마트플레이스 리뷰 스크린샷을 읽는 OCR 도우미다.',
  '이미지에 보이는 각 "고객 리뷰"를 추출해 JSON으로만 답한다.',
  '형식: {"reviews":[{"text":"리뷰 본문","author":"작성자","date":"날짜","designer":"담당 디자이너","hasReply":false}]}',
  '- text(리뷰 본문)는 필수. 화면에 보이는 그대로, 줄바꿈은 공백으로.',
  '- author/date/designer는 보이면 채우고 안 보이면 빈 문자열.',
  '- 사장님(업체) 답글이 이미 달려 있으면 hasReply=true, 아니면 false.',
  '- 사장님 답글 텍스트는 리뷰로 넣지 마라(고객 리뷰만).',
  '- 리뷰가 하나도 없으면 {"reviews":[]}.',
].join('\n');

/** 리뷰 스크린샷(이미지) → OCR로 리뷰 목록 추출. 휴대폰 사용자용. DB 저장 없음. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '사진 읽기 설정에 문제가 있어요. 관리자에게 문의해주세요.' }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File).slice(0, 5);
  if (!files.length) {
    return NextResponse.json({ error: '리뷰 사진을 올려주세요' }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: '사진이 너무 커요(8MB 이하). 스크린샷은 대개 괜찮아요.' }, { status: 400 });
    }
  }

  try {
    const all: OcrReview[] = [];
    for (const file of files) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      const result = await callAI({
        system: OCR_SYSTEM,
        userMessage: '이 스크린샷에서 고객 리뷰를 뽑아 JSON으로 줘.',
        image: { base64, mimeType: file.type || 'image/jpeg' },
        json: true,
        temperature: 0,
        maxTokens: 2048,
      });
      const parsed = parseJsonResponse<{ reviews: OcrReview[] }>(result.text);
      for (const r of parsed.reviews || []) {
        if (r?.text?.trim()) all.push(r);
      }
    }

    // 같은 리뷰가 여러 사진에 겹칠 수 있어 본문 앞부분으로 중복 제거
    const seen = new Set<string>();
    const reviews = all.filter((r) => {
      const key = r.text.trim().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!reviews.length) {
      return NextResponse.json({ error: '사진에서 리뷰를 찾지 못했어요. 리뷰 글자가 잘 보이게 다시 찍어주세요.' }, { status: 422 });
    }
    return NextResponse.json({ reviews });
  } catch (e) {
    console.error('[review-ocr]', (e as Error).message);
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
