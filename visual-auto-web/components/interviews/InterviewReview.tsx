'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Play, Sparkles, Trash2 } from 'lucide-react';

type Scores = {
  mental: number | null;
  physical: number | null;
  leader_support: number | null;
  popularity: number | null;
};
type InterviewDetail = {
  id: string;
  subject_name: string | null;
  interviewed_at: string;
  method: 'audio' | 'manual';
  status: string;
  audio_path: string | null;
  audio_deleted_at: string | null;
  transcript: string | null;
  summary: string | null;
  goal_professional: string | null;
  goal_personal: string | null;
  leader_feedback: string | null;
  risk_flags: string[] | null;
  suggested_scores: Scores | null;
};

const SCORE_LABEL: [keyof Scores, string][] = [
  ['mental', '정신(마음) 상태'],
  ['physical', '몸 상태'],
  ['leader_support', '리더 지지'],
  ['popularity', '매장 내 관계'],
];

/** 면담 검토·확정 화면 — AI 초안을 원장이 다듬고 점수를 확정한다 */
export default function InterviewReview({
  interviewId,
  onClose,
}: {
  interviewId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<InterviewDetail | null>(null);
  const [scores, setScores] = useState<Scores>({
    mental: null,
    physical: null,
    leader_support: null,
    popularity: null,
  });
  const [scoresTouched, setScoresTouched] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/interviews/${interviewId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '불러오지 못했어요');
      return;
    }
    const iv: InterviewDetail = data.interview;
    setDetail(iv);
    if (iv.suggested_scores) {
      setScores({
        mental: iv.suggested_scores.mental,
        physical: iv.suggested_scores.physical,
        leader_support: iv.suggested_scores.leader_support,
        popularity: iv.suggested_scores.popularity,
      });
    }
  }, [interviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchField = (k: keyof InterviewDetail, v: string) =>
    setDetail((d) => (d ? { ...d, [k]: v } : d));

  const save = async (confirm: boolean) => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/interviews/${interviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: confirm ? 'confirm' : 'save_review',
          summary: detail.summary,
          goal_professional: detail.goal_professional,
          goal_personal: detail.goal_personal,
          leader_feedback: detail.leader_feedback,
          ...(confirm
            ? {
                scores,
                scores_source: scoresTouched || detail.method === 'manual' ? undefined : 'ai',
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (confirm) onClose();
      else setDetail((d) => (d ? { ...d, status: data.interview.status } : d));
    } catch (e) {
      setError((e as Error).message || '저장에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('이 면담 기록을 지울까요? (녹음도 함께 삭제)')) return;
    setBusy(true);
    const res = await fetch(`/api/interviews/${interviewId}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) onClose();
    else setError((await res.json()).error || '삭제에 실패했어요');
  };

  const playAudio = async () => {
    const res = await fetch(`/api/interviews/${interviewId}?action=audio_url`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setAudioUrl(data.audio_url);
  };

  if (!detail) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-ink-soft">
        <Loader2 size={16} className="animate-spin" /> 불러오는 중…
      </div>
    );
  }

  const confirmed = detail.status === 'confirmed';

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft"
        >
          <ArrowLeft size={15} /> 목록으로
        </button>
        {!confirmed && (
          <button type="button" onClick={() => void remove()} className="p-1.5 text-ink-faint" title="삭제">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <p className="text-lg font-bold">
          {detail.subject_name ?? '구성원'} 면담
          <span className="ml-2 text-sm font-normal text-ink-faint">{detail.interviewed_at}</span>
        </p>
        {!confirmed && detail.method === 'audio' && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-brand">
            <Sparkles size={12} /> AI가 정리한 초안이에요 — 다듬고 확정해주세요
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            {error}
          </p>
        )}

        {/* 녹음 재생 */}
        {detail.method === 'audio' && detail.audio_path && !detail.audio_deleted_at && (
          <div className="mt-3">
            {audioUrl ? (
              <audio controls src={audioUrl} className="w-full" />
            ) : (
              <button
                type="button"
                onClick={() => void playAudio()}
                className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft"
              >
                <Play size={12} /> 녹음 듣기
              </button>
            )}
          </div>
        )}

        <Field
          label="면담 요약"
          value={detail.summary ?? ''}
          rows={4}
          disabled={confirmed}
          onChange={(v) => patchField('summary', v)}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="직업적 목표"
            value={detail.goal_professional ?? ''}
            rows={2}
            disabled={confirmed}
            onChange={(v) => patchField('goal_professional', v)}
          />
          <Field
            label="개인적 목표"
            value={detail.goal_personal ?? ''}
            rows={2}
            disabled={confirmed}
            onChange={(v) => patchField('goal_personal', v)}
          />
        </div>
        <Field
          label="면담후기 & 리더 피드백"
          value={detail.leader_feedback ?? ''}
          rows={3}
          disabled={confirmed}
          placeholder="이야기하고 내가 어떻게 느꼈는지…"
          onChange={(v) => patchField('leader_feedback', v)}
        />

        {!!detail.risk_flags?.length && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-ink-faint">AI가 감지한 신호</p>
            <p className="mt-1 flex flex-wrap gap-1">
              {detail.risk_flags.map((f, i) => (
                <span key={i} className="rounded-full bg-warn/10 px-2 py-0.5 text-xs font-semibold text-warn">
                  {f}
                </span>
              ))}
            </p>
          </div>
        )}

        {/* 컨디션 점수 */}
        {!confirmed && (
          <div className="mt-4 rounded-xl2 border border-line bg-canvas p-3.5">
            <p className="text-sm font-bold">
              컨디션 점수
              {detail.method === 'audio' && !scoresTouched && (
                <span className="ml-2 rounded-full bg-brand-wash px-2 py-0.5 text-[10px] font-semibold text-brand">
                  AI 제안
                </span>
              )}
            </p>
            <div className="mt-2 space-y-2.5">
              {SCORE_LABEL.map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-ink-soft">{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={scores[key] ?? 5}
                    onChange={(e) => {
                      setScoresTouched(true);
                      setScores((s) => ({ ...s, [key]: Number(e.target.value) }));
                    }}
                    className="flex-1 accent-brand"
                  />
                  <span
                    className={`w-8 text-right text-sm font-bold tabular-nums ${
                      scores[key] != null && scores[key]! <= 3 ? 'text-warn' : ''
                    }`}
                  >
                    {scores[key] ?? '–'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 전사문 */}
        {detail.transcript && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowTranscript((s) => !s)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint"
            >
              전체 대화 내용 {showTranscript ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {showTranscript && (
              <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 text-xs leading-relaxed text-ink-soft">
                {detail.transcript}
              </p>
            )}
          </div>
        )}

        {!confirmed && (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(false)}
              className="flex-1 rounded-xl2 border border-line py-3 text-sm font-bold text-ink-soft disabled:opacity-50"
            >
              임시 저장
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
              className="flex-[2] rounded-xl2 bg-brand py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? '저장 중…' : '면담 확정 (컨디션 기록)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  rows,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  disabled?: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-ink-faint">{label}</p>
      <textarea
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm leading-relaxed placeholder:text-ink-faint focus:border-brand focus:outline-none disabled:opacity-70"
      />
    </div>
  );
}
