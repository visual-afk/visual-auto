import { getAdminSupabase } from '@/lib/supabase/admin';
import { resolveRange, type PeriodType } from '@/lib/metrics';

/** 이름 뒤 2글자 키 — 하주희 → 주희. 같은 지점 안에서 HandSOS 이름 ↔ 앱 계정 매칭용 */
const nameKey = (name: string) => (name || '').replace(/\s/g, '').slice(-2);

/** 만원 컴팩트 표기 */
const manwon = (won: number) => (won >= 10000 ? `${Math.round(won / 10000).toLocaleString()}만` : `${won.toLocaleString()}원`);

type Row = {
  key: string;
  name: string;
  sales: number;
  guestCount: number;
  posts: number;
  views: number;
  hasSales: boolean;
};

export default async function DesignerBreakdown({
  branchId,
  period,
  refDate,
}: {
  branchId: string;
  period: PeriodType;
  /** 기준일(YYYY-MM-DD) — 성과 페이지 기간 선택과 동기화 */
  refDate?: string;
}) {
  const admin = getAdminSupabase();
  const range = resolveRange(period, refDate);
  const [{ data: membersData }, { data: dmetrics }, { data: postsData }, { data: reelsData }] = await Promise.all([
    admin
      .from('branch_users')
      .select('user_id, display_name, role, is_active')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .neq('role', 'hq_admin'),
    admin
      .from('metrics_daily')
      .select('designer_name, new_sales, repeat_sales, guest_count')
      .eq('branch_id', branchId)
      .eq('scope', 'designer')
      .gte('date', range.start)
      .lte('date', range.end),
    admin
      .from('posts')
      .select('author_id, views, created_at')
      .eq('branch_id', branchId)
      .gte('created_at', range.start)
      .lte('created_at', range.end + 'T23:59:59'),
    admin
      .from('reels')
      .select('author_id, views, created_at')
      .eq('branch_id', branchId)
      .gte('created_at', range.start)
      .lte('created_at', range.end + 'T23:59:59'),
  ]);

  const members = (membersData ?? []) as { user_id: string; display_name: string; role: string }[];

  // 뒤 2글자 키 → 행 (앱 계정 우선 등록: 계정 이름을 표시)
  const rows = new Map<string, Row>();
  const userKey = new Map<string, string>(); // user_id → nameKey
  for (const m of members) {
    const k = nameKey(m.display_name);
    if (!k) continue;
    userKey.set(m.user_id, k);
    if (!rows.has(k)) rows.set(k, { key: k, name: m.display_name, sales: 0, guestCount: 0, posts: 0, views: 0, hasSales: false });
  }

  // HandSOS 디자이너 매출/접객 (뒤 2글자 매칭, 계정 없으면 크롤 이름으로 신규 행)
  for (const d of dmetrics ?? []) {
    const k = nameKey(d.designer_name);
    if (!k) continue;
    const row = rows.get(k) ?? { key: k, name: d.designer_name, sales: 0, guestCount: 0, posts: 0, views: 0, hasSales: false };
    row.sales += (d.new_sales || 0) + (d.repeat_sales || 0);
    row.guestCount += d.guest_count || 0;
    row.hasSales = true;
    rows.set(k, row);
  }

  // 글·릴스 (author_id → nameKey)
  for (const p of postsData ?? []) {
    const k = userKey.get(p.author_id);
    if (!k) continue;
    const row = rows.get(k)!;
    row.posts += 1;
    row.views += p.views || 0;
  }
  for (const r of reelsData ?? []) {
    const k = userKey.get(r.author_id);
    if (!k) continue;
    const row = rows.get(k)!;
    row.views += r.views || 0;
  }

  const list = [...rows.values()].sort((a, b) => b.sales - a.sales || b.views - a.views);
  if (list.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">디자이너별</h2>
      <div className="overflow-hidden rounded-xl2 border border-line bg-surface">
        <div className="grid grid-cols-[1fr_5rem_3.5rem_3rem_5rem] gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint">
          <span>디자이너</span>
          <span className="text-right">매출</span>
          <span className="text-right">접객</span>
          <span className="text-right">글</span>
          <span className="text-right">조회수</span>
        </div>
        <ul className="divide-y divide-line">
          {list.map((r) => (
            <li key={r.key} className="grid grid-cols-[1fr_5rem_3.5rem_3rem_5rem] items-center gap-2 px-4 py-3.5">
              <span className="truncate font-semibold">{r.name}</span>
              <span className="text-right text-sm font-bold text-brand">{r.hasSales ? manwon(r.sales) : '—'}</span>
              <span className="text-right text-sm text-ink-soft">{r.hasSales ? r.guestCount.toLocaleString() : '—'}</span>
              <span className="text-right text-sm text-ink-soft">{r.posts}</span>
              <span className="text-right text-sm text-ink-soft">{r.views.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        매출·접객은 HandSOS 디자이너별 집계, 글·조회수는 앱 기록이에요. 이름 뒤 2글자로 매칭돼요.
      </p>
    </div>
  );
}
