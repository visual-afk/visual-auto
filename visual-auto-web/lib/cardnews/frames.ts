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

/** 지점/브랜드의 카드 프레임 — 브랜드 전용 행 → 기본 행 → 하드코딩 폴백 순서. */
export async function getFrameFor(branchId: string): Promise<CardFrame> {
  const admin = getAdminSupabase();
  const { data } = await admin
    .from('card_frames')
    .select('branch_id, mode, tokens')
    .or(`branch_id.eq.${branchId},branch_id.is.null`);
  const rows = data ?? [];
  const own = rows.find((r) => r.branch_id === branchId);
  if (own) return rowToFrame(own);
  const def = rows.find((r) => r.branch_id === null);
  if (def) return rowToFrame(def);
  return FALLBACK;
}
