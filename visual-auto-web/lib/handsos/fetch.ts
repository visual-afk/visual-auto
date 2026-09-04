/**
 * HandSOS report_staffSale_Comp.asp 호출 — python/fetcher.py 이식.
 * 요청 body·응답 모두 EUC-KR.
 */

import iconv from 'iconv-lite';
import { CookieJar, jarFetch } from './auth';
import { URLS } from './config';

/** report_staffSale_Comp.asp — pkStaff 빈값=매장전체, 값=특정 디자이너. EUC-KR HTML 반환. */
export async function fetchStaffSale(
  jar: CookieJar,
  pkCompany: string,
  dateStr: string,
  pkStaff = '',
): Promise<string> {
  const payload =
    `PkCompany=${pkCompany}` +
    `&strDateS=${dateStr}` +
    `&strDateE=${dateStr}` +
    `&pkStaff=${pkStaff}` +
    `&strPriceKind=ALL` +
    `&CntGubun=0` +
    `&nSexYN=all` +
    `&staffStatus=` +
    `&isExcel=`;

  const res = await jarFetch(jar, URLS.REPORT_STAFF_SALE, {
    method: 'POST',
    body: new Uint8Array(iconv.encode(payload, 'euc-kr')),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://www1.handsos.com/',
      Origin: 'https://www1.handsos.com',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from report_staffSale`);

  const buf = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buf, 'euc-kr');
}
