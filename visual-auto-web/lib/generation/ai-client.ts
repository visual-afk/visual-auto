import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * visual-auto의 lib/ai-client.ts / claude-client.ts 이식 (웹앱용).
 * knowledge/ · prompts/ · templates/ 는 앱 루트(process.cwd())에 동봉되어 런타임 fs로 읽는다.
 * AI는 Anthropic(Claude) 우선, 없으면 Gemini 폴백.
 */

const ROOT = process.cwd();

function collectMdFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...collectMdFiles(full));
      else if (entry.endsWith('.md') && entry !== 'README.md') out.push(full);
    }
  } catch {
    /* 폴더 없음 */
  }
  return out;
}

function isPlaceholder(content: string) {
  return content.includes('이 파일을') && content.includes('채워주세요');
}

export function loadKnowledge(): string {
  return collectMdFiles(join(ROOT, 'knowledge'))
    .map((f) => {
      const rel = f.replace(ROOT + '/', '');
      const content = readFileSync(f, 'utf-8').trim();
      if (isPlaceholder(content)) return '';
      return `--- ${rel} ---\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** 지점 특화 지식 (branch-{지점}.md + keywords-{지점}.md) */
export function loadBranchKnowledge(branch: string | null): string {
  if (!branch) return '';
  return collectMdFiles(join(ROOT, 'knowledge'))
    .filter((f) => f.includes(`branch-${branch}`) || f.includes(`keywords-${branch}`))
    .map((f) => {
      const content = readFileSync(f, 'utf-8').trim();
      return isPlaceholder(content) ? '' : content;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function loadPrompt(name: string): string {
  return readFileSync(join(ROOT, 'prompts', `${name}.md`), 'utf-8').trim();
}

export function loadTemplate(name: string): string {
  return readFileSync(join(ROOT, 'templates', `${name}.md`), 'utf-8').trim();
}

/** 파일이 있으면 읽고 없으면 빈 문자열 (topic-rules.md 등 선택 파일용) */
export function loadFileSafe(relPath: string): string {
  try {
    const content = readFileSync(join(ROOT, relPath), 'utf-8').trim();
    return isPlaceholder(content) ? '' : content;
  } catch {
    return '';
  }
}

export interface AICallOptions {
  system: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: 'anthropic' | 'gemini';
}

export async function callAI(opts: AICallOptions): Promise<AIResult> {
  try {
    if (process.env.ANTHROPIC_API_KEY) return await callAnthropic(opts);
    if (process.env.GEMINI_API_KEY) return await callGemini(opts);
    throw new Error('ANTHROPIC_API_KEY 또는 GEMINI_API_KEY 가 필요해요');
  } catch (e) {
    throw toFriendlyAIError(e);
  }
}

/** 공급사(구글/앤트로픽) 원문 에러를 디자이너용 한국어 메시지로 바꾼다. */
function toFriendlyAIError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[AI] provider error:', msg); // 원문은 서버 로그로만
  if (/429|too many requests|quota|rate limit|RESOURCE_EXHAUSTED|exceeded/i.test(msg)) {
    return new Error('지금 AI 사용량이 한도에 걸렸어요. 잠시 뒤 다시 눌러 주세요. (계속되면 예진매니저에게 문의)');
  }
  if (/api[_ ]?key|permission|PERMISSION_DENIED|unauthorized|401|403/i.test(msg)) {
    return new Error('AI 설정에 문제가 있어요. 예진매니저에게 문의해 주세요.');
  }
  return e instanceof Error ? e : new Error(msg);
}

async function callAnthropic(opts: AICallOptions): Promise<AIResult> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const resp = await client.messages.create({
    model,
    max_tokens: opts.maxTokens || 8000,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: [{ role: 'user', content: opts.userMessage }],
  });
  const block = resp.content.find((b) => b.type === 'text');
  return {
    text: block && block.type === 'text' ? block.text : '',
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    provider: 'anthropic',
  };
}

async function callGemini(opts: AICallOptions): Promise<AIResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    systemInstruction: opts.system,
    generationConfig: { maxOutputTokens: opts.maxTokens || 8000, temperature: opts.temperature ?? 0.7 },
  });
  const result = await model.generateContent(opts.userMessage);
  const usage = result.response.usageMetadata;
  return {
    text: result.response.text(),
    inputTokens: usage?.promptTokenCount || 0,
    outputTokens: usage?.candidatesTokenCount || 0,
    provider: 'gemini',
  };
}

/**
 * 음성 → 텍스트 (Gemini). 디자이너가 말로 남긴 "오늘의 기록"을 받아쓴다.
 * 녹음은 항상 Gemini를 쓴다(Claude는 오디오 입력 불가).
 */
export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('녹음 변환에는 GEMINI_API_KEY 가 필요해요');
  }
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { temperature: 0 },
  });
  try {
    const result = await model.generateContent([
      {
        text: [
          '다음은 미용실 디자이너가 오늘 시술을 마치고 말로 남긴 메모 녹음이다.',
          '한국어로 받아쓰되, "음", "어" 같은 군말과 반복은 빼고 자연스러운 문장으로 정리해라.',
          '내용을 요약·각색하지 말고 말한 그대로의 정보를 살려라. 받아쓴 텍스트만 출력하고 다른 설명은 붙이지 마라.',
        ].join(' '),
      },
      { inlineData: { mimeType, data: base64Audio } },
    ]);
    return result.response.text().trim();
  } catch (e) {
    throw toFriendlyAIError(e);
  }
}

/**
 * 영상 분석 (Gemini). 릴스 레퍼런스 영상을 받아 instruction 대로 분석한다.
 * Claude는 영상 입력 불가 → 항상 Gemini. v1은 inlineData(base64, ≲20MB) 사용.
 */
export async function analyzeVideo(base64Video: string, mimeType: string, instruction: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('영상 분석에는 GEMINI_API_KEY 가 필요해요');
  }
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
  });
  try {
    const result = await model.generateContent([
      { text: instruction },
      { inlineData: { mimeType, data: base64Video } },
    ]);
    return result.response.text().trim();
  } catch (e) {
    throw toFriendlyAIError(e);
  }
}

/** ```json ...``` 또는 본문에서 JSON 추출 */
export function parseJsonResponse<T>(text: string): T {
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = (match ? match[1] : text).trim();
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${(e as Error).message}\n원문: ${text.slice(0, 400)}`);
  }
}
