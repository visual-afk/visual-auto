'use client';

import { useEffect, useMemo, useState } from 'react';
import { Play, Plus } from 'lucide-react';
import { C, STATUS_COLOR } from './theme';
import { apiSend } from './api';
import type { ResolvedArea, Experiment, MeetingSummary } from '@/lib/strategy/model';

const STEPS = [
  { title: '성과 공유', desc: '지난주 완료 실험', min: 10 },
  { title: '숫자 리포트', desc: '9영역 × 3지표', min: 10 },
  { title: '원인 정리', desc: '문제/미확보 영역', min: 10 },
  { title: '가설·실험 선정', desc: '이번 주 실험', min: 10 },
  { title: '기록·결정', desc: '회의록 저장', min: 5 },
];

export default function MeetingMode({
  areas,
  experiments,
  meetings,
  assignees,
  editable,
  onRefresh,
  onNewExperiment,
}: {
  areas: ResolvedArea[];
  experiments: Experiment[];
  meetings: MeetingSummary[];
  assignees: string[];
  editable: boolean;
  onRefresh: () => void;
  onNewExperiment: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running, step]);

  const start = () => {
    setRunning(true);
    setStep(0);
    setElapsed(0);
  };
  const goto = (i: number) => {
    setStep(i);
    setElapsed(0);
  };

  const done = experiments.filter((e) => e.status === '완료');
  const problemAreas = useMemo(() => areas.filter((a) => a.status !== '양호'), [areas]);

  const finish = async () => {
    setSaving(true);
    const decisions: Record<string, string> = {};
    for (const a of areas) if (a.decideNext) decisions[a.name] = a.decideNext;
    const res = await apiSend('/api/strategy/meetings', 'POST', {
      attendees,
      minutes: { note, decisions, completedCount: done.length },
    });
    setSaving(false);
    if (res.ok) {
      setRunning(false);
      onRefresh();
    }
  };

  if (!running) {
    return (
      <div>
        <div className="rounded-2xl p-6 text-center" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <p className="text-sm" style={{ color: C.textDim }}>주 1회 · 45분 · 화면이 진행자입니다</p>
          <button onClick={start} disabled={!editable} className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold disabled:opacity-50" style={{ background: C.accent, color: '#fff' }}>
            <Play size={18} /> 회의 시작
          </button>
          {!editable && <p className="mt-2 text-xs" style={{ color: C.textFaint }}>0023 마이그레이션 실행 후 사용 가능</p>}
        </div>
        {meetings.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold" style={{ color: C.text }}>지난 회의록</p>
            <div className="space-y-2">
              {meetings.map((m) => (
                <div key={m.id} className="rounded-xl p-3 text-sm" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                  <span style={{ color: C.text }}>{m.meetingDate}</span>
                  <span className="ml-2" style={{ color: C.textDim }}>참석 {m.attendees.length}명</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const recSec = STEPS[step].min * 60;
  const over = elapsed > recSec;

  return (
    <div>
      {/* 진행 바 + 타이머 */}
      <div className="sticky top-0 z-10 rounded-xl p-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => goto(i)} className="rounded-full px-3 py-1.5 text-xs font-medium"
                style={i === step ? { background: C.accent, color: '#fff' } : { background: C.card, color: C.textDim }}>
                {i + 1}. {s.title}
              </button>
            ))}
          </div>
          <span className="tabular-nums text-sm font-bold" style={{ color: over ? C.danger : C.textDim }}>
            {fmtClock(elapsed)} / {STEPS[step].min}분
          </span>
        </div>
      </div>

      <div className="mt-4">
        {step === 0 && (
          <StepWrap title="성과 공유" desc="완료된 실험의 결과 숫자·배운 것">
            {done.length === 0 ? <Empty text="완료된 실험이 아직 없어요" /> : done.map((e) => (
              <div key={e.id} className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <p className="font-semibold" style={{ color: C.text }}>{e.action}</p>
                <p className="mt-1 text-sm" style={{ color: C.good }}>결과 {e.resultValue} · {e.learned}</p>
              </div>
            ))}
          </StepWrap>
        )}

        {step === 1 && (
          <StepWrap title="숫자 리포트" desc="숫자와 사실만 — '~것 같아요' 금지">
            <div className="space-y-2">
              {areas.map((a) => (
                <div key={a.id} className="grid grid-cols-[7rem_1fr_1fr_1fr] items-center gap-2 rounded-xl p-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                  <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.text }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[a.status] }} />{a.name}
                  </span>
                  {a.metrics.map((mt) => (
                    <span key={mt.id} className="text-sm" style={{ color: mt.display == null ? C.unknown : C.text, background: mt.display == null ? C.dangerBg : 'transparent', borderRadius: 6, padding: '2px 6px' }}>
                      {mt.name} {mt.display ?? '?'}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </StepWrap>
        )}

        {step === 2 && (
          <StepWrap title="원인 정리" desc="문제/미확보 영역부터">
            {problemAreas.length === 0 ? <Empty text="모든 영역 양호" /> : problemAreas.map((a) => (
              <div key={a.id} className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <p className="flex items-center gap-1.5 font-semibold" style={{ color: C.text }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[a.status] }} />{a.name}
                </p>
                <p className="mt-1 text-sm" style={{ color: C.textDim }}>문제: {a.currentProblem ?? '—'}</p>
                <p className="text-sm" style={{ color: C.textDim }}>원인 후보: {a.causeNote ?? '—'}</p>
              </div>
            ))}
          </StepWrap>
        )}

        {step === 3 && (
          <StepWrap title="가설·실험 선정" desc="이번 주 실험 1~3건">
            <button onClick={onNewExperiment} disabled={!editable} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: C.accent, color: '#fff' }}>
              <Plus size={15} /> 새 실험 카드
            </button>
            <div className="mt-3 space-y-2">
              {experiments.filter((e) => e.status !== '완료').map((e) => (
                <div key={e.id} className="rounded-xl p-3 text-sm" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                  <span style={{ color: C.text }}>{e.action || e.phenomenon}</span>
                  <span className="ml-2" style={{ color: C.textDim }}>{e.assigneeName} · {e.status}</span>
                </div>
              ))}
            </div>
          </StepWrap>
        )}

        {step === 4 && (
          <StepWrap title="기록·결정" desc="참석자 · 회의록 저장">
            <div className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <p className="text-sm font-semibold" style={{ color: C.text }}>참석자</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {assignees.map((a) => (
                  <button key={a} onClick={() => setAttendees((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]))}
                    className="rounded-full px-3 py-1.5 text-sm" style={attendees.includes(a) ? { background: C.accent, color: '#fff' } : { background: C.card, color: C.textDim }}>
                    {a}
                  </button>
                ))}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="회의 메모"
                className="mt-3 w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardBorder}`, color: C.text }} />
              <div className="mt-3">
                <p className="text-sm font-semibold" style={{ color: C.text }}>다음 회의 결정</p>
                {areas.filter((a) => a.decideNext).map((a) => (
                  <p key={a.id} className="mt-1 text-sm" style={{ color: C.textDim }}>· {a.name}: {a.decideNext}</p>
                ))}
              </div>
              <button onClick={finish} disabled={saving} className="mt-4 w-full rounded-xl py-3 font-semibold disabled:opacity-50" style={{ background: C.good, color: '#fff' }}>
                {saving ? '저장 중…' : '회의 종료 · 회의록 저장'}
              </button>
            </div>
          </StepWrap>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <button onClick={() => goto(Math.max(0, step - 1))} disabled={step === 0} className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40" style={{ background: C.card, color: C.text }}>이전</button>
        {step < STEPS.length - 1 && (
          <button onClick={() => goto(step + 1)} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: C.accent, color: '#fff' }}>다음 단계</button>
        )}
      </div>
    </div>
  );
}

function StepWrap({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-bold" style={{ color: C.text }}>{title}</h3>
      <p className="mb-3 text-sm" style={{ color: C.textDim }}>{desc}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-xl p-6 text-center text-sm" style={{ background: C.panel, color: C.textFaint, border: `1px solid ${C.line}` }}>{text}</p>;
}
function fmtClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
