/**
 * 제품 브랜드 매출 구글시트 연동 설정.
 * 시트: 제품 마스터 + 아임웹/스마트스토어/개별구매 주문데이터 4탭.
 * 서비스 계정(GOOGLE_SERVICE_ACCOUNT_EMAIL)에 읽기 공유가 되어 있어야 한다.
 */

/** 시트 브랜드명 → DB branches.name (kind='brand'). 여기 없는 브랜드(가맹 등)는 집계에서 제외. */
export const SHEET_BRAND_TO_DB: Record<string, string> = {
  퓨어모션: '누혜',
  트리필드: '트리필드',
  아카데미: '아카데미',
};

export const ORDER_CHANNELS = ['아임웹', '스마트스토어', '개별구매'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

/** 탭 이름 → range. 헤더 행 포함해 읽고 컬럼은 헤더명으로 찾는다(컬럼 순서 변경에 견고). */
export const TAB_RANGES = {
  master: "'제품 마스터'!A1:L",
  아임웹: "'아임웹 주문데이터'!A1:AB",
  스마트스토어: "'스마트스토어 주문데이터'!A1:AB",
  개별구매: "'개별구매 주문데이터'!A1:AB",
} as const;

export function productSheetId(): string {
  return process.env.PRODUCT_SHEET_ID || '';
}

export function isProductSheetConfigured(): boolean {
  return !!(
    process.env.PRODUCT_SHEET_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}
