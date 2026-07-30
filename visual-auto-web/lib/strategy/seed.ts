/**
 * 본사전략실 정적 시드 — DB(strategy_areas/strategy_metrics)가 아직 없거나 비어있을 때의 폴백.
 * 마이그레이션 0023의 시드와 내용이 일치한다. 순수 데이터(서버 import 없음)라
 * 서버 페이지와 클라이언트 컴포넌트가 모두 사용한다.
 */

export type AreaType = '순환' | '위성' | '과제';
export type MetricSource = 'live' | 'manual';
export type MetricDirection = '높을수록좋음' | '낮을수록좋음' | '편차축소';

export interface MetricDef {
  key: string;
  name: string;
  unit: string | null;
  direction: MetricDirection;
  source: MetricSource;
  liveKey: string | null;
  seedValue: number | null;
  seedContext: string | null;
  isUnknown: boolean;
}

export interface AreaDef {
  id: string;
  name: string;
  type: AreaType;
  subtitle: string | null;
  ownerName: string | null;
  moneyFormula: string;
  /** 이 영역의 '돈의 공식 현재값' 헤더에 쓸 LIVE 매출 키 (없으면 미표시) */
  headlineLiveKey: string | null;
  metrics: MetricDef[];
}

const m = (
  key: string,
  name: string,
  unit: string | null,
  source: MetricSource,
  opts: Partial<Omit<MetricDef, 'key' | 'name' | 'unit' | 'source'>> = {},
): MetricDef => ({
  key,
  name,
  unit,
  direction: opts.direction ?? '높을수록좋음',
  source,
  liveKey: opts.liveKey ?? null,
  seedValue: opts.seedValue ?? null,
  seedContext: opts.seedContext ?? null,
  isUnknown: opts.isUnknown ?? false,
});

