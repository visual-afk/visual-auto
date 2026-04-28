import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { config } from './config.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

// AI 프로바이더 결정: Gemini 우선, Anthropic 폴백
type Provider = 'gemini' | 'anthropic';

function getProvider(): Provider {
  if (config.gemini.apiKey) return 'gemini';
  if (config.anthropic.apiKey) return 'anthropic';
  throw new Error('GEMINI_API_KEY 또는 ANTHROPIC_API_KEY 중 하나는 설정해야 합니다.');
}

/** knowledge/ 폴더의 모든 .md 파일을 읽어서 하나의 문자열로 합침 */
export function loadKnowledge(): string {
  const knowledgeDir = join(PROJECT_ROOT, 'knowledge');
  const files = collectMdFiles(knowledgeDir);

  return files
    .map(f => {
      const relativePath = f.replace(PROJECT_ROOT + '/', '');
      const content = readFileSync(f, 'utf-8').trim();
      if (content.includes('이 파일을') && content.includes('채워주세요')) return '';
      return `--- ${relativePath} ---\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** 특정 필라의 knowledge만 로딩 */
export function loadKnowledgePillar(pillar: 'seo' | 'brand' | 'consumer'): string {
  const pillarDir = join(PROJECT_ROOT, 'knowledge', pillar);
  const files = collectMdFiles(pillarDir);

  return files
    .map(f => {
      const content = readFileSync(f, 'utf-8').trim();
      if (content.includes('이 파일을') && content.includes('채워주세요')) return '';
      return content;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** prompts/ 폴더에서 특정 프롬프트 파일 읽기 */
export function loadPrompt(name: string): string {
  const promptPath = join(PROJECT_ROOT, 'prompts', `${name}.md`);
  return readFileSync(promptPath, 'utf-8').trim();
}

/** templates/ 폴더에서 특정 템플릿 파일 읽기 */
export function loadTemplate(name: string): string {
  const templatePath = join(PROJECT_ROOT, 'templates', `${name}.md`);
  return readFileSync(templatePath, 'utf-8').trim();
}

/** AI API 호출 (Gemini 우선, Anthropic 폴백) */
export async function callAI(options: {
  system: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number; provider: Provider }> {
  const provider = getProvider();

  if (provider === 'gemini') {
    return callGemini(options);
  } else {
    return callAnthropic(options);
  }
}

async function callGemini(options: {
  system: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number; provider: Provider }> {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey!);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    systemInstruction: options.system,
    generationConfig: {
      maxOutputTokens: options.maxTokens || 65536,
      responseMimeType: 'application/json',
      temperature: options.temperature ?? 0.7,
    },
  });

  const result = await model.generateContent(options.userMessage);
  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;

  return {
    text,
    inputTokens: usage?.promptTokenCount || 0,
    outputTokens: usage?.candidatesTokenCount || 0,
    provider: 'gemini',
  };
}

async function callAnthropic(options: {
  system: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number; provider: Provider }> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey! });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
    system: options.system,
    messages: [{ role: 'user', content: options.userMessage }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const text = textBlock ? textBlock.text : '';

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    provider: 'anthropic',
  };
}

/** JSON 응답 파싱 (코드블록 내부의 JSON 추출) */
export function parseJsonResponse<T>(text: string): T {
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  let jsonStr = jsonMatch ? jsonMatch[1] : text;

  // 1차 시도: 그대로 파싱
  try {
    return JSON.parse(jsonStr.trim());
  } catch {
    // 2차 시도: 제어 문자 제거 후 파싱
    // JSON 문자열 값 안의 실제 줄바꿈/탭/제어문자를 이스케이프 처리
    const cleaned = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return '';
    });
    try {
      return JSON.parse(cleaned.trim());
    } catch {
      // 3차 시도: 필드별 개별 추출 (Gemini 긴 글 대응)
      const titleMatch = jsonStr.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const metaMatch = jsonStr.match(/"meta_description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const tagsMatch = jsonStr.match(/"tags"\s*:\s*(\[[\s\S]*?\])\s*,?\s*"content"/);
      const contentStart = jsonStr.indexOf('"content"');

      if (titleMatch && contentStart !== -1) {
        const afterContent = jsonStr.slice(contentStart);
        const colonPos = afterContent.indexOf(':');
        const valueStr = afterContent.slice(colonPos + 1).trim();
        const firstQuote = valueStr.indexOf('"');
        let content = valueStr.slice(firstQuote + 1);
        const endPatterns = [/",\s*"image_suggestions"/, /"\s*,\s*"image/, /"\s*\}\s*$/];
        for (const pattern of endPatterns) {
          const endMatch = content.match(pattern);
          if (endMatch && endMatch.index) {
            content = content.slice(0, endMatch.index);
            break;
          }
        }

        let tags: string[] = [];
        if (tagsMatch) { try { tags = JSON.parse(tagsMatch[1]); } catch { tags = []; } }

        const imgMatch = jsonStr.match(/"image_suggestions"\s*:\s*(\[[\s\S]*?\])/);
        let images: string[] = [];
        if (imgMatch) { try { images = JSON.parse(imgMatch[1]); } catch { images = []; } }

        return {
          title: titleMatch[1],
          meta_description: metaMatch ? metaMatch[1] : '',
          tags,
          content: content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/[\x00-\x1F\x7F]/g, ''),
          image_suggestions: images,
        } as T;
      }

      throw new Error(`JSON 파싱 실패\n원문: ${text.slice(0, 500)}`);
    }
  }
}

function collectMdFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...collectMdFiles(fullPath));
      } else if (entry.endsWith('.md') && entry !== 'README.md') {
        results.push(fullPath);
      }
    }
  } catch {
    // 디렉토리가 없으면 빈 배열 반환
  }

  return results;
}
