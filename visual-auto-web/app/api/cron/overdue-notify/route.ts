import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
import { kakaoConfigured } from '@/lib/notifications/kakao';
import { sendOverdueAlimtalk, overdueAlimtalkConfigured } from '@/lib/notifications/overdue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RENOTIFY_DAYS = 3; // 같은 항목 재발송 최소 간격

/**
 * 매일 KST 09:00 (vercel.json cron "0 0 * * *"): 기한 지난 planned 일정의
 * 담당자·원장에게 알림톡 발송. 최근 3일 내 발송된 항목은 건너뛴다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // 템플릿/키 미설정이면 스탬프 없이 skip — 나중에 env 꽂으면 밀린 건 소급 발송된다
  if (!overdueAlimtalkConfigured() || !kakaoConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'alimtalk_not_configured' });
  }

  const admin = getAdminSupabase();
  const today = kstTodayStr();
  const threshold = new Date(Date.now() - RENOTIFY_DAYS * 86400_000).toISOString();

  const { data: rows, error } = await admin
    .from('content_schedule')
    .select('id, branch_id, title, scheduled_date, assignee_id, overdue_notified_at')
    .eq('status', 'planned')
    .lt('scheduled_date', today)
    .or(`overdue_notified_at.is.null,overdue_notified_at.lt.${threshold}`)
    .order('scheduled_date');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = rows ?? [];
  if (items.length === 0) return NextResponse.json({ ok: true, checked: 0, notified: 0, sentMessages: 0 });

  const { data: branches } = await admin.from('branches').select('id, name');
  const branchNames = new Map((branches ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

  const results = await Promise.allSettled(
    items.map((item) => sendOverdueAlimtalk(item, branchNames.get(item.branch_id) ?? null)),
  );
  const notifiedIds: string[] = [];
  let sentMessages = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value > 0) {
      notifiedIds.push(items[i].id);
      sentMessages += r.value;
    }
  });

  if (notifiedIds.length > 0) {
    await admin
      .from('content_schedule')
      .update({ overdue_notified_at: new Date().toISOString() })
      .in('id', notifiedIds);
  }

  console.log(`[overdue-notify] 대상 ${items.length}건 → 알림 ${notifiedIds.length}건 (메시지 ${sentMessages}통)`);
  return NextResponse.json({ ok: true, checked: items.length, notified: notifiedIds.length, sentMessages });
}
