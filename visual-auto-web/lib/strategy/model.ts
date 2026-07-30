/**
 * 본사전략실 뷰 모델 — 서버 페이지가 조립해 클라이언트로 넘기는 plain 타입 + 상태 판정.
 * 상태는 MVP 2단계(양호/미확보) + 실험 기한 초과 시 주의.
 */

import type { AreaType, MetricSource, MetricDirection } from '@/lib/strategy/seed';

export type Status = '양호' | '주의' | '미확보';
export type ExpStatus = '설계중' | '진행중' | '결과대기' | '완료';

export interface ResolvedMetric {
  id: string; // DB uuid 또는 `${areaId}:${key}` 합성 id
  areaId: string;
  key: string;
  name: string;
  unit: string | null;
  direction: MetricDirection;
  source: MetricSource;
  isUnknown: boolean;
  value: number | null;
  /** 카드에 표시할 문자열 (숫자 포맷 완료). null이면 '?' */
  display: string | null;
  deltaPct: number | null;
  context: string | null;
  status: Status;
}

export interface CauseCandidate {
  id: string;
  text: string;
  approved: boolean;
}

export interface Experiment {
  id: string;
  areaId: string;
  phenomenon: string | null;
  hypothesis: string | null;
  prediction: string | null;
  action: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  checkMetricId: string | null;
  checkMetricName: string | null;
  status: ExpStatus;
  resultValue: string | null;
  resultNote: string | null;
  learned: string | null;
  promotion: '승격' | '보류' | '기각' | null;
  overdue: boolean;
}

export interface ResolvedArea {
  id: string;
  name: string;
  type: AreaType;
  subtitle: string | null;
  ownerName: string | null;
  moneyFormula: string;
  headline: { display: string; deltaPct: number | null; context: string | null } | null;
  currentProblem: string | null;
  causeNote: string | null;
  decideNext: string | null;
  metrics: ResolvedMetric[];
  causeCandidates: CauseCandidate[];
  activeExperiment: Experiment | null;
  isFunnel: boolean;
  status: Status;
  dataDate: string | null;
}

export interface MeetingSummary {
  id: string;
  meetingDate: string;
  attendees: string[];
  minutes: Record<string, unknown>;
  createdAt: string;
}

const RANK: Record<Status, number> = { 미확보: 3, 주의: 2, 양호: 1 };

/** 지표 상태: 값 없거나 미확보면 미확보, 아니면 양호 (임계치는 V1.1) */
export function metricStatus(value: number | null, isUnknown: boolean): Status {
  if (isUnknown || value == null) return '미확보';
  return '양호';
}

/** 영역 상태: 지표 중 가장 나쁜 상태. 활성 실험이 기한 초과면 최소 '주의'. */
export function areaStatus(metrics: ResolvedMetric[], hasOverdueExp: boolean): Status {
  let worst: Status = '양호';
  for (const mt of metrics) if (RANK[mt.status] > RANK[worst]) worst = mt.status;
  if (hasOverdueExp && RANK['주의'] > RANK[worst]) worst = '주의';
  return worst;
}

/** 첫 진입 자동 선택: 상태 나쁜 순 (미확보 > 주의 > 양호) */
export function worstAreaId(areas: ResolvedArea[]): string {
  const sorted = [...areas].sort((a, b) => RANK[b.status] - RANK[a.status]);
  return sorted[0]?.id ?? 'hq';
}
