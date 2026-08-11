import { getAdminSupabase } from '@/lib/supabase/admin';
import type { CardNewsMode } from './cards';

// 브랜드 카드 프레임 토큰 (card_frames 테이블) — 본사가 프롬프트 관리에서 수정

export interface CardFrameTokens {
  bg?: string; // 표지/포인트 배경 (정보형)
  surface?: string; // 포인트 카드 베이스 (정보형)
  ink: string; // 본문 텍스트
  point: string; // 포인트 컬러 (로고·강조)
  logoText: string; // 좌상단 로고 텍스트, 비우면 지점명 사용
  ctaBg?: string; // CTA 카드 배경 (정보형)
  ctaInk?: string; // CTA 카드 텍스트 (정보형)
  // ── 레퍼런스 학습으로 채워지는 선택 토큰 (없으면 현행 고정 렌더로 폴백) ──
  bgAngle?: number; // 표지/CTA 배경 gradient 각도 (bg→surface)
  titleSize?: string; // small | medium | large | xlarge (타이틀 스케일)
  titleWeight?: number; // 타이틀 굵기 (기본 800)
  titleShadow?: boolean; // 타이틀 그림자
  layout?: string; // 레이아웃 힌트 (현재는 저장만, 렌더 재배치는 후속)
  mood?: string; // 무드 태그 (참고용)
  decorations?: { type?: string; position?: string; color?: string; size?: string; opacity?: number }[];
}

export interface CardFrame {
  branchId: string | null; // null = 지점(살롱) 기본 프레임
  mode: CardNewsMode;
  tokens: CardFrameTokens;
}

// 마이그레이션 0020 시드와 동일한 값 — DB가 비어도 동작하게 하는 최후 폴백
const FALLBACK: CardFrame = {
  branchId: null,
  mode: 'info',
  tokens: {
    bg: '#FFFFFF',
    surface: '#EEF2FB',
    ink: '#1D1D22',
    point: '#5B7FD4',
    logoText: '',
    ctaBg: '#1D1D22',
    ctaInk: '#FFFFFF',
  },
};

function rowToFrame(row: { branch_id: string | null; mode: string; tokens: Record<string, string> }): CardFrame {
  return {
    branchId: row.branch_id,
    mode: row.mode === 'image' ? 'image' : 'info',
    tokens: { ...FALLBACK.tokens, ...row.tokens },
  };
}

/**
 * 지점/브랜드의 카드 프레임 — 브랜드 전용 행 → 기본 행 → 하드코딩 폴백 순서.
 * 마지막에 레퍼런스 학습 프로필(card_style_profiles.design)을 병합한다(학습이 디자인을 이끈다).
 */
export async function getFrameFor(branchId: string): Promise<CardFrame> {
  const admin = getAdminSupabase();
  const [{ data }, learned] = await Promise.all([
    admin.from('card_frames').select('branch_id, mode, tokens').or(`branch_id.eq.${branchId},branch_id.is.null`),
    getStyleProfileFor(branchId),
  ]);
  const rows = data ?? [];
  const own = rows.find((r) => r.branch_id === branchId);
  const def = rows.find((r) => r.branch_id === null);
  const frame = own ? rowToFrame(own) : def ? rowToFrame(def) : { ...FALLBACK, tokens: { ...FALLBACK.tokens } };
  if (learned) frame.tokens = { ...frame.tokens, ...learned };
  return frame;
}

/** 레퍼런스 학습 프로필의 design 토큰 (undefined/null 키 제거). 없으면 null. */
async function getStyleProfileFor(branchId: string): Promise<Partial<CardFrameTokens> | null> {
  const admin = getAdminSupabase();
  const { data } = await admin
    .from('card_style_profiles')
    .select('design')
    .eq('branch_id', branchId)
    .maybeSingle();
  const design = (data?.design ?? null) as Record<string, unknown> | null;
  if (!design) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(design)) if (v !== undefined && v !== null) out[k] = v;
  return Object.keys(out).length ? (out as Partial<CardFrameTokens>) : null;
}
