import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';

/**
 * 지점 운영 리듬 집계 — 본사가 보는 것은 "내용"이 아니라 "리듬"이다.
 * 일지 작성일수 · 오픈체크 수행률 · 구성원별 면담 경과 · 미팅 주기 · 컨디션 신호.
 */

export type OpsCrisis = { branchId: string; branchName: string; message: string };

export interface BranchOpsHealth {
  branchId: string;
  /** 최근 7일 중 일지 기록일 수 */
  journalDays7: number;
  /** 최근 7일 오픈체크 수행률 (%) — 템플릿 없으면 null */
  openCheckPct7: number | null;
  /** 면담 45일 이상 공백(기록 없음 포함)인 구성원 수 */
  interviewOverdue: number;
  /** 가장 오래 면담 없는 구성원 (days=null 은 기록 없음) */
  oldestGap: { name: string; days: number | null } | null;
  /** 마지막 미팅 경과일 (기록 없으면 null) */
  lastMeetingDays: number | null;
  status: 'ok' | 'warn' | 'crisis';
}

const CONDITION_KEYS = ['mental', 'physical', 'leader_support', 'popularity'] as const;
const CONDITION_LABEL: Record<(typeof CONDITION_KEYS)[number], string> = {
  mental: '마음',
  physical: '몸',
  leader_support: '지지율',
  popularity: '관계',
};

function daysBetween(dateStr: string, todayStr: string): number {
  return Math.round(
    (new Date(`${todayStr}T00:00:00+09:00`).getTime() - new Date(`${dateStr}T00:00:00+09:00`).getTime()) /
      86400000,
  );
}

function dateNDaysAgo(todayStr: string, n: number): string {
  const t = new Date(`${todayStr}T00:00:00+09:00`).getTime() - n * 86400000;
  return new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
}

