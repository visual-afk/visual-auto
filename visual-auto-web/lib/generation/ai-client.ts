import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getAdminSupabase } from '@/lib/supabase/admin';

/**
 * visual-auto의 lib/ai-client.ts / claude-client.ts 이식 (웹앱용).
 * knowledge/ · prompts/ · templates/ 는 앱 루트(process.cwd())에 동봉되어 런타임 fs로 읽는다.
 * AI는 Anthropic(Claude) 우선, 없으면 Gemini 폴백.
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
  // json 모드: assistant 턴을 '{' 로 prefill 해서 모델이 반드시 JSON 객체로 시작하게 강제
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: opts.userMessage },
  ];
  if (opts.json) messages.push({ role: 'assistant', content: '{' });
  const resp = await client.messages.create({
    model,
    max_tokens: opts.maxTokens || 8000,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages,
  });
  const block = resp.content.find((b) => b.type === 'text');
  const raw = block && block.type === 'text' ? block.text : '';
  // prefill 한 '{' 는 응답에 포함되지 않으므로 되붙인다
  const text = opts.json ? `{${raw}` : raw;
  return {
    text,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    provider: 'anthropic',
  };
}

async function callGemini(opts: AICallOptions): Promise<AIResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', // 2.0-flash 무료등급 0으로 막힘(2026) → 2.5-flash
    systemInstruction: opts.system,
    generationConfig: {
      maxOutputTokens: opts.maxTokens || 8000,
      temperature: opts.temperature ?? 0.7,
      // json 모드: 네이티브 JSON 출력 강제(산문 반환 방지)
      ...(opts.json ? { responseMimeType: 'application/json' as const } : {}),
    },
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
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', // 2.0-flash 무료등급 0으로 막힘 → 2.5-flash(오디오 지원)
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
