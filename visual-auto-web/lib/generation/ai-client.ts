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

/** 과부하(503)·순간 한도(429)는 몇 초 뒤 재시도하면 살아나는 경우가 대부분이다. */
function isTransientProviderError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /503|UNAVAILABLE|overloaded|429|too many requests|RESOURCE_EXHAUSTED/i.test(msg);
}

/**
 * AI 호출은 Gemini(유료 결제 연결) 하나로만 돈다.
 * 과부하 시간대엔 503이 몇 번 연달아 오기도 해서 백오프를 두고 최대 3회까지 시도한다.
 */
export async function callAI(opts: AICallOptions): Promise<AIResult> {
  if (!process.env.GEMINI_API_KEY) throw toFriendlyAIError(new Error('GEMINI_API_KEY 가 필요해요'));
  const backoffMs = [2000, 6000];
  for (let i = 0; ; i++) {
    try {
      return await callGemini(opts);
    } catch (e) {
      if (!isTransientProviderError(e) || i >= backoffMs.length) throw toFriendlyAIError(e);
      console.warn(`[AI] 일시 오류 → ${backoffMs[i] / 1000}초 뒤 재시도:`, (e instanceof Error ? e.message : String(e)).slice(0, 200));
      await new Promise((r) => setTimeout(r, backoffMs[i]));
    }
  }
}

// ── 구분자(delimiter) 포맷 호출 ─────────────────────────────────────────────
// 긴 한국어 마크다운 본문을 JSON 문자열에 넣으면 Gemini가 json 모드에서도
// 개행·따옴표 이스케이프를 빠뜨려 파싱이 깨진다(글쓰기 "실패"의 진짜 원인).
// 긴 본문은 JSON 대신 ===SECTION=== 구분자 텍스트로 받아 그 계열 실패를 원천 차단한다.

export interface DelimitedSection {
  /** 구분자 이름. JSON 폴백 시 소문자로 바꿔 키 매칭하므로 기존 JSON 키의 대문자형을 쓴다. */
  name: string;
  /** 모델에게 보여줄 해당 섹션 설명 */
  description: string;
  /** 기본 true. 누락 시 1회 재시도 대상 */
  required?: boolean;
}

function buildDelimitedInstruction(sections: DelimitedSection[]): string {
  return [
    '',
    '--- 출력 형식 (최우선 지침 — 앞의 다른 출력 형식 지시는 무시하라) ---',
    'JSON·코드펜스·여는 말·닫는 말을 쓰지 마라. 아래 구분자 형식 그대로만 출력하라.',
    '각 구분자 줄(===이름===)은 정확히 그대로 쓰고, 그 다음 줄부터 해당 내용만 쓴다.',
    '',
    ...sections.map((s) => `===${s.name}===\n(${s.description})`),
    '===END===',
  ].join('\n');
}

function parseDelimitedSections(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const marks: { name: string; contentStart: number; markStart: number }[] = [];
  const re = /^[ \t]*===([A-Z0-9_]+)===[ \t]*$/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    marks.push({ name: m[1], contentStart: m.index + m[0].length, markStart: m.index });
  }
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].name === 'END') continue;
    const end = i + 1 < marks.length ? marks[i + 1].markStart : text.length;
    map.set(marks[i].name, text.slice(marks[i].contentStart, end).trim());
  }
  return map;
}

