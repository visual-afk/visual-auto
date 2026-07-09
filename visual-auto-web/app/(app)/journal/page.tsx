import { redirect } from 'next/navigation';
import { getMember, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import JournalStudio from '@/components/journal/JournalStudio';

export const dynamic = 'force-dynamic';

/** 업무일지·오픈체크 — 원장의 데일리 리듬 화면 (원장·본사 전용) */
export default async function JournalPage() {
  const member = (await getMember())!;
  if (!canManage(member.role)) redirect('/');

  // 지점 선택지: 본사 = 전체, 원장 = 소속 지점(들)
  const admin = getAdminSupabase();
  let q = admin.from('branches').select('id, name').order('name');
  if (member.role !== 'hq_admin') {
    q = q.in('id', member.branchIds.length > 0 ? member.branchIds : ['00000000-0000-0000-0000-000000000000']);
  }
  const { data: branches } = await q;

  return (
    <div className="py-6 md:py-0">
      <h1 className="text-2xl font-bold">업무일지·오픈체크</h1>
      <p className="mt-1 text-sm text-ink-soft">
        매장 열 때 체크하고, 오늘 원장으로서 한 일을 짧게 남겨요. 말로 남기면 AI가 받아써요.
      </p>
      <JournalStudio
        branches={branches ?? []}
        defaultBranchId={member.branchId ?? branches?.[0]?.id ?? null}
      />
    </div>
  );
}
