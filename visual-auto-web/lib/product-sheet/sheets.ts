import { google } from 'googleapis';
import { productSheetId } from './config';

function getSheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  );
  return google.sheets({ version: 'v4', auth });
}

/** 탭 하나를 문자열 2차원 배열로 읽는다 (표시 문자열 기준 — ₩/쉼표 포맷 그대로 파서가 처리). */
export async function fetchTab(range: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: productSheetId(),
    range,
  });
  return (res.data.values || []).map((row) => row.map((c) => String(c ?? '')));
}
