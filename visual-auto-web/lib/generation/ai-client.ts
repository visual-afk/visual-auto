import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getAdminSupabase } from '@/lib/supabase/admin';

/**
 * visual-auto의 lib/ai-client.ts / claude-client.ts 이식 (웹앱용).
 * knowledge/ · prompts/ · templates/ 는 앱 루트(process.cwd())에 동봉되어 런타임 fs로 읽는다.
 * AI는 Gemini(유료 결제 연결) 하나로만 돈다.
 *
 * 오버라이드: 본사가 '프롬프트 관리' 탭에서 저장한 내용은 content_overrides 테이블에 쌓인다.
 * *For(...) 계열 async 로더가 "지점 오버라이드 → 전사 공통 → 파일" 순으로 내용을 고른다.
 */

const ROOT = process.cwd();

type OverrideKind = 'prompt' | 'knowledge';

/**
 * (전사 공통 + 해당 지점) 오버라이드를 한 번에 읽어 slug→content 맵으로.
 * 지점 오버라이드가 전사 공통보다 우선한다. DB/설정 문제 시 빈 맵(=파일 폴백).
 */
async function fetchOverrides(kind: OverrideKind, branchId: string | null): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return map;
  try {
    const admin = getAdminSupabase();
    const filter = branchId ? `branch_id.is.null,branch_id.eq.${branchId}` : 'branch_id.is.null';
    const { data } = await admin
      .from('content_overrides')
      .select('slug, branch_id, content')
      .eq('kind', kind)
      .or(filter);
    // 전사 공통 먼저 채우고, 지점 오버라이드로 덮어써 지점 우선을 보장
    for (const row of data ?? []) if (!row.branch_id) map.set(row.slug, row.content);
    for (const row of data ?? []) if (row.branch_id) map.set(row.slug, row.content);
  } catch {
    /* DB 문제 시 파일 폴백 */
  }
  return map;
}

/** knowledge 파일 절대경로 → 오버라이드 slug (예: brand/brand-voice.md) */
function knowledgeSlug(fullPath: string): string {
  return fullPath.replace(join(ROOT, 'knowledge') + '/', '');
}

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

// ── 오버라이드 인지 로더 (생성 파이프라인에서 사용) ────────────────────────
// 각 라우트는 이미 branchId를 확정해 둔 뒤 아래 *For 로더를 호출한다.

/** loadPrompt + 오버라이드. slug(=프롬프트명)에 오버라이드가 있으면 그 내용, 없으면 파일. */
export async function loadPromptFor(name: string, branchId: string | null): Promise<string> {
  const map = await fetchOverrides('prompt', branchId);
  const override = map.get(name);
  return override != null ? override.trim() : loadPrompt(name);
}

