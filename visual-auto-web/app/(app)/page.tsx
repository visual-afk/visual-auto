import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Hand, Eye } from 'lucide-react';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstDayRangeUtc } from '@/lib/kst';
import AttendancePanel from '@/components/AttendancePanel';
import type { AttendanceEventType } from '@/lib/attendance';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const member = (await getMember())!;
  if (member.role === 'hq_admin') redirect('/overview'); // 본사는 전체 현황으로
  const admin = getAdminSupabase();
  const today = kstDayRangeUtc();
  const [{ data: posts }, { data: lastEvent }] = await Promise.all([
    admin
      .from('posts')
      .select('id, title, views, status, published_at, created_at')
      .eq('author_id', member.userId)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('attendance_events')
      .select('event_type')
      .eq('member_id', member.memberId)
      .gte('created_at', today.gte)
      .lt('created_at', today.lt)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const lastToday = (lastEvent?.event_type ?? null) as AttendanceEventType | null;

  return (
    <div className="py-6 md:py-0">
      {/* 인사 — 지점·지역 자동 표시 */}
      <p className="text-sm text-ink-soft">
        {member.branchName}
        {member.region ? ` · ${member.region}` : ''}
      </p>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
        {member.displayName} 디자이너님 <Hand size={22} className="text-brand" />
      </h1>

      {/* 출근 체크 */}
      <div className="mt-6">
        <AttendancePanel lastToday={lastToday} />
      </div>

      {/* 오늘 글쓰기 */}
      <Link
        href="/write"
        className="mt-6 block rounded-xl2 bg-brand p-6 text-brand-ink shadow-card transition active:scale-[0.99]"
      >
        <span className="text-lg font-bold">오늘 글쓰기 →</span>
        <span className="mt-1 block text-sm opacity-90">시술 하나만 골라도 글이 완성돼요</span>
      </Link>

      {/* 지난 글 */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink-soft">지난 글</h2>
      {posts && posts.length > 0 ? (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={p.status === 'published' ? `/track/${p.id}` : `/write?post=${p.id}`}
                className="flex items-center justify-between rounded-xl2 border border-line bg-surface px-4 py-3.5"
              >
                <span className="truncate font-medium">{p.title || '제목 없음'}</span>
                <span className="ml-3 shrink-0 text-sm text-ink-soft">
                  {p.status === 'published' ? (
                    p.views != null ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-brand">
                        <Eye size={14} /> {p.views.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-warn">조회수 입력</span>
                    )
                  ) : (
                    <span className="text-ink-faint">작성 중</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl2 border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">
          아직 쓴 글이 없어요. 위에서 첫 글을 시작해보세요!
        </p>
      )}
    </div>
  );
}
