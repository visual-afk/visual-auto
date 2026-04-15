import { getSheets } from './google-auth.js';
import { config, SHEET_COLUMNS, SHEET_RANGE } from './config.js';
import type { SheetRow, PostStatus, PostType, FunnelStage, BrainFocus } from './types.js';

function parseRow(values: string[], index: number): SheetRow {
  return {
    rowIndex: index + 2, // 시트 행 번호 (1-indexed, 헤더가 1행)
    month: values[SHEET_COLUMNS.MONTH] || '',
    week: values[SHEET_COLUMNS.WEEK] || '',
    topic: values[SHEET_COLUMNS.TOPIC] || '',
    keywords: values[SHEET_COLUMNS.KEYWORDS] || '',
    postType: (values[SHEET_COLUMNS.POST_TYPE] || '정보형') as PostType,
    status: (values[SHEET_COLUMNS.STATUS] || 'planned') as PostStatus,
    scheduledDate: values[SHEET_COLUMNS.SCHEDULED_DATE] || '',
    generatedAt: values[SHEET_COLUMNS.GENERATED_AT] || '',
    docUrl: values[SHEET_COLUMNS.DOC_URL] || '',
    imwebUrl: values[SHEET_COLUMNS.IMWEB_URL] || '',
    naverUrl: values[SHEET_COLUMNS.NAVER_URL] || '',
    views: values[SHEET_COLUMNS.VIEWS] || '',
    conversions: values[SHEET_COLUMNS.CONVERSIONS] || '',
    funnel: (values[SHEET_COLUMNS.FUNNEL] || '2.검색') as FunnelStage,
    brainFocus: (values[SHEET_COLUMNS.BRAIN_FOCUS] || '뇌1') as BrainFocus,
    targetPersona: values[SHEET_COLUMNS.TARGET_PERSONA] || '',
  };
}

export async function fetchAllRows(): Promise<SheetRow[]> {
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: SHEET_RANGE,
  });

  const rows = response.data.values || [];
  return rows.map((row, i) => parseRow(row, i));
}

export async function fetchPlannedRows(): Promise<SheetRow[]> {
  const rows = await fetchAllRows();
  return rows.filter(r => r.status === 'planned');
}

export async function fetchTodayRows(): Promise<SheetRow[]> {
  const today = new Date().toISOString().split('T')[0];
  const rows = await fetchPlannedRows();
  return rows.filter(r => r.scheduledDate === today);
}

export async function updateCell(row: number, col: number, value: string): Promise<void> {
  const sheets = getSheets();
  const colLetter = String.fromCharCode(65 + col); // A=0, B=1, ...
  const range = `시트1!${colLetter}${row}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

export async function updateStatus(row: number, status: PostStatus): Promise<void> {
  await updateCell(row, SHEET_COLUMNS.STATUS, status);
}

export async function updateDocUrl(row: number, url: string): Promise<void> {
  await updateCell(row, SHEET_COLUMNS.DOC_URL, url);
}

export async function updateGeneratedAt(row: number): Promise<void> {
  await updateCell(row, SHEET_COLUMNS.GENERATED_AT, new Date().toISOString());
}

export async function updateRow(row: number, updates: Partial<Record<keyof typeof SHEET_COLUMNS, string>>): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const col = SHEET_COLUMNS[key as keyof typeof SHEET_COLUMNS];
    if (col !== undefined) {
      promises.push(updateCell(row, col, value));
    }
  }
  await Promise.all(promises);
}
