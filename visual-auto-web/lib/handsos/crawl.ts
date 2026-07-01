/**
 * HandSOS 크롤 오케스트레이션 — python/main.py crawl_date/crawl_branch 이식.
 * 지점 총합 + 디자이너별을 metrics_daily 에 upsert.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { login, type CookieJar } from './auth';
import { fetchStaffSale } from './fetch';
import { parseStaffSale, parseDesigners } from './parse';
import { HANDSOS_BRANCHES } from './config';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CrawlResult {
  date: string;
  branches: { branch: string; designers: number; ok: boolean; reason?: string }[];
}

/** handsos_pk → branch_id 매핑 (DB) */
async function loadBranchMap(): Promise<Map<string, string>> {
  const { data } = await getAdminSupabase()
    .from('branches')
    .select('id, handsos_pk')
    .not('handsos_pk', 'is', null);
  return new Map((data || []).map((b) => [b.handsos_pk as string, b.id]));
}

/** 파싱 결과가 완전 공백(매출·접객·시술 전부 0)인지 — 로그인 실패/차단 페이지의 신호. */
function isEmptyRow(row: ReturnType<typeof parseStaffSale>): boolean {
  return (
    row.new_sales === 0 &&
    row.repeat_sales === 0 &&
    row.guest_count === 0 &&
    row.avg_price === 0 &&
    row.cut === 0 &&
    row.perm === 0 &&
    row.recovery === 0 &&
    row.clinic === 0 &&
    row.dye === 0 &&
    row.etc === 0
  );
}

/**
 * metrics_daily 에 upsert. 반환값 = 실제 저장 여부.
 * 완전 공백 행은 저장하지 않는다 — HandSOS가 클라우드/차단 IP에 status 200으로
 * 빈 페이지를 줄 때 기존 정상 데이터를 0으로 덮어쓰는 것을 방지한다.
 */
async function upsertRow(
  branchId: string,
  date: string,
  scope: 'branch' | 'designer',
  designerName: string,
  html: string,
): Promise<boolean> {
  const row = parseStaffSale(html);
  if (isEmptyRow(row)) return false;
  await getAdminSupabase()
    .from('metrics_daily')
    .upsert(
      { branch_id: branchId, date, scope, designer_name: designerName, ...row },
      { onConflict: 'branch_id,date,scope,designer_name' },
    );
  return true;
}

/** 하루치 크롤. onlyPk 주면 해당 지점만(대시보드 새로고침용). */
export async function crawlDate(
  date: string,
  opts: { onlyPk?: string; skipDesigners?: boolean; sleepBranches?: number; sleepDesigners?: number; jar?: CookieJar } = {},
): Promise<CrawlResult> {
  const jar = opts.jar ?? (await login());
  const branchMap = await loadBranchMap();
  const result: CrawlResult = { date, branches: [] };

  const pks = opts.onlyPk ? [opts.onlyPk] : Object.keys(HANDSOS_BRANCHES);
  for (const pk of pks) {
    const branchName = HANDSOS_BRANCHES[pk];
    const branchId = branchMap.get(pk);
    if (!branchId) {
      result.branches.push({ branch: branchName ?? pk, designers: 0, ok: false, reason: 'branch_id 미매핑' });
      continue;
    }
    try {
      // 1) 지점 총합
      const totalHtml = await fetchStaffSale(jar, pk, date, '');
      await upsertRow(branchId, date, 'branch', '', totalHtml);

      // 2) 디자이너별 (빠른 새로고침 모드면 생략 — 지점 총합만)
      let count = 0;
      if (!opts.skipDesigners) {
        const designers = parseDesigners(totalHtml);
        for (const d of designers) {
          try {
            const dHtml = await fetchStaffSale(jar, pk, date, d.pk);
            await upsertRow(branchId, date, 'designer', d.name, dHtml);
            count++;
          } catch {
            /* 개별 디자이너 실패는 건너뜀 */
          }
          if (opts.sleepDesigners) await sleep(opts.sleepDesigners);
        }
      }
      result.branches.push({ branch: branchName, designers: count, ok: true });
    } catch (e) {
      result.branches.push({ branch: branchName, designers: 0, ok: false, reason: (e as Error).message });
    }
    if (opts.sleepBranches) await sleep(opts.sleepBranches);
  }
  return result;
}

/** 날짜 범위 백필 (스크립트용) */
export async function crawlRange(start: string, end: string): Promise<CrawlResult[]> {
  const jar = await login();
  const out: CrawlResult[] = [];
  const cur = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (cur <= last) {
    const ds = cur.toISOString().slice(0, 10);
    out.push(await crawlDate(ds, { jar, sleepBranches: 3000, sleepDesigners: 1000 }));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
