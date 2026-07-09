'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mic, Square, PenLine, RotateCcw, Loader2 } from 'lucide-react';
import { roleLabel, type Role } from '@/lib/roles';
import { useRecorder, fmtSeconds } from '@/lib/useRecorder';
import { getBrowserSupabase } from '@/lib/supabase/client';
import InterviewReview from './InterviewReview';
import MeetingsTab from './MeetingsTab';

export type Branch = { id: string; name: string };
export type RosterMember = { id: string; display_name: string; role: string; branch_ids: string[] };
type InterviewRow = {
  id: string;
  subject_member_id: string;
  interviewed_at: string;
  method: 'audio' | 'manual';
  status: 'draft' | 'processing' | 'ready' | 'confirmed' | 'failed';
  summary: string | null;
  risk_flags: string[] | null;
};
type ConditionRow = {
  member_id: string;
  recorded_at: string;
  mental: number | null;
  physical: number | null;
  leader_support: number | null;
  popularity: number | null;
};

const STATUS_LABEL: Record<InterviewRow['status'], string> = {
  draft: '업로드 대기',
  processing: 'AI 분석 중',
  ready: '검토 대기',
  confirmed: '확정',
  failed: '실패',
};

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(`${dateStr}T00:00:00+09:00`).getTime()) / 86400000);
}