export const AREA_SEED: AreaDef[] = [
  {
    id: 'hq',
    name: '본사',
    type: '순환',
    subtitle: '기준의 엔진',
    ownerName: '하나 실장',
    moneyFormula: '기준 준수율 → 균일함 → 4개 사업부 전체 매출',
    headlineLiveKey: 'company_sales',
    metrics: [
      m('std_sentences', '기준 문장 수', '/30', 'manual', { seedValue: 0, seedContext: 'VG 코드 문서 승격 누적' }),
      m('manual_dist', '매뉴얼 배포율', '%', 'manual', { isUnknown: true }),
      m('feedback_rate', 'Feedback 처리율', '%', 'manual', { isUnknown: true }),
    ],
  },
  {
    id: 'branch',
    name: '지점',
    type: '순환',
    subtitle: '1차 고객',
    ownerName: '박은애 주임',
    moneyFormula: '신규 × 객단가 × 재방 × 8지점',
    headlineLiveKey: 'company_sales',
    metrics: [
      m('revisit_dev', '재방률 편차', '%p', 'live', { liveKey: 'branch_revisit_dev', direction: '편차축소' }),
      m('checklist', '체크리스트 준수율', '%', 'live', { liveKey: 'branch_checklist' }),
      m('review_dev', '리뷰 평점 편차', '점', 'manual', { direction: '편차축소', isUnknown: true, seedContext: '별점 데이터 미수집' }),
    ],
  },
  {
    id: 'customer',
    name: '고객',
    type: '순환',
    subtitle: '살롱 B2C 퍼널',
    ownerName: '김예진 매니저',
    moneyFormula: '노출 × 유입률 × 예약 전환율',
    headlineLiveKey: null,
    metrics: [
      m('exposure', '노출', '회', 'live', { liveKey: 'customer_exposure' }),
      m('inflow', '유입', '회', 'manual', { isUnknown: true, seedContext: '스마트플레이스 유입 수동' }),
      m('booking', '예약 전환', '명', 'live', { liveKey: 'customer_booking' }),
    ],
  },
  {
    id: 'reputation',
    name: '브랜드 평판',
    type: '순환',
    subtitle: '직접 전환 아님',
    ownerName: '김예진 매니저',
    moneyFormula: '리뷰 수 × 평점 × 콘텐츠 노출 → 아카데미 모객 비용 절감',
    headlineLiveKey: null,
    metrics: [
      m('new_reviews', '월 신규 리뷰', '건', 'manual', { isUnknown: true }),
      m('avg_rating', '평균 평점', '점', 'manual', { isUnknown: true, seedContext: '별점 데이터 미수집' }),
      m('salon_via', '살롱 경유 신청 비율', '%', 'manual', { isUnknown: true }),
    ],
  },
  {
    id: 'academy',
    name: '아카데미',
    type: '순환',
    subtitle: '공급자 전환',
    ownerName: '셀린 본부장',
    moneyFormula: '설명회 신청 × 수강 전환율 × 수강료 (+미래 직원)',
    headlineLiveKey: 'academy_sales',
    metrics: [
      m('briefing', '설명회 신청', '건', 'live', { liveKey: 'academy_briefing' }),
      m('enroll_rate', '수강 전환율', '%', 'live', { liveKey: 'academy_enroll_rate' }),
      m('graduates', '수료·배출', '명', 'manual', { isUnknown: true }),
    ],
  },
  {
    id: 'staff',
    name: '좋은 직원',
    type: '순환',
    subtitle: null,
    ownerName: '셀린 본부장',
    moneyFormula: '직원 1명 = 지점 확장·균일함의 원료',
    headlineLiveKey: null,
    metrics: [
      m('produced', '배출 인원', '명', 'manual', { isUnknown: true }),
      m('join_rate', '합류율', '%', 'manual', { isUnknown: true }),
      m('retention6', '6개월 유지율', '%', 'manual', { isUnknown: true }),
    ],
  },
  {
    id: 'trifield',
    name: '타지점',
    type: '위성',
    subtitle: '트리필드 B2B',
    ownerName: '이성연 본부장',
    moneyFormula: '거래처 × 월 발주액 × 재주문율',
    headlineLiveKey: 'trifield_sales',
    metrics: [
      m('clients', '거래처 수', '곳', 'manual', { isUnknown: true }),
      m('reorder', '재주문율', '%', 'manual', { isUnknown: true }),
      m('consults', '전환 상담 수', '건', 'manual', { isUnknown: true }),
    ],
  },
  {
    id: 'nuhye',
    name: '누혜',
    type: '위성',
    subtitle: '일반 고객',
    ownerName: '이성연 본부장',
    moneyFormula: '유입 × 구매 전환율 × 객단가',
    headlineLiveKey: 'nuhye_sales',
    metrics: [
      m('store_inflow', '스토어 유입', '회', 'manual', { isUnknown: true }),
      m('buy_rate', '구매 전환율', '%', 'manual', { isUnknown: true, seedContext: '스토어 전환 추적 미설정' }),
      m('sales_count', '판매 건수', '건', 'live', { liveKey: 'nuhye_orders' }),
    ],
  },
  {
    id: 'anxiety',
    name: '불안·System化',
    type: '과제',
    subtitle: 'System으로 해결 가능한지 파악 필요',
    ownerName: '하나 실장',
    moneyFormula: '불안 1건 해소 = 지점 전환 확률 상승 = 가맹 매출',
    headlineLiveKey: null,
    metrics: [
      m('cases', '불안 사례 수집', '건', 'live', { liveKey: 'anxiety_cases' }),
      m('categorized', '유형 분류 수', '개', 'manual', { isUnknown: true }),
      m('promoted', '매뉴얼 승격 건수', '건', 'live', { liveKey: 'anxiety_promoted' }),
    ],
  },
];

/** 지표 3개를 카드가 아니라 깔때기로 보여주는 영역 (값이 모두 카운트라 퍼널이 성립하는 곳) */
export const FUNNEL_AREAS = new Set<string>(['customer']);

export function areaById(id: string): AreaDef | undefined {
  return AREA_SEED.find((a) => a.id === id);
}
