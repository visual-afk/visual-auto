/**
 * 본사전략실 팔레트 — 앱 전역 라이트 테마(웜화이트+콘플라워블루)에 맞춘다.
 * tailwind.config.ts 토큰(canvas/surface/ink/brand/ok/warn/line)과 동일 계열. 한 곳에서 관리.
 */
export const C = {
  bg: '#f7f6f4', // canvas — 섹션 배경
  panel: '#ffffff', // surface — 패널/상세 카드
  card: '#f4f2ee', // 지표 카드(살짝 톤 다운)
  cardBorder: '#e8e6e1', // line
  line: '#e8e6e1',
  node: '#eceae5', // 구조도 원
  nodeStrong: '#e0ddd6',
  text: '#1d1d22', // ink
  textDim: '#5b5b63', // ink-soft
  textFaint: '#9a9aa2', // ink-faint
  accent: '#5b7fd4', // brand — 강조(돈의공식·선택)
  accentSoft: '#eef2fb', // brand-wash
  cycle: '#d9663d', // 순환강조(주황 고리)
  supply: '#b0aca4', // 공급선(회색)
  warn: '#c98a2b', // 주의
  danger: '#c0392b', // 경고/문제/불안
  dangerBg: '#fbece9', // 연한 빨강 배경
  good: '#3f9d6a', // ok — 양호
  unknown: '#9a9aa2', // 미확보
  funnel: '#dbe6fb', // 퍼널 채움(연한 블루)
  funnelEdge: '#8aa9e6',
  goodBg: '#e6f4ea', // 확인 지표/승격 pill 배경
  pillWarm: '#f2e6d3', // "직원 제공" 등 강조 라벨 pill 배경
} as const;

/** 상태 → 색 (색점·배지) */
export const STATUS_COLOR: Record<'양호' | '주의' | '미확보', string> = {
  양호: C.good,
  주의: C.warn,
  미확보: C.unknown,
};