/** 모델이 지시를 어기고 JSON으로 답한 경우: 키를 대문자화해 섹션 맵으로 변환 */
function jsonFallbackToSections(text: string): Map<string, string> | null {
  try {
    const obj = parseJsonResponse<Record<string, unknown>>(text);
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(obj)) {
      map.set(k.toUpperCase(), Array.isArray(v) ? v.map(String).join('\n') : String(v ?? ''));
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * callAI 를 구분자 포맷으로 감싼다. 시스템 프롬프트 끝에 출력 형식 지시를 강제로 덧붙이므로
 * DB 오버라이드된 프롬프트가 여전히 "JSON으로 출력"을 담고 있어도 이 지시가 이긴다.
 * 필수 섹션이 누락되면 1회 재시도하고, 그래도 없으면 파싱 실패 에러를 던진다.
 */
export async function callAIDelimited(
  opts: AICallOptions,
  sections: DelimitedSection[],
): Promise<Record<string, string>> {
  const callOpts: AICallOptions = {
    ...opts,
    json: false,
    system: opts.system + '\n' + buildDelimitedInstruction(sections),
  };
  const required = sections.filter((s) => s.required !== false).map((s) => s.name);

  const attempt = async (): Promise<{ result: Record<string, string>; missing: string[] }> => {
    const text = (await callAI(callOpts)).text;
    let map = parseDelimitedSections(text);
    if (map.size === 0) map = jsonFallbackToSections(text) ?? map;
    const missing = required.filter((name) => !map.get(name));
    const result: Record<string, string> = {};
    for (const [k, v] of map) result[k] = v;
    return { result, missing };
  };

  const first = await attempt();
  if (first.missing.length === 0) return first.result;
  console.warn('[AI] 구분자 섹션 누락 → 1회 재시도:', first.missing.join(', '));
  const second = await attempt();
  if (second.missing.length === 0) return second.result;
  throw new Error(`AI 응답 파싱 실패: ${second.missing.join(', ')} 섹션이 없어요`);
}

/** 공급사(구글 Gemini) 원문 에러를 디자이너용 한국어 메시지로 바꾼다. */
function toFriendlyAIError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[AI] provider error:', msg); // 원문은 서버 로그로만
  if (/503|UNAVAILABLE|overloaded|high demand/i.test(msg)) {
    return new Error('지금 AI(구글)가 붐벼서 응답을 못 받았어요. 1~2분 뒤 다시 눌러 주세요.');
  }
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
  if (/붐벼|503|UNAVAILABLE|overloaded|high demand/i.test(msg)) {
    return { message: '지금 AI(구글)가 붐벼서 응답을 못 받았어요. 1~2분 뒤 다시 눌러 주세요.', status: 503 };
  }
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

// ── 개인면담 분석 (원장 관리자시트 → 앱: 녹음 → 전사·요약·컨디션 점수) ──────

export interface InterviewAnalysis {
  transcript: string;
  summary: string;
  goalProfessional: string;
  goalPersonal: string;
  /** AI 제안 점수(0~10). 대화에서 판단 근거가 없으면 null. */
  suggestedScores: {
    mental: number | null;
    physical: number | null;
    leader_support: number | null;
    popularity: number | null;
  };
  /** 이탈신호 키워드 (없으면 빈 배열) */
  riskFlags: string[];
}

/** 인라인 오디오 한계(요청 총 20MB) 근처면 Files API로 우회하는 기준 */
const INLINE_AUDIO_LIMIT_BYTES = 15 * 1024 * 1024;

function parseScore(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n) : null;
}

/**
 * 개인면담 녹음 → 전사 + 요약 + 목표 + 컨디션 점수 제안 + 이탈신호.
 * 긴 한국어 전사문을 JSON에 담으면 이스케이프가 깨지므로(글쓰기와 같은 실패 계열)
 * ===SECTION=== 구분자 포맷으로 받는다. 필수 섹션 누락 시 1회 재시도.
 */
export async function analyzeInterview(
  base64Audio: string,
  mimeType: string,
  subjectName: string,
): Promise<InterviewAnalysis> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('면담 분석에는 GEMINI_API_KEY 가 필요해요');
  }
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    generationConfig: geminiGenerationConfig({ maxOutputTokens: 32000, temperature: 0.2 }),
  });

  const sections: DelimitedSection[] = [
    { name: 'TRANSCRIPT', description: '대화 전사문. 군말("음","어")과 반복은 빼되 내용은 요약하지 말고 그대로. 화자는 [리더]/[구성원]으로 구분' },
    { name: 'SUMMARY', description: '면담 핵심 요약 3~6문장 (무슨 이야기를 했고, 구성원의 상태가 어떤지)' },
    { name: 'GOAL_PROFESSIONAL', description: '대화에서 나온 직업적 목표. 없으면 "없음"' },
    { name: 'GOAL_PERSONAL', description: '대화에서 나온 개인적 목표. 없으면 "없음"' },
    { name: 'SCORES', description: '한 줄 JSON: {"mental":0~10,"physical":0~10,"leader_support":0~10,"popularity":0~10}. 대화에서 판단할 근거가 없는 항목은 null' },
    { name: 'RISK_FLAGS', description: '이탈·번아웃·불만 신호 키워드를 한 줄에 하나씩 (예: 급여 불만, 체력 저하). 없으면 "없음"' },
  ];
  const instruction = [
    `다음은 미용실 리더(원장)가 구성원 "${subjectName}"과 나눈 개인면담 녹음이다.`,
    '한국어로 분석하라. 점수는 구성원의 발언 내용·말투에서 근거를 찾아 보수적으로 제안하라.',
    '- mental: 현재 정신(마음) 상태 / physical: 몸 상태 / leader_support: 리더에 대한 지지·신뢰 / popularity: 매장 내 관계·인기',
    buildDelimitedInstruction(sections),
  ].join('\n');

  // 오디오 파트: 인라인(기본) / 15MB 초과 시 Files API 업로드로 우회
  let audioPart: object = { inlineData: { mimeType, data: base64Audio } };
  const approxBytes = Math.floor(base64Audio.length * 0.75);
  if (approxBytes > INLINE_AUDIO_LIMIT_BYTES) {
    const [{ GoogleAIFileManager, FileState }, fs, os, path] = await Promise.all([
      import('@google/generative-ai/server'),
      import('fs/promises'),
      import('os'),
      import('path'),
    ]);
    const fm = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'webm';
    const tmp = path.join(os.tmpdir(), `interview-${Date.now()}.${ext}`);
    try {
      await fs.writeFile(tmp, Buffer.from(base64Audio, 'base64'));
      const up = await fm.uploadFile(tmp, { mimeType });
      let file = up.file;
      for (let i = 0; file.state === FileState.PROCESSING && i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        file = await fm.getFile(file.name);
      }
      if (file.state !== FileState.ACTIVE) throw new Error('오디오 파일 처리에 실패했어요');
      audioPart = { fileData: { mimeType, fileUri: file.uri } };
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }

  const required = sections.filter((s) => s.required !== false).map((s) => s.name);
  const attempt = async (): Promise<{ map: Map<string, string>; missing: string[] }> => {
    let result;
    try {
      result = await model.generateContent([{ text: instruction }, audioPart as never]);
    } catch (e) {
      throw toFriendlyAIError(e);
    }
    assertNotTruncated(result.response.candidates?.[0]?.finishReason);
    const text = result.response.text();
    let map = parseDelimitedSections(text);
    if (map.size === 0) map = jsonFallbackToSections(text) ?? map;
    return { map, missing: required.filter((n) => !map.get(n)) };
  };

  let { map, missing } = await attempt();
  if (missing.length > 0) {
    console.warn('[AI 면담분석] 섹션 누락 → 1회 재시도:', missing.join(', '));
    ({ map, missing } = await attempt());
    if (missing.length > 0) throw new Error(`AI 응답 파싱 실패: ${missing.join(', ')} 섹션이 없어요`);
  }

  const noneToEmpty = (s: string | undefined) => {
    const t = (s ?? '').trim();
    return !t || t === '없음' ? '' : t;
  };
  let scores: InterviewAnalysis['suggestedScores'] = {
    mental: null, physical: null, leader_support: null, popularity: null,
  };
  try {
    const raw = parseJsonResponse<Record<string, unknown>>(map.get('SCORES') || '{}');
    scores = {
      mental: parseScore(raw.mental),
      physical: parseScore(raw.physical),
      leader_support: parseScore(raw.leader_support),
      popularity: parseScore(raw.popularity),
    };
  } catch {
    /* 점수 파싱 실패 시 전부 null — 원장이 슬라이더로 직접 입력 */
  }
  const riskFlags = (map.get('RISK_FLAGS') || '')
    .split('\n')
    .map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter((s) => s && s !== '없음');

  return {
    transcript: map.get('TRANSCRIPT') || '',
    summary: map.get('SUMMARY') || '',
    goalProfessional: noneToEmpty(map.get('GOAL_PROFESSIONAL')),
    goalPersonal: noneToEmpty(map.get('GOAL_PERSONAL')),
    suggestedScores: scores,
    riskFlags,
  };
}

/**
 * Gemini가 json 모드에서도 문자열 리터럴 안에 raw 개행·탭을 그대로 내보내는 경우가 있어
 * (긴 한국어 마크다운에서 빈발) 파싱 전에 이스케이프로 복구한다.
 * 유효한 JSON에는 제어문자가 문자열 안에 올 수 없으므로 이 변환은 정상 응답을 깨지 않는다.
 */
function escapeRawControlCharsInStrings(s: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inStr) {
      if (ch === '"') inStr = true;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      out += ch + (s[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '"') {
      inStr = false;
      out += ch;
      continue;
    }
    const code = s.charCodeAt(i);
    if (code < 32) {
      out += code === 10 ? '\\n' : code === 13 ? '\\r' : code === 9 ? '\\t' : '\\u' + code.toString(16).padStart(4, '0');
      continue;
    }
    out += ch;
  }
  return out;
}

/** ```json ...``` 코드펜스, 없으면 본문에서 첫 균형 잡힌 {…} 객체를 추출 */
export function parseJsonResponse<T>(text: string): T {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const candidate = escapeRawControlCharsInStrings((fence ? fence[1] : text).trim());
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
