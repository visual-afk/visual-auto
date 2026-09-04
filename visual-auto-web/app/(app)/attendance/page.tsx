import { getMember } from '@/lib/auth';
import AttendanceView from '@/components/AttendanceView';

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const member = (await getMember())!;

  // 역할별 가시 범위 — 본사: 전체/지점, 점장: 지점/본인, 디자이너: 본인
  let scopes: ('me' | 'team' | 'all')[];
  let defaultScope: 'me' | 'team' | 'all';
  if (member.role === 'hq_admin') {
    scopes = ['all', 'team'];
    defaultScope = 'all';
  } else if (member.role === 'branch_owner') {
    scopes = ['team', 'me'];
    defaultScope = 'team';
  } else {
    scopes = ['me'];
    defaultScope = 'me';
  }
  const canSeePhoto = member.role === 'hq_admin' || member.role === 'branch_owner';

  return (
    <div className="py-6 md:py-0">
      <h1 className="text-2xl font-bold">출근 현황</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {member.role === 'designer' || member.role === 'intern'
          ? '내 출근·외출·퇴근 기록이에요.'
          : '직원들의 출근 상태를 확인하고 기록을 내려받을 수 있어요.'}
      </p>

      <AttendanceView
        scopes={scopes}
        defaultScope={defaultScope}
        canSeePhoto={canSeePhoto}
        canExport={canSeePhoto}
      />
    </div>
  );
}
