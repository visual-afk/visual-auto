'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { C } from './theme';
import StructureMap from './StructureMap';
import AreaPanel from './AreaPanel';
import ExperimentBoard from './ExperimentBoard';
import MeetingMode from './MeetingMode';
import ExperimentEditor from './ExperimentEditor';
import { worstAreaId, type ResolvedArea, type Experiment, type MeetingSummary } from '@/lib/strategy/model';

type Tab = '기본표' | '실험 보드' | '회의 모드';

export default function StrategyRoom({
  areas,
  experiments,
  meetings,
  assignees,
  dbReady,
  today,
}: {
  areas: ResolvedArea[];
  experiments: Experiment[];
  meetings: MeetingSummary[];
  assignees: string[];
  dbReady: boolean;
  today: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('기본표');
  const [selectedId, setSelectedId] = useState(() => worstAreaId(areas));
  const [editor, setEditor] = useState<{ exp: Experiment | null; fixedArea?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const selected = areas.find((a) => a.id === selectedId) ?? areas[0];
  const refresh = () => router.refresh();

  const exportAgenda = async (area: ResolvedArea) => {
    const lines = [
      `[회의 안건 · ${area.name}]`,
      `돈의 공식: ${area.moneyFormula}`,
      '지표:',
      ...area.metrics.map((mt) => ` - ${mt.name}: ${mt.display ?? '?'}${mt.context ? ` (${mt.context})` : ''}`),
      `지금 문제: ${area.currentProblem ?? '—'}`,
      `원인 후보: ${area.causeNote ?? '—'}`,
      area.activeExperiment
        ? `이번 실험: ${area.activeExperiment.action ?? '—'} (담당 ${area.activeExperiment.assigneeName ?? '미정'}, ~${area.activeExperiment.dueDate ?? '미정'})`
        : '이번 실험: 없음',
      `다음 회의 결정: ${area.decideNext ?? '—'}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setToast('안건지를 클립보드에 복사했어요');
    } catch {
      setToast('복사 실패 — 수동으로 선택해 복사하세요');
    }
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className="-mx-5 rounded-none px-5 py-5 md:mx-0 md:rounded-2xl md:px-6 md:py-6" style={{ background: C.bg, color: C.text, minHeight: '80dvh' }}>
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.text }}>본사전략실</h1>
          <p className="text-sm" style={{ color: C.textDim }}>사업 구조도 = 이번 주 할 일. 가장 나쁜 숫자부터.</p>
        </div>
        <span className="rounded-full px-3 py-1 text-xs" style={{ background: C.panel, color: C.textDim }}>이번 주 · 기준일 {today}</span>
      </div>

      {!dbReady && (
        <div className="mt-3 rounded-xl px-4 py-2.5 text-sm" style={{ background: C.dangerBg, color: C.warn }}>
          읽기 전용 모드 — <b>0023-strategy-room.sql</b>을 Supabase SQL Editor에서 실행하면 편집·저장·실험·회의가 켜집니다. 지표는 지금도 실데이터로 표시돼요.
        </div>
      )}

      {/* 탭 */}
      <div className="mt-4 flex gap-1.5">
        {(['기본표', '실험 보드', '회의 모드'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-full px-4 py-2 text-sm font-semibold"
            style={t === tab ? { background: C.accent, color: '#fff' } : { background: C.panel, color: C.textDim }}>
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === '기본표' && (
          <div className="space-y-5">
            <div className="rounded-2xl p-2 md:p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <StructureMap areas={areas} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            {selected && (
              <AreaPanel
                area={selected}
                assignees={assignees}
                editable={dbReady}
                onRefresh={refresh}
                onEditExperiment={(a, exp) => setEditor({ exp, fixedArea: a.id })}
                onExportAgenda={exportAgenda}
              />
            )}
          </div>
        )}

        {tab === '실험 보드' && (
          <ExperimentBoard
            experiments={experiments}
            areas={areas}
            editable={dbReady}
            onRefresh={refresh}
            onEdit={(exp) => setEditor({ exp })}
            onNew={() => setEditor({ exp: null })}
          />
        )}

        {tab === '회의 모드' && (
          <MeetingMode
            areas={areas}
            experiments={experiments}
            meetings={meetings}
            assignees={assignees}
            editable={dbReady}
            onRefresh={refresh}
            onNewExperiment={() => setEditor({ exp: null })}
          />
        )}
      </div>

      {editor && (
        <ExperimentEditor
          areas={areas}
          assignees={assignees}
          initial={editor.exp}
          fixedAreaId={editor.fixedArea}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg" style={{ background: C.panel, color: C.text, border: `1px solid ${C.line}` }}>
          {toast}
        </div>
      )}
    </div>
  );
}
