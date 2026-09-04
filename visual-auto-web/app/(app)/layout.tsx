import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import BottomTabs from '@/components/BottomTabs';
import Watermark from '@/components/Watermark';
import CaptureGuard from '@/components/CaptureGuard';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getMember();
  if (!member) redirect('/login');

  // 워터마크 식별자: 이름 · 지점 · 번호뒷4자리 (캡처물에서 유출자 특정용)
  const last4 = member.phone?.replace(/\D/g, '').slice(-4);
  const identity = [member.displayName, member.branchName, last4]
    .filter(Boolean)
    .join(' · ');

  // 겸직자는 소속 지점을 전부 표시 (예: "강남신사점 · 마곡나루점") — 하나만 보이면 다른 지점 계정이 따로 있는 줄 안다
  const branchLabel = member.branchNames.length > 1 ? member.branchNames.join(' · ') : member.branchName;

  return (
    <div className="flex min-h-dvh">
      {/* 데스크톱: 좌측 사이드바 */}
      <Sidebar displayName={member.displayName} branchName={branchLabel} role={member.role} />

      {/* 본문 — 모바일은 폰 폭, 데스크톱은 넓게 */}
      <main className="flex-1 pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-phone px-5 md:max-w-5xl md:px-10 md:py-8">{children}</div>
      </main>

      {/* 모바일: 하단 탭 */}
      <div className="md:hidden">
        <BottomTabs role={member.role} displayName={member.displayName} branchName={branchLabel} />
      </div>

      {/* 캡처 억제 + 유출 추적 (인증 화면 전체에 적용) */}
      <Watermark identity={identity} />
      <CaptureGuard />
    </div>
  );
}
