import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. .env 파일을 확인하세요.`);
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

export const config = {
  google: {
    serviceAccountEmail: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    privateKey: requireEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    sheetId: requireEnv('GOOGLE_SHEET_ID'),
    calendarId: requireEnv('GOOGLE_CALENDAR_ID'),
    docsFolderId: requireEnv('GOOGLE_DOCS_FOLDER_ID'),
  },
  ga4: {
    propertyId: optionalEnv('GA4_PROPERTY_ID'),
  },
  gemini: {
    apiKey: optionalEnv('GEMINI_API_KEY'),
  },
} as const;

// 구글시트 컬럼 매핑 (0-indexed)
export const SHEET_COLUMNS = {
  MONTH: 0,
  WEEK: 1,
  TOPIC: 2,
  KEYWORDS: 3,
  POST_TYPE: 4,
  STATUS: 5,
  SCHEDULED_DATE: 6,
  GENERATED_AT: 7,
  DOC_URL: 8,
  IMWEB_URL: 9,
  NAVER_URL: 10,
  VIEWS: 11,
  CONVERSIONS: 12,
  FUNNEL: 13,
  BRAIN_FOCUS: 14,
  TARGET_PERSONA: 15,
  CONTENT_PURPOSE: 16,
  BRANCH: 17,
} as const;

export const SHEET_RANGE = '시트1!A2:R'; // 헤더 제외, A~R 컬럼 (지점 추가)

export const POST_STATUSES = {
  PLANNED: 'planned',
  GENERATING: 'generating',
  DRAFT_READY: 'draft_ready',
  REVIEWING: 'reviewing',
  PUBLISHED: 'published',
  TRACKING: 'tracking',
} as const;
