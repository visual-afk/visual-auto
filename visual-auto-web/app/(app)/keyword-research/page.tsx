import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import KeywordResearch, { type KeywordSet } from '@/components/KeywordResearch';

export const dynamic = 'force-dynamic';

export default async function KeywordResearchPage() {
  const me = (await getMember())!;
  if (me.role !== 'hq_admin') redirect('/');

  const { data } = await getAdminSupabase()
    .from('keyword_sets')
    .select('id, branch_id, branch_label, period, rows, source_filename, created_at')
    .order('period', { ascending: false })
    .order('branch_label', { ascending: true });

  // 지점(라벨)별 최신 period 하나만
  const latest = new Map<string, KeywordSet>();
  for (const s of (data ?? []) as KeywordSet[]) {
    if (!latest.has(s.branch_label)) latest.set(s.branch_label, s);
  }

  return (
    <div className="py-6 md:py-0">
      <KeywordResearch initialSets={[...latest.values()]} />
    </div>
  );
}
