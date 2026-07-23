import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * '프롬프트 관리' 탭에서 편집 가능한 항목 카탈로그.
 * - 프롬프트: 앱이 실제 로딩하는 것만 (수동 9단계용 01~09, *-stream, review-checklist 제외)
 * - 지식베이스: knowledge/ 하위 모든 .md (README 제외)
 * 파일 내용이 기본값, content_overrides 가 있으면 그걸로 덮어쓴다.
 */

const ROOT = process.cwd();

export type CatalogItem = {
  kind: 'prompt' | 'knowledge';
  slug: string; // prompt: 프롬프트명 / knowledge: knowledge/ 이하 상대경로
  label: string;
  group: string;
};

/** 편집 대상 프롬프트 (slug = prompts/<slug>.md) */
const PROMPTS: { slug: string; label: string }[] = [
  { slug: 'blog-writer', label: '블로그 글쓰기 (초안)' },
  { slug: 'seo-optimizer', label: 'SEO 최적화' },
  { slug: 'review-reply', label: '리뷰 답글' },
  { slug: 'reels-structure', label: '릴스 구성' },
  { slug: 'recommend-topics', label: '주제 추천' },
  { slug: 'reels-analyze', label: '릴스 영상 분석' },
  { slug: 'card-news-info', label: '카드뉴스 구성 (정보형)' },
  { slug: 'card-news-image', label: '카드뉴스 문구·캡션 (이미지형)' },
];

function collectMdSlugs(dir: string, base: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...collectMdSlugs(full, base));
      else if (entry.endsWith('.md') && entry !== 'README.md') out.push(full.replace(base + '/', ''));
    }
  } catch {
    /* 폴더 없음 */
  }
  return out;
}

/** knowledge 파일을 그룹(brand/consumer/seo)별 라벨과 함께 */
function knowledgeGroup(slug: string): string {
  const top = slug.split('/')[0];
  return top === 'brand' ? '브랜드' : top === 'consumer' ? '소비자' : top === 'seo' ? 'SEO' : '지식';
}

/** 편집 가능한 전체 카탈로그(파일 목록 기준). */
export function buildCatalog(): CatalogItem[] {
  const prompts: CatalogItem[] = PROMPTS.map((p) => ({
    kind: 'prompt',
    slug: p.slug,
    label: p.label,
    group: '프롬프트',
  }));
  const knowledgeBase = join(ROOT, 'knowledge');
  const knowledge: CatalogItem[] = collectMdSlugs(knowledgeBase, knowledgeBase)
    .sort()
    .map((slug) => ({ kind: 'knowledge', slug, label: slug, group: `지식·${knowledgeGroup(slug)}` }));
  return [...prompts, ...knowledge];
}

/** slug 가 카탈로그(=실제 파일)에 있는지 검증 (임의 경로 저장 방지). */
export function isValidTarget(kind: string, slug: string): boolean {
  return buildCatalog().some((c) => c.kind === kind && c.slug === slug);
}

/** 항목의 파일 기본값(오버라이드 없을 때 실제 쓰이는 원본). 없으면 빈 문자열. */
export function readFileDefault(kind: 'prompt' | 'knowledge', slug: string): string {
  const path = kind === 'prompt' ? join(ROOT, 'prompts', `${slug}.md`) : join(ROOT, 'knowledge', slug);
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    return '';
  }
}
