/**
 * (임시 조사용) HandSOS 계정에 등록된 지점(PkCompany) 목록 발견.
 * 실행: HANDSOS_PW=... tsx scripts/discover-handsos-branches.ts
 */
import iconv from 'iconv-lite';
import { login, jarFetch, type CookieJar } from '../lib/handsos/auth';
import { URLS } from '../lib/handsos/config';

async function fetchEucKr(jar: CookieJar, url: string, init: RequestInit = {}): Promise<string> {
  const res = await jarFetch(jar, url, init);
  const buf = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buf, 'euc-kr');
}

function extractCompanyOptions(html: string): { pk: string; name: string }[] {
  const out: { pk: string; name: string }[] = [];
  // <select name="PkCompany"...> 또는 <select id="PkCompany"...> 내부 option 파싱
  const selects = html.match(/<select[^>]*(PkCompany|pkCompany|Company)[^>]*>[\s\S]*?<\/select>/gi) || [];
  for (const sel of selects) {
    const opts = sel.match(/<option[^>]*value=["']?(\d{6,})["']?[^>]*>([^<]*)/gi) || [];
    for (const o of opts) {
      const m = o.match(/value=["']?(\d{6,})["']?[^>]*>([^<]*)/i);
      if (m) out.push({ pk: m[1], name: m[2].trim() });
    }
  }
  return out;
}

async function main() {
  const jar = await login();
  console.log('로그인 OK, 쿠키:', jar.names().join(', '));

  // 1) 리포트 페이지 GET — 지점 선택 select가 있는지
  const reportHtml = await fetchEucKr(jar, URLS.REPORT_STAFF_SALE, {
    headers: { Referer: 'https://www1.handsos.com/' },
  });
  console.log('\n=== report_staffSale_Comp.asp GET (length', reportHtml.length, ') ===');
  const opts1 = extractCompanyOptions(reportHtml);
  if (opts1.length) console.log(opts1);

  // select 없더라도 지점명 키워드 주변 덤프
  for (const kw of ['방배', '전포', '서면', '부천', '신중동', 'PkCompany']) {
    const idx = reportHtml.indexOf(kw);
    if (idx >= 0) console.log(`\n[${kw}] 발견 @${idx}:`, reportHtml.slice(Math.max(0, idx - 200), idx + 200).replace(/\s+/g, ' '));
  }

  // 2) 지점 select가 흔히 있는 공통 프레임/메인 페이지 후보들
  const candidates = [
    'https://www1.handsos.com/work/main.asp',
    'https://www1.handsos.com/work/top.asp',
    'https://www1.handsos.com/work/detail/report/report_main.asp',
    'https://www.handsos.com/main/main.asp',
  ];
  for (const url of candidates) {
    try {
      const html = await fetchEucKr(jar, url);
      const opts = extractCompanyOptions(html);
      const hits = ['방배', '전포', '서면', '부천'].filter((k) => html.includes(k));
      console.log(`\n=== ${url} (length ${html.length}) select옵션 ${opts.length}개, 키워드 ${hits.join(',') || '없음'}`);
      if (opts.length) console.log(opts);
      for (const kw of hits) {
        const idx = html.indexOf(kw);
        console.log(`[${kw}] @${idx}:`, html.slice(Math.max(0, idx - 300), idx + 150).replace(/\s+/g, ' '));
      }
    } catch (e) {
      console.log(`\n=== ${url} 실패: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error('❌', (e as Error).message);
  process.exit(1);
});