/** 지점별 운영 리듬 + 위기 신호. branches: {id, name} 목록 (본사 overview에서 호출) */
export async function aggregateOpsHealth(
  branches: { id: string; name: string }[],
): Promise<{ health: Map<string, BranchOpsHealth>; crises: OpsCrisis[] }> {
  const admin = getAdminSupabase();
  const today = kstTodayStr();
  const since7 = dateNDaysAgo(today, 6); // 오늘 포함 7일
  const branchIds = branches.map((b) => b.id);

  const [
    { data: journals },
    { data: checks },
    { count: templateCount },
    { data: interviews },
    { data: meetings },
    { data: staff },
    { data: conditions },
  ] = await Promise.all([
    admin
      .from('director_journals')
      .select('branch_id, journal_date, am_text, pm_text')
      .in('branch_id', branchIds)
      .gte('journal_date', since7),
    admin
      .from('daily_open_checks')
      .select('branch_id, check_date, checked')
      .in('branch_id', branchIds)
      .gte('check_date', since7),
    admin.from('daily_check_templates').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin
      .from('interviews')
      .select('branch_id, subject_member_id, interviewed_at, status')
      .in('branch_id', branchIds)
      .in('status', ['ready', 'confirmed']),
    admin.from('meetings').select('branch_id, held_at').in('branch_id', branchIds),
    admin
      .from('branch_users')
      .select('id, display_name, branch_id, role')
      .eq('is_active', true)
      .in('role', ['designer', 'intern']),
    admin
      .from('member_conditions')
      .select('branch_id, member_id, recorded_at, mental, physical, leader_support, popularity')
      .in('branch_id', branchIds)
      .order('recorded_at', { ascending: false })
      .limit(1000),
  ]);

  const health = new Map<string, BranchOpsHealth>();
  const crises: OpsCrisis[] = [];

  for (const b of branches) {
    const bCrises: OpsCrisis[] = [];

    // 일지: 최근 7일 기록일 수
    const journalDays7 = new Set(
      (journals ?? [])
        .filter((j) => j.branch_id === b.id && (j.am_text || j.pm_text))
        .map((j) => j.journal_date),
    ).size;

    // 오픈체크 수행률: (7일간 체크된 항목 수) / (템플릿 수 × 7일)
    let openCheckPct7: number | null = null;
    if (templateCount && templateCount > 0) {
      const checkedCount = (checks ?? []).filter((c) => c.branch_id === b.id && c.checked).length;
      openCheckPct7 = Math.min(100, Math.round((checkedCount / (templateCount * 7)) * 100));
    }

    // 면담: 구성원(디자이너·인턴)별 마지막 면담 경과
    const bStaff = (staff ?? []).filter((s) => s.branch_id === b.id);
    let interviewOverdue = 0;
    let oldestGap: BranchOpsHealth['oldestGap'] = null;
    for (const s of bStaff) {
      const mine = (interviews ?? [])
        .filter((i) => i.subject_member_id === s.id)
        .sort((a, z) => (a.interviewed_at < z.interviewed_at ? 1 : -1));
      const days = mine.length > 0 ? daysBetween(mine[0].interviewed_at, today) : null;
      const overdue = days == null || days >= 45;
      if (!overdue) continue;
      interviewOverdue += 1;
      const worse =
        !oldestGap ||
        (days == null && oldestGap.days != null) ||
        (days != null && oldestGap.days != null && days > oldestGap.days);
      if (worse) oldestGap = { name: s.display_name, days };
      if (days != null && days >= 60) {
        bCrises.push({ branchId: b.id, branchName: b.name, message: `면담 공백: ${s.display_name} ${days}일` });
      }
    }

    // 미팅 주기
    const bMeetings = (meetings ?? [])
      .filter((m) => m.branch_id === b.id)
      .sort((a, z) => (a.held_at < z.held_at ? 1 : -1));
    const lastMeetingDays = bMeetings.length > 0 ? daysBetween(bMeetings[0].held_at, today) : null;

    // 컨디션 신호: 구성원별 최신 2개 비교 — 점수 ≤3 또는 직전 대비 -3
    const byMember = new Map<string, NonNullable<typeof conditions>>();
    for (const c of (conditions ?? []).filter((c) => c.branch_id === b.id)) {
      const arr = byMember.get(c.member_id) ?? [];
      if (arr.length < 2) byMember.set(c.member_id, [...arr, c]);
    }
    for (const [memberId, rows] of byMember) {
      const latest = rows[0];
      const prev = rows[1];
      const name = bStaff.find((s) => s.id === memberId)?.display_name ?? '구성원';
      for (const k of CONDITION_KEYS) {
        const v = latest[k];
        if (v == null) continue;
        if (v <= 3) {
          bCrises.push({ branchId: b.id, branchName: b.name, message: `이탈 위험: ${name} ${CONDITION_LABEL[k]} ${v}점` });
          break;
        }
        const p = prev?.[k];
        if (p != null && p - v >= 3) {
          bCrises.push({ branchId: b.id, branchName: b.name, message: `이탈 위험: ${name} ${CONDITION_LABEL[k]} ${p}→${v}` });
          break;
        }
      }
    }

    // 운영 기록이 완전히 멈춘 지점
    if (journalDays7 === 0 && (openCheckPct7 == null || openCheckPct7 === 0)) {
      bCrises.push({ branchId: b.id, branchName: b.name, message: '운영 기록 멈춤 (일지·오픈체크 7일간 0건)' });
    }

    let status: BranchOpsHealth['status'] = 'ok';
    if (
      journalDays7 < 3 ||
      (openCheckPct7 != null && openCheckPct7 < 50) ||
      interviewOverdue > 0 ||
      (lastMeetingDays != null && lastMeetingDays > 21)
    ) {
      status = 'warn';
    }
    if (bCrises.length > 0) status = 'crisis';

    crises.push(...bCrises);
    health.set(b.id, {
      branchId: b.id,
      journalDays7,
      openCheckPct7,
      interviewOverdue,
      oldestGap,
      lastMeetingDays,
      status,
    });
  }

  return { health, crises };
}

/** '3일 전' 표기 */
export function fmtDaysAgo(days: number | null): string {
  if (days == null) return '기록 없음';
  if (days === 0) return '오늘';
  return `${days}일 전`;
}
