import type { Role } from './roles';

/**
 * 카드뉴스 생성 권한 — 기본은 본사만.
 * NEXT_PUBLIC_CARDNEWS_INFO_ALL=1 이면 정보형(글→슬라이드)을 전 직원에게 연다
 * (디자이너가 지점 블로그 글로 카드 만드는 것). 이미지형은 항상 본사만.
 */
export function canMakeCardNews(role: Role, mode: 'info' | 'image'): boolean {
  if (role === 'hq_admin') return true;
  return mode === 'info' && process.env.NEXT_PUBLIC_CARDNEWS_INFO_ALL === '1';
}
