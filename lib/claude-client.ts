import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { config } from './config.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey!);

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

/** knowledge/ 폴더의 모든 .md 파일을 읽어서 하나의 문자열로 합침 */
export function loadKnowledge(): string {
  const knowledgeDir = join(PROJECT_ROOT, 'knowledge');
  const files = collectMdFiles(knowledgeDir);

  return files
    .map(f => {
      const relativePath = f.replace(PROJECT_ROOT + '/', '');
      const content = readFileSync(f, 'utf-8').trim();
      // placeholder만 있는 파일은 스킵
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

/** 특정 지점의 knowledge만 로딩 (branch-{지점}.md + keywords-{지점}.md) */
export function loadBranchKnowledge(branch: string): string {
  if (!branch) return '';

  const knowledgeDir = join(PROJECT_ROOT, 'knowledge');
  const files = collectMdFiles(knowledgeDir)
    .filter(f => f.includes(`branch-${branch}`) || f.includes(`keywords-${branch}`));

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

/** Gemini API 호출 */
export async function callClaude(options: {
  system: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const model = genAI.getGenerativeModel({
    model: options.model || 'gemini-2.5-pro',
    systemInstruction: options.system,
    generationConfig: {
      maxOutputTokens: options.maxTokens || 65536,
      temperature: options.temperature ?? 0.7,
      responseMimeType: 'application/json',
    },
  });

  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(options.userMessage);
      const response = result.response;
      const text = response.text();
      const usage = response.usageMetadata;

      return {
        text,
        inputTokens: usage?.promptTokenCount || 0,
        outputTokens: usage?.candidatesTokenCount || 0,
      };
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt < maxRetries && (msg.includes('503') || msg.includes('429'))) {
        const wait = attempt * 15;
        console.log(`  ⏳ 서버 혼잡, ${wait}초 후 재시도 (${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('최대 재시도 횟수 초과');
}

/** JSON 응답 파싱 (코드블록 내부의 JSON 추출) */
export function parseJsonResponse<T>(text: string): T {
  // ```json ... ``` 블록 추출
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  let jsonStr = jsonMatch ? jsonMatch[1] : text;

  try {
    return JSON.parse(jsonStr.trim());
  } catch {
    // Gemini 출력에서 각 필드를 개별 추출
    const titleMatch = jsonStr.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const metaMatch = jsonStr.match(/"meta_description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const tagsMatch = jsonStr.match(/"tags"\s*:\s*(\[[\s\S]*?\])\s*,?\s*"content"/);
    const contentStart = jsonStr.indexOf('"content"');

    if (titleMatch && contentStart !== -1) {
      // content 필드의 값을 시작 따옴표부터 끝까지 추출
      const afterContent = jsonStr.slice(contentStart);
      const colonPos = afterContent.indexOf(':');
      const valueStr = afterContent.slice(colonPos + 1).trim();

      // 첫 번째 따옴표 찾기
      const firstQuote = valueStr.indexOf('"');
      let content = valueStr.slice(firstQuote + 1);
      // 마지막 닫는 패턴 찾기 (", "image 또는 "} 끝)
      const endPatterns = [/",\s*"image_suggestions"/, /"\s*,\s*"image/, /"\s*\}\s*$/];
      for (const pattern of endPatterns) {
        const endMatch = content.match(pattern);
        if (endMatch && endMatch.index) {
          content = content.slice(0, endMatch.index);
          break;
        }
      }

      let tags: string[] = [];
      if (tagsMatch) {
        try { tags = JSON.parse(tagsMatch[1]); } catch { tags = []; }
      }

      const imgMatch = jsonStr.match(/"image_suggestions"\s*:\s*(\[[\s\S]*?\])/);
      let images: string[] = [];
      if (imgMatch) {
        try { images = JSON.parse(imgMatch[1]); } catch { images = []; }
      }

      return {
        title: titleMatch[1],
        meta_description: metaMatch ? metaMatch[1] : '',
        tags,
        content: content.replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        image_suggestions: images,
      } as T;
    }

    throw new Error(`JSON 파싱 실패\n원문: ${text.slice(0, 500)}`);
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
