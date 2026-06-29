import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import BottomTabs from '@/components/BottomTabs';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getMember();
  if (!member) redirect('/login');

  return (
    <div className="flex min-h-dvh">
      {/* 데스크톱: 좌측 사이드바 */}
      <Sidebar displayName={member.displayName} branchName={member.branchName} role={member.role} />

      {/* 본문 — 모바일은 폰 폭, 데스크톱은 넓게 */}
      <main className="flex-1 pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-phone px-5 md:max-w-5xl md:px-10 md:py-8">{children}</div>
      </main>

      {/* 모바일: 하단 탭 */}
      <div className="md:hidden">
        <BottomTabs role={member.role} />
      </div>
    </div>
  );
}
