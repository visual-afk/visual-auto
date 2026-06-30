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

async function upsertRow(
  branchId: string,
  date: string,
  scope: 'branch' | 'designer',
  designerName: string,
  html: string,
) {
  const row = parseStaffSale(html);
  await getAdminSupabase()
    .from('metrics_daily')
    .upsert(
      { branch_id: branchId, date, scope, designer_name: designerName, ...row },
      { onConflict: 'branch_id,date,scope,designer_name' },
    );
}

/** 하루치 크롤. onlyPk 주면 해당 지점만(대시보드 새로고침용). */
export async function crawlDate(
  date: string,
  opts: { onlyPk?: string; sleepBranches?: number; sleepDesigners?: number; jar?: CookieJar } = {},
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

      // 2) 디자이너별
      const designers = parseDesigners(totalHtml);
      let count = 0;
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
