/**
 * Gemini 이미지 생성 — 카드뉴스 "사진 자리"를 톤 맞춰 채운다.
 *
 * 설치된 @google/generative-ai(0.24)는 이미지 출력(responseModalities)을 지원하지 않아
 * REST 를 직접 부른다 (의존성 추가 없음). 텍스트 생성은 lib/generation/ai-client.ts 그대로.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const CARD_RATIO = '4:5'; // 카드 1080×1350

export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

interface GeminiPart {
  inlineData?: { mimeType: string; data: string };
  text?: string;
}

/** 사용자에게 보여줄 한국어 메시지 (원문은 서버 로그로만) — ai-client.friendlyAIError 와 같은 톤 */
function friendlyImageError(status: number, raw: string): Error {
  console.error('[image-gen]', status, raw.slice(0, 500));
  if (status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(raw)) {
    return new Error('지금 AI 사진 생성 사용량이 한도에 걸렸어요. 잠시 뒤 다시 눌러 주세요.');
  }
  if (status === 503 || /UNAVAILABLE|overloaded/i.test(raw)) {
    return new Error('지금 AI(구글)가 붐벼서 사진을 못 만들었어요. 1~2분 뒤 다시 시도해 주세요.');
  }
  if (status === 401 || status === 403 || /API[_ ]?key|PERMISSION_DENIED/i.test(raw)) {
    return new Error('AI 사진 생성 설정에 문제가 있어요. 예진매니저에게 문의해 주세요.');
  }
  return new Error('사진을 만들지 못했어요. 문구를 조금 바꿔서 다시 시도해 주세요.');
}

async function call(model: string, key: string, body: unknown): Promise<Response> {
  return fetch(`${ENDPOINT}/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * 프롬프트 하나로 카드 배경용 이미지 1장을 만든다.
 * 비율(imageConfig)을 모델이 거부하면 그 필드를 빼고 1회 재시도 — 비율이 달라도
 * 스튜디오의 사진 크기·위치 조절로 맞출 수 있어 치명적이지 않다.
 */
export async function generateCardPhoto(prompt: string): Promise<GeneratedImage> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI 사진 생성 설정에 문제가 있어요. 예진매니저에게 문의해 주세요.');
  const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
  const contents = [{ parts: [{ text: prompt }] }];

  let res = await call(model, key, {
    contents,
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: CARD_RATIO } },
  });
  if (res.status === 400) {
    console.warn('[image-gen] imageConfig 거부 → 비율 지정 없이 재시도');
    res = await call(model, key, { contents, generationConfig: { responseModalities: ['IMAGE'] } });
  }
  if (!res.ok) throw friendlyImageError(res.status, await res.text().catch(() => ''));

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  };
  const candidate = data.candidates?.[0];
  const image = candidate?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!image?.data) {
    // 안전필터 등으로 이미지가 안 온 경우
    console.error('[image-gen] 이미지 없음', candidate?.finishReason, JSON.stringify(data).slice(0, 400));
    throw new Error('사진을 만들지 못했어요. 문구를 조금 바꿔서 다시 시도해 주세요.');
  }
  return { base64: image.data, mimeType: image.mimeType || 'image/png' };
}
