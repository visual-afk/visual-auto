import { Lock } from 'lucide-react';
import { getAdminSupabase } from '@/lib/supabase/admin';
import AcceptForm from './AcceptForm';

export const dynamic = 'force-dynamic';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = getAdminSupabase();
  const { data: invite } = await admin
    .from('invites')
    .select('status, expires_at, role, branches(name)')
    .eq('token', token)
    .maybeSingle();

  const branchName = (invite?.branches as any)?.name ?? null;
  const invalid =
    !invite || invite.status === 'accepted' || new Date(invite.expires_at) < new Date();

  if (invalid) {
    return (
      <main className="app-shell flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <Lock size={40} className="text-ink-faint" />
        <h1 className="mt-4 text-lg font-bold">사용할 수 없는 초대예요</h1>
        <p className="mt-2 text-sm text-ink-soft">
          링크가 만료됐거나 이미 가입에 사용됐어요.
          <br />
          원장님께 초대 링크를 다시 받아주세요.
        </p>
      </main>
    );
  }

  return (
    <main className="app-shell flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mb-6">
        <span className="inline-block rounded-full bg-brand-wash px-3 py-1 text-sm font-medium text-brand">
          {branchName}에서 초대했어요
        </span>
        <h1 className="mt-4 text-xl font-bold">거의 다 됐어요</h1>
        <p className="mt-1 text-sm text-ink-soft">이름이랑 비밀번호만 정하면 끝이에요</p>
      </div>
      <AcceptForm token={token} branchName={branchName ?? ''} />
    </main>
  );
}
