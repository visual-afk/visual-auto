// 카드뉴스 레퍼런스 학습 — 순수 로직 (Vision DNA 다장 취합 → 렌더 토큰 + 에디토리얼).
// erb-wt-analyze/lib/design/customStyleExtract.js 의 취합 로직을 각색해 이식.
// 신규 클러스터링 없음: analyze 라우트가 장별 반환한 DNA/에디토리얼 JSON을 취합만 한다.

// ── 업로드 제약 (erb §4-3) ──
export const MAX_IMAGES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 장당 10MB
export const ACCEPTED_MIME = ['image/jpeg', 'image/png'];
export const UPLOAD_ERROR_MESSAGE = '파일을 다시 올려주세요. 10MB 이하 JPG, PNG만 올릴 수 있어요.';
export const VISION_FAIL_MESSAGE = '이미지에서 스타일을 못 읽었어요. 다른 이미지로 다시 시도해 볼까요?';

export function validateImageFile(file: { type?: string; size?: number } | null): { ok: boolean; error?: string } {
  if (!file) return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  const okType = ACCEPTED_MIME.includes(file.type || '');
  const okSize = typeof file.size === 'number' ? file.size <= MAX_FILE_BYTES : true;
  if (!okType || !okSize) return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  return { ok: true };
}

// ── Vision 반환 형태 ──
export interface ReferenceDna {
  layout?: string;
  style?: {
    bg_primary?: string;
    bg_secondary?: string;
    bg_angle?: number;
    title_color?: string;
    title_size?: string;
    title_weight?: number;
    title_shadow?: boolean;
  };
  decorations?: { type?: string; position?: string; color?: string; size?: string; opacity?: number }[];
  mood?: string;
  description?: string;
}

export interface ReferenceEditorial {
  tone?: string;
  hook_style?: string;
  cta_style?: string;
  sample_phrases?: string[];
}

/** 취합된 렌더 토큰 superset — CardFrameTokens 로 병합됨 (M3). */
export interface StyleDesign {
  bg?: string;
  surface?: string;
  ink?: string;
  point?: string;
  bgAngle?: number;
  titleSize?: string;
  titleWeight?: number;
  titleShadow?: boolean;
  layout?: string;
  mood?: string;
  decorations?: ReferenceDna['decorations'];
}

export interface StyleEditorial {
  tone?: string;
  hook_style?: string;
  cta_style?: string;
  sample_phrases?: string[];
}

