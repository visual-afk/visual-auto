/**
 * 본사전략실 전용 다크 팔레트. (참고 시안 기준 — Premium Black 계열)
 * 앱 전역은 라이트 테마라, 이 섹션만 자체 색을 쓴다. 한 곳에서 관리.
 */
export const C = {
  bg: '#1c1917', // 워밍 near-black 배경
  panel: '#26221f', // 패널/상세 카드
  card: '#2c2723', // 지표 카드
  cardBorder: '#3a352f',
  line: '#3a352f',
  node: '#3f3a35', // 구조도 원
  nodeStrong: '#4a443d',
  text: '#ece7e0',
  textDim: '#9a938a',
  textFaint: '#6f6860',
  accent: '#6f97e0', // 강조(돈의공식·선택) — 앱 brand 계열
  accentSoft: '#2b3a55',
  cycle: '#d9663d', // 순환강조(주황 고리)
  supply: '#8a827a', // 공급선(회색)
  warn: '#c98a2b', // 주의
  danger: '#b0413a', // 경고/문제/불안
  dangerBg: '#3a1f1c',
  good: '#4f9d6a', // 양호
  unknown: '#6f6860', // 미확보
  funnel: '#1b3552', // 퍼널 채움(다크 블루)
  funnelEdge: '#2a4d73',
} as const;

/** 상태 → 색 (색점·배지) */
export const STATUS_COLOR: Record<'양호' | '주의' | '미확보', string> = {
  양호: C.good,
  주의: C.warn,
  미확보: C.unknown,
};