/** loadKnowledge + 오버라이드. 각 파일 내용을 slug 오버라이드가 있으면 치환한다. */
export async function loadKnowledgeFor(branchId: string | null): Promise<string> {
  const map = await fetchOverrides('knowledge', branchId);
  return collectMdFiles(join(ROOT, 'knowledge'))
    .map((f) => {
      const rel = f.replace(ROOT + '/', '');
      const override = map.get(knowledgeSlug(f));
      const content = (override != null ? override : readFileSync(f, 'utf-8')).trim();
      if (isPlaceholder(content) || !content) return '';
      return `--- ${rel} ---\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** loadBranchKnowledge + 오버라이드. 지점 특화 파일에만 slug 오버라이드 적용. */
export async function loadBranchKnowledgeFor(branch: string | null, branchId: string | null): Promise<string> {
  if (!branch) return '';
  const map = await fetchOverrides('knowledge', branchId);
  return collectMdFiles(join(ROOT, 'knowledge'))
    .filter((f) => f.includes(`branch-${branch}`) || f.includes(`keywords-${branch}`))
    .map((f) => {
      const override = map.get(knowledgeSlug(f));
      const content = (override != null ? override : readFileSync(f, 'utf-8')).trim();
      return isPlaceholder(content) ? '' : content;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** loadFileSafe + 오버라이드. relPath는 'knowledge/...' 형태 (topic-rules 등). */
export async function loadFileSafeFor(relPath: string, branchId: string | null): Promise<string> {
  if (relPath.startsWith('knowledge/')) {
    const map = await fetchOverrides('knowledge', branchId);
    const override = map.get(relPath.replace('knowledge/', ''));
    if (override != null) {
      const trimmed = override.trim();
      return isPlaceholder(trimmed) ? '' : trimmed;
    }
  }
  return loadFileSafe(relPath);
}

export interface AICallOptions {
  system: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  /** JSON 응답을 API 레벨에서 강제한다(프롬프트 지시만으론 모델이 산문을 뱉는 경우 방지). */
  json?: boolean;
  /** 이미지 입력(스크린샷 OCR 등). base64 는 순수 데이터(data: 접두어 없이). */
  image?: { base64: string; mimeType: string };
}

export interface AIResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: 'gemini';
}

/** AI 호출은 Gemini(유료 결제 연결) 하나로만 돈다. */
export async function callAI(opts: AICallOptions): Promise<AIResult> {
  try {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 가 필요해요');
    return await callGemini(opts);
  } catch (e) {
    throw toFriendlyAIError(e);
  }
}

/** 잘림·파싱 오류는 일시적인 경우가 많아 재시도 1회로 살릴 수 있다. */
function isRetryableJsonError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /파싱|parse|JSON|잘렸|too long|길어/i.test(msg);
}

/**
 * callAI + parseJsonResponse 를 묶고, 응답 잘림/JSON 파싱 실패일 때만 1회 자동 재시도.
 * 재시도까지 실패하면 마지막 에러를 그대로 던져 friendlyAIError 매핑을 탄다.
 */
export async function callAIJson<T>(opts: AICallOptions): Promise<T> {
  try {
    return parseJsonResponse<T>((await callAI(opts)).text);
  } catch (e) {
    if (!isRetryableJsonError(e)) throw e;
    console.warn('[AI] JSON 불완전 → 1회 재시도:', (e as Error).message.slice(0, 200));
    return parseJsonResponse<T>((await callAI(opts)).text);
  }
}

/** 공급사(구글 Gemini) 원문 에러를 디자이너용 한국어 메시지로 바꾼다. */
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

/**
 * 라우트 catch에서 쓰는 디자이너용 에러 매핑.
 * { message, status } 를 돌려주니 NextResponse.json({error: message}, {status}) 로 그대로 쓴다.
 * 원문(파싱 실패 원문 덤프 등)은 절대 노출하지 않는다.
 */
export function friendlyAIError(e: unknown): { message: string; status: number } {
  const msg = e instanceof Error ? e.message : String(e);
  if (/한도|사용량|429|too many requests|quota|rate limit|RESOURCE_EXHAUSTED|exceeded/i.test(msg)) {
    return {
      message: '지금 AI 사용량이 한도에 걸렸어요. 잠시 뒤 다시 눌러 주세요. (계속되면 예진매니저에게 문의)',
      status: 429,
    };
  }
  if (/api[_ ]?key|permission|PERMISSION_DENIED|unauthorized|401|403|설정/i.test(msg)) {
    return { message: 'AI 설정에 문제가 있어요. 예진매니저에게 문의해 주세요.', status: 503 };
  }
  if (/파싱|parse|JSON|잘렸|too long|길어/i.test(msg)) {
    return {
      message: 'AI 답이 완전하게 오지 않았어요. 「고쳐쓰기」로 다시 시도해 주세요. (계속되면 예진매니저에게 문의)',
      status: 502,
    };
  }
  return { message: '글을 쓰는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.', status: 500 };
}

/**
 * gemini-2.5-flash는 '사고(thinking)' 토큰이 maxOutputTokens를 잠식해서
 * JSON 본문이 중간에 잘려 나온다(= 디자이너가 보던 "파싱실패"의 진짜 원인).
 * thinkingBudget: 0 으로 사고를 끄면 토큰이 전부 실제 응답에 쓰인다.
 * (구버전 SDK 타입엔 thinkingConfig가 없어 런타임 통과용으로 캐스팅한다.)
 */
function geminiGenerationConfig(opts: { maxOutputTokens: number; temperature?: number; json?: boolean }) {
  return {
    maxOutputTokens: opts.maxOutputTokens,
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    thinkingConfig: { thinkingBudget: 0 },
    // json 모드: 네이티브 JSON 출력 강제(산문 반환 방지)
    ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** 응답이 잘렸는지(finishReason=MAX_TOKENS) 판별해 명확한 에러를 던진다. */
function assertNotTruncated(finishReason: string | undefined) {
  if (finishReason && /MAX_TOKENS/i.test(finishReason)) {
    throw new Error('AI 응답이 너무 길어서 중간에 잘렸어요. 잠시 후 다시 시도해 주세요.');
  }
}

async function callGemini(opts: AICallOptions): Promise<AIResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', // 2.0-flash 무료등급 0으로 막힘(2026) → 2.5-flash
    systemInstruction: opts.system,
    generationConfig: geminiGenerationConfig({
      maxOutputTokens: opts.maxTokens || 8000,
      temperature: opts.temperature ?? 0.7,
      json: opts.json,
    }),
  });
  const content = opts.image
    ? [{ text: opts.userMessage }, { inlineData: { mimeType: opts.image.mimeType, data: opts.image.base64 } }]
    : opts.userMessage;
  const result = await model.generateContent(content);
  const usage = result.response.usageMetadata;
  assertNotTruncated(result.response.candidates?.[0]?.finishReason);
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
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', // 2.0-flash 무료등급 0으로 막힘 → 2.5-flash(오디오 지원)
    generationConfig: geminiGenerationConfig({ maxOutputTokens: 4000, temperature: 0 }),
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
    generationConfig: geminiGenerationConfig({ maxOutputTokens: 2000, temperature: 0.4, json: true }),
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

/** ```json ...``` 코드펜스, 없으면 본문에서 첫 균형 잡힌 {…} 객체를 추출 */
export function parseJsonResponse<T>(text: string): T {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const candidate = (fence ? fence[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // 모델이 JSON 앞뒤에 산문을 붙인 경우: 첫 '{' ~ 짝 맞는 '}' 만 잘라 재시도
    const sliced = extractFirstJsonObject(candidate);
    if (sliced) {
      try {
        return JSON.parse(sliced);
      } catch (e2) {
        throw new Error(`JSON 파싱 실패: ${(e2 as Error).message}\n원문: ${text.slice(0, 400)}`);
      }
    }
    throw new Error(`JSON 파싱 실패: 응답에 JSON이 없어요\n원문: ${text.slice(0, 400)}`);
  }
}

/** 문자열 내 첫 '{'부터 문자열 리터럴을 존중하며 짝 맞는 '}'까지 추출 */
function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