// ── 색 헬퍼 (자립형) ──
export function parseHex(input: unknown): [number, number, number] | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function hexStr([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** #hex 또는 rgba(r,g,b,a) → #RRGGBB, 못 읽으면 null. */
export function toHex(color: unknown): string | null {
  if (typeof color !== 'string') return null;
  const parsed = parseHex(color);
  if (parsed) return hexStr(parsed);
  const m = color.trim().match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return hexStr([+m[1], +m[2], +m[3]]);
  return null;
}

function luminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return -1;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function pickDarkest(hexes: string[]): string | null {
  return hexes.reduce<{ hex: string; l: number } | null>((best, cur) => {
    const l = luminance(cur);
    if (l === null) return best;
    return !best || l < best.l ? { hex: cur, l } : best;
  }, null)?.hex ?? null;
}

function pickLightest(hexes: string[]): string | null {
  return hexes.reduce<{ hex: string; l: number } | null>((best, cur) => {
    const l = luminance(cur);
    if (l === null) return best;
    return !best || l > best.l ? { hex: cur, l } : best;
  }, null)?.hex ?? null;
}

function pickMostSaturated(hexes: string[]): string | null {
  return hexes.reduce<{ hex: string; s: number } | null>((best, cur) => {
    const s = saturation(cur);
    return !best || s > best.s ? { hex: cur, s } : best;
  }, null)?.hex ?? null;
}

/** 최빈값 (동률이면 먼저 나온 것). */
export function modeOf<T>(values: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>();
  let bestKey: T | null = null;
  let bestCount = 0;
  for (const v of values) {
    if (v == null) continue;
    const n = (counts.get(v) || 0) + 1;
    counts.set(v, n);
    if (n > bestCount) {
      bestCount = n;
      bestKey = v;
    }
  }
  return bestKey;
}

// ── 취합: 여러 장 DNA → 렌더 토큰 (erb aggregateAnalyses 각색) ──
export function aggregateDesign(dnas: ReferenceDna[]): StyleDesign {
  const list = (Array.isArray(dnas) ? dnas : []).filter((d) => d && typeof d === 'object');
  if (list.length === 0) return {};

  const primaries = list.map((d) => toHex(d.style?.bg_primary)).filter((x): x is string => !!x);
  const secondaries = list.map((d) => toHex(d.style?.bg_secondary)).filter((x): x is string => !!x);
  const titles = list.map((d) => toHex(d.style?.title_color)).filter((x): x is string => !!x);
  const decoColors = list
    .flatMap((d) => (Array.isArray(d.decorations) ? d.decorations.map((x) => toHex(x?.color)) : []))
    .filter((x): x is string => !!x);

  const bg = modeOf(primaries) || pickDarkest(primaries) || undefined;
  const surface = modeOf(secondaries) || pickLightest(secondaries) || undefined;
  const ink = modeOf(titles) || pickDarkest(titles) || undefined;

  const accentCandidates = [...decoColors, ...titles, ...secondaries].filter(
    (c) => c.toLowerCase() !== (bg || '').toLowerCase(),
  );
  const point = pickMostSaturated(accentCandidates) || undefined;

  // 대표 장식: 타입별 첫 등장 + 빈도순 상위 3개.
  const decoByType = new Map<string, NonNullable<ReferenceDna['decorations']>[number]>();
  const decoFreq = new Map<string, number>();
  for (const d of list) {
    for (const deco of d.decorations ?? []) {
      if (!deco?.type) continue;
      decoFreq.set(deco.type, (decoFreq.get(deco.type) || 0) + 1);
      if (!decoByType.has(deco.type)) decoByType.set(deco.type, deco);
    }
  }
  const decorations = [...decoByType.keys()]
    .sort((a, b) => (decoFreq.get(b) || 0) - (decoFreq.get(a) || 0))
    .slice(0, 3)
    .map((t) => decoByType.get(t)!);

  const boolMode = (vals: (boolean | undefined)[]) => {
    const t = vals.filter((v) => v === true).length;
    const f = vals.filter((v) => v === false).length;
    return t + f === 0 ? undefined : t >= f;
  };

  return {
    bg,
    surface,
    ink,
    point,
    bgAngle: modeOf(list.map((d) => d.style?.bg_angle).filter((n): n is number => typeof n === 'number')) ?? undefined,
    titleSize: modeOf(list.map((d) => d.style?.title_size)) ?? undefined,
    titleWeight: modeOf(list.map((d) => d.style?.title_weight).filter((n): n is number => typeof n === 'number')) ?? undefined,
    titleShadow: boolMode(list.map((d) => d.style?.title_shadow)),
    layout: modeOf(list.map((d) => d.layout)) ?? undefined,
    mood: modeOf(list.map((d) => d.mood)) ?? undefined,
    decorations: decorations.length ? decorations : undefined,
  };
}

// ── 취합: 에디토리얼 ──
export function aggregateEditorial(items: ReferenceEditorial[]): StyleEditorial {
  const list = (Array.isArray(items) ? items : []).filter((e) => e && typeof e === 'object');
  if (list.length === 0) return {};
  const phrases = Array.from(
    new Set(list.flatMap((e) => (Array.isArray(e.sample_phrases) ? e.sample_phrases : [])).map((p) => String(p).trim()).filter(Boolean)),
  ).slice(0, 12);
  return {
    tone: modeOf(list.map((e) => e.tone)) ?? undefined,
    hook_style: modeOf(list.map((e) => e.hook_style)) ?? undefined,
    cta_style: modeOf(list.map((e) => e.cta_style)) ?? undefined,
    sample_phrases: phrases.length ? phrases : undefined,
  };
}

/** 에디토리얼 프로필 → 생성 프롬프트에 붙일 한국어 가이드 텍스트 (없으면 ''). */
export function editorialToPromptText(e: StyleEditorial | null | undefined): string {
  if (!e) return '';
  const lines: string[] = [];
  if (e.tone) lines.push(`- 톤: ${e.tone}`);
  if (e.hook_style) lines.push(`- 훅 방식: ${e.hook_style}`);
  if (e.cta_style) lines.push(`- CTA 방식: ${e.cta_style}`);
  if (e.sample_phrases?.length) lines.push(`- 참고 문구 예시: ${e.sample_phrases.join(' / ')}`);
  return lines.join('\n');
}