export default function InterviewsStudio({
  branches,
  roster,
  defaultBranchId,
}: {
  branches: Branch[];
  roster: RosterMember[];
  defaultBranchId: string | null;
}) {
  const [branchId, setBranchId] = useState<string | null>(defaultBranchId);
  const [tab, setTab] = useState<'interview' | 'meeting'>('interview');
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchRoster = useMemo(
    () => roster.filter((m) => branchId && m.branch_ids.includes(branchId)),
    [roster, branchId],
  );

  const load = useCallback(async (bid: string) => {
    setError(null);
    const res = await fetch(`/api/interviews?branch_id=${bid}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '불러오지 못했어요');
      return;
    }
    setInterviews(data.interviews ?? []);
    setConditions(data.conditions ?? []);
  }, []);

  useEffect(() => {
    if (branchId) void load(branchId);
  }, [branchId, load]);

  // 구성원별 요약: 마지막 면담 경과일 + 최근 컨디션
  const memberSummary = useMemo(() => {
    const map = new Map<string, { lastDays: number | null; trend: number[] }>();
    for (const m of branchRoster) {
      const mine = interviews.filter(
        (i) => i.subject_member_id === m.id && (i.status === 'confirmed' || i.status === 'ready'),
      );
      const lastDays = mine.length > 0 ? daysSince(mine[0].interviewed_at) : null;
      const conds = conditions
        .filter((c) => c.member_id === m.id)
        .slice(0, 5)
        .reverse();
      const trend = conds.map((c) => {
        const vals = [c.mental, c.physical, c.leader_support, c.popularity].filter(
          (v): v is number => v != null,
        );
        return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
      });
      map.set(m.id, { lastDays, trend });
    }
    return map;
  }, [branchRoster, interviews, conditions]);

  const memberName = useCallback(
    (id: string) => roster.find((m) => m.id === id)?.display_name ?? '?',
    [roster],
  );

  if (reviewId && branchId) {
    return (
      <InterviewReview
        interviewId={reviewId}
        onClose={() => {
          setReviewId(null);
          void load(branchId);
        }}
      />
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {branches.length > 1 && (
        <select
          value={branchId ?? ''}
          onChange={(e) => setBranchId(e.target.value)}
          className="w-full rounded-xl2 border border-line bg-surface px-4 py-2.5 text-sm font-semibold"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {/* 탭 */}
      <div className="flex gap-1 rounded-xl2 border border-line bg-surface p-1">
        {(
          [
            ['interview', '개인면담'],
            ['meeting', '미팅'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              tab === key ? 'bg-brand text-white' : 'text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-xl2 border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{error}</p>
      )}

      {tab === 'meeting' ? (
        <MeetingsTab branchId={branchId} roster={branchRoster} />
      ) : (
        <InterviewTab
          branchId={branchId}
          roster={branchRoster}
          interviews={interviews}
          memberSummary={memberSummary}
          memberName={memberName}
          onOpenReview={setReviewId}
          onChanged={() => branchId && void load(branchId)}
        />
      )}
    </div>
  );
}

// ── 개인면담 탭 ────────────────────────────────────────────────────────────

function InterviewTab({
  branchId,
  roster,
  interviews,
  memberSummary,
  memberName,
  onOpenReview,
  onChanged,
}: {
  branchId: string | null;
  roster: RosterMember[];
  interviews: InterviewRow[];
  memberSummary: Map<string, { lastDays: number | null; trend: number[] }>;
  memberName: (id: string) => string;
  onOpenReview: (id: string) => void;
  onChanged: () => void;
}) {
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading' | 'processing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { recording, seconds, start, stop } = useRecorder();

  const beginRecording = async (memberId: string) => {
    setError(null);
    setSubjectId(memberId);
    try {
      await start();
      setPhase('recording');
    } catch {
      setError('마이크 권한이 필요해요. 브라우저 설정에서 허용해주세요.');
      setSubjectId(null);
    }
  };

  const finishRecording = async () => {
    if (!branchId || !subjectId) return;
    const blob = await stop();
    if (!blob || blob.size === 0) {
      setPhase('idle');
      setSubjectId(null);
      return;
    }
    setPhase('uploading');
    try {
      // 1) 면담 행 생성 + 서명 업로드 URL
      const createRes = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId, subject_member_id: subjectId, method: 'audio' }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error);

      // 2) 스토리지 직접 업로드 (라우트 프록시 금지 — 바디 한계)
      const { error: upErr } = await getBrowserSupabase()
        .storage.from('interview-audio')
        .uploadToSignedUrl(created.upload.path, created.upload.token, blob, {
          contentType: blob.type || 'audio/webm',
        });
      if (upErr) throw new Error('업로드에 실패했어요. 다시 시도해주세요.');

      // 3) AI 분석
      setPhase('processing');
      const procRes = await fetch(`/api/interviews/${created.interview.id}/process`, { method: 'POST' });
      const proc = await procRes.json();
      if (!procRes.ok) throw new Error(proc.error);

      setPhase('idle');
      setSubjectId(null);
      onOpenReview(created.interview.id);
    } catch (e) {
      setError((e as Error).message || '처리에 실패했어요');
      setPhase('idle');
      setSubjectId(null);
      onChanged();
    }
  };

  const createManual = async (memberId: string) => {
    if (!branchId) return;
    setError(null);
    const res = await fetch('/api/interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId, subject_member_id: memberId, method: 'manual' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '생성에 실패했어요');
      return;
    }
    onOpenReview(data.interview.id);
  };

  const retryProcess = async (id: string) => {
    setError(null);
    setPhase('processing');
    const res = await fetch(`/api/interviews/${id}/process`, { method: 'POST' });
    const data = await res.json();
    setPhase('idle');
    if (!res.ok) {
      setError(data.error || '재시도에 실패했어요');
      onChanged();
      return;
    }
    onOpenReview(id);
  };

  const busy = phase === 'uploading' || phase === 'processing';
  const pending = interviews.filter((i) => i.status !== 'confirmed');
  const confirmed = interviews.filter((i) => i.status === 'confirmed').slice(0, 20);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl2 border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{error}</p>
      )}

      {/* 녹음 중 배너 */}
      {phase === 'recording' && recording && subjectId && (
        <div className="rounded-xl2 border border-red-300 bg-red-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-red-600">
              {memberName(subjectId)} 면담 녹음 중 · {fmtSeconds(seconds)}
            </p>
            <button
              type="button"
              onClick={() => void finishRecording()}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white"
            >
              <Square size={13} /> 면담 끝내기
            </button>
          </div>
          <p className="mt-1 text-xs text-red-400">
            끝내면 AI가 대화를 정리해요. 녹음은 90일 뒤 자동 삭제되고 기록만 남아요.
          </p>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 rounded-xl2 border border-line bg-surface p-4 text-sm text-ink-soft">
          <Loader2 size={16} className="animate-spin text-brand" />
          {phase === 'uploading' ? '녹음 올리는 중…' : 'AI가 면담을 정리하는 중… (1~2분)'}
        </div>
      )}

      {/* 구성원 리스트 */}
      <section className="overflow-hidden rounded-xl2 border border-line bg-surface">
        <p className="border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint">
          우리 지점 구성원 · 면담할 사람의 녹음 버튼을 누르세요
        </p>
        {roster.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-faint">이 지점에 구성원이 없어요.</p>
        )}
        <ul className="divide-y divide-line">
          {roster.map((m) => {
            const s = memberSummary.get(m.id);
            const overdue = s?.lastDays == null || s.lastDays >= 45;
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {m.display_name}
                    <span className="ml-1.5 text-xs font-normal text-ink-faint">
                      {roleLabel[m.role as Role] ?? m.role}
                    </span>
                  </p>
                  <p className={`text-xs ${overdue ? 'font-semibold text-warn' : 'text-ink-faint'}`}>
                    {s?.lastDays == null
                      ? '면담 기록 없음'
                      : s.lastDays === 0
                        ? '오늘 면담함'
                        : `마지막 면담 ${s.lastDays}일 전`}
                  </p>
                </div>
                {/* 컨디션 스파크라인 (최근 5회 평균점수) */}
                {s && s.trend.length > 0 && (
                  <div className="flex items-end gap-0.5" title="최근 컨디션 (0~10)">
                    {s.trend.map((v, i) => (
                      <div
                        key={i}
                        className={`w-1.5 rounded-t ${v <= 3 ? 'bg-warn' : 'bg-brand/60'}`}
                        style={{ height: `${Math.max(3, v * 2.4)}px` }}
                      />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={recording || busy}
                  onClick={() => void beginRecording(m.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  <Mic size={12} /> 녹음
                </button>
                <button
                  type="button"
                  disabled={recording || busy}
                  onClick={() => void createManual(m.id)}
                  title="직접 입력"
                  className="rounded-full border border-line p-1.5 text-ink-faint disabled:opacity-40"
                >
                  <PenLine size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 검토 대기/실패 */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-base font-bold">확정 전 면담</h2>
          <ul className="mt-2 space-y-2">
            {pending.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-xl2 border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {memberName(i.subject_member_id)}
                    <span className="ml-2 text-xs font-normal text-ink-faint">{i.interviewed_at}</span>
                  </p>
                  <p className={`text-xs ${i.status === 'failed' ? 'text-warn' : 'text-ink-faint'}`}>
                    {STATUS_LABEL[i.status]}
                  </p>
                </div>
                {i.status === 'failed' || i.status === 'draft' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void retryProcess(i.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft disabled:opacity-40"
                  >
                    <RotateCcw size={12} /> 다시 분석
                  </button>
                ) : i.status === 'ready' ? (
                  <button
                    type="button"
                    onClick={() => onOpenReview(i.id)}
                    className="rounded-full bg-brand-wash px-3 py-1.5 text-xs font-bold text-brand"
                  >
                    검토하기
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 확정된 면담 */}
      {confirmed.length > 0 && (
        <section>
          <h2 className="text-base font-bold">지난 면담</h2>
          <ul className="mt-2 space-y-2">
            {confirmed.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => onOpenReview(i.id)}
                  className="w-full rounded-xl2 border border-line bg-surface px-4 py-3 text-left"
                >
                  <p className="text-sm font-semibold">
                    {memberName(i.subject_member_id)}
                    <span className="ml-2 text-xs font-normal text-ink-faint">{i.interviewed_at}</span>
                  </p>
                  {i.summary && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{i.summary}</p>
                  )}
                  {!!i.risk_flags?.length && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {i.risk_flags.map((f, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-semibold text-warn"
                        >
                          {f}
                        </span>
                      ))}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
