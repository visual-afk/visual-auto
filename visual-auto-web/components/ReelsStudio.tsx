'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, Loader2, Sparkles, Copy, Check, Film, Eye, MapPin, Users, Wand2, Camera,
} from 'lucide-react';
import type { ContentProfile } from '@/lib/reels';
import { usePersistentState } from '@/lib/usePersistentState';

export type BranchOption = { id: string; name: string };
export type PastReel = { id: string; title: string | null; views: number | null; status: string; created_at: string; published_url: string | null };

type Cut = { time: string; shot: string; caption: string };
type Structure = { title: string; cuts: Cut[]; why: string };
type Analysis = { hook?: string; why?: string; captions?: string[]; cuts?: { time: string; what: string }[] };

const TREATMENTS = ['결마지', '펌', '염색', '클리닉', '컷'];

export default function ReelsStudio({
  profile,
  canEditBranch,
  pastReels,
  branches,
  needsBranchPick,
}: {
  profile: ContentProfile;
  canEditBranch: boolean;
  pastReels: PastReel[];
  branches: BranchOption[];
  needsBranchPick: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [branchId, setBranchId] = useState(needsBranchPick ? '' : branches[0]?.id ?? '');
  const [analyzing, setAnalyzing] = useState(false);
  // 새로고침해도 안 날아가게 자동 임시저장 (영상 파일 자체는 제외)
  const [analysis, setAnalysis, clearAnalysis] = usePersistentState<Analysis | null>('va:reels:analysis', null);
  const [chips, setChips, clearChips] = usePersistentState<string[]>('va:reels:chips', []);
  const [notes, setNotes, clearNotes] = usePersistentState<string>('va:reels:notes', '');
  const [angle, setAngle, clearAngle] = usePersistentState<'담백' | '욕망'>('va:reels:angle', '욕망');
  const [generating, setGenerating] = useState(false);
  const [structure, setStructure] = useState<Structure | null>(null);
  const [reelId, setReelId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const profileLine = (() => {
    const ch = profile.character as { type?: string; oneLiner?: string };
    return {
      tone: [profile.regionTarget, profile.tone].filter(Boolean).join(' / ') || '미설정',
      persona: Object.values(profile.persona).filter(Boolean).join(', ') || '미설정',
      character: [ch.type, ch.oneLiner].filter(Boolean).join(' · ') || '미설정',
    };
  })();

  function toggleChip(c: string) {
    setChips((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  }

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    setAnalysis(null);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/reels/analyze', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || '영상 분석 실패');
      else setAnalysis(d.analysis);
    } catch {
      setErr('영상 분석 중 문제가 생겼어요');
    } finally {
      setAnalyzing(false);
    }
  }

  async function generate() {
    setErr('');
    if (needsBranchPick && !branchId) {
      setErr('지점을 골라주세요');
      return;
    }
    setGenerating(true);
    setStructure(null);
    try {
      const res = await fetch('/api/reels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_analysis: analysis,
          treatment_chips: chips,
          notes,
          angle,
          branch_id: branchId || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || '릴스 구성 실패');
      else {
        setStructure(d.structure);
        setReelId(d.reel?.id ?? null);
      }
    } catch {
      setErr('릴스 구성 중 문제가 생겼어요');
    } finally {
      setGenerating(false);
    }
  }

  async function copyScript() {
    if (!structure) return;
    const text = [
      structure.title,
      '',
      ...structure.cuts.map((c, i) => `컷${i + 1} (${c.time})\n촬영: ${c.shot}\n자막: ${c.caption}`),
    ].join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function openInstagram() {
    copyScript();
    window.open('https://www.instagram.com/', '_blank', 'noopener');
  }

  async function registerLink() {
    if (!reelId || !publishedUrl.trim()) {
      setErr('올린 릴스 주소를 붙여넣어 주세요');
      return;
    }
    setErr('');
    await fetch(`/api/reels/${reelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish', published_url: publishedUrl }),
    });
    await fetch(`/api/reels/${reelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record_views', published_url: publishedUrl, next_check: true }),
    });
    // 등록 완료 → 임시저장 초안 비우기
    clearAnalysis();
    clearChips();
    clearNotes();
    clearAngle();
    setMsg('등록 완료! 조회수는 며칠 뒤 다시 넣으면 돼요.');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">릴스 만들기</h1>
        <p className="mt-1 text-sm text-ink-soft">잘 된 릴스 따라 만들면 돼요</p>
      </div>

      {/* 콘텐츠 프로필 */}
      <section className="rounded-xl2 border border-line bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold">내 콘텐츠 프로필</h2>
          <span className="text-xs text-ink-faint">모든 릴스에 자동 반영</span>
        </div>
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2"><MapPin size={14} className="text-brand" /> 매장 톤·지역: <span className="font-semibold">{profileLine.tone}</span></li>
          <li className="flex items-center gap-2"><Users size={14} className="text-brand" /> 내 고객: <span className="font-semibold">{profileLine.persona}</span></li>
          <li className="flex items-center gap-2"><Sparkles size={14} className="text-brand" /> 내 캐릭터: <span className="font-semibold">{profileLine.character}</span></li>
        </ul>
        {(profileLine.tone === '미설정' || profileLine.persona === '미설정' || profileLine.character === '미설정') && (
          <p className="mt-2 text-xs text-warn">프로필을 채우면 릴스·블로그 품질이 올라가요. {canEditBranch ? '(매장 톤은 원장/본사가 설정)' : ''}</p>
        )}
      </section>

      {/* 1) 레퍼런스 */}
      <section className="rounded-xl2 border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-bold">① 잘 된 릴스 올리기 (레퍼런스)</h2>
        <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={analyzing}>
          <span className="inline-flex items-center gap-1.5">
            {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {analyzing ? '분석 중…' : '영상 올려서 분석'}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onPickVideo} />
        <p className="mt-1.5 text-xs text-ink-faint">짧은 클립(20MB 이하)이면 돼요.</p>

        {analysis && (
          <div className="mt-3 rounded-xl border border-brand-wash bg-brand-wash/40 p-3 text-sm">
            <p className="font-bold text-brand">이 릴스가 잘 된 이유</p>
            {analysis.hook && <p className="mt-1">훅: {analysis.hook}</p>}
            {analysis.why && <p className="mt-1">{analysis.why}</p>}
            {analysis.captions?.length ? <p className="mt-1 text-ink-soft">자막 예: {analysis.captions.join(' · ')}</p> : null}
          </div>
        )}
      </section>

      {/* 2) 소재 입력 */}
      <section className="rounded-xl2 border border-line bg-surface p-4 space-y-3">
        <h2 className="text-sm font-bold">② 내 영상은 무슨 시술이에요?</h2>
        <div className="flex flex-wrap gap-2">
          {TREATMENTS.map((t) => (
            <button key={t} className={`chip ${chips.includes(t) ? 'chip-on' : ''}`} onClick={() => toggleChip(t)}>{t}</button>
          ))}
        </div>
        <textarea className="field min-h-20 resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="예: 10년 곱슬인데 자연스럽게 펴진 케이스" />
        <div>
          <span className="label">어떤 느낌으로? (14강 앵글)</span>
          <div className="flex gap-2">
            {(['담백', '욕망'] as const).map((a) => (
              <button key={a} className={`chip ${angle === a ? 'chip-on' : ''}`} onClick={() => setAngle(a)}>
                {a === '담백' ? '담백하게' : '욕망 앵글 ✨'}
              </button>
            ))}
          </div>
        </div>
        {needsBranchPick && (
          <select className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">지점 선택</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {err && <p className="text-sm text-warn">{err}</p>}
        <button className="btn-primary" onClick={generate} disabled={generating}>
          <span className="inline-flex items-center gap-1.5">
            {generating ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
            {generating ? '구성 만드는 중…' : '릴스 구성 만들기'}
          </span>
        </button>
        <p className="text-xs text-ink-faint">시술·메모·앵글은 자동 저장돼요. 새로고침해도 그대로 있어요. (영상은 다시 올려주세요)</p>
      </section>

      {/* 3) 구성 결과 */}
      {structure && (
        <section className="rounded-xl2 border border-line bg-surface p-4">
          <h2 className="mb-1 text-sm font-bold">③ 이대로 찍으면 돼요</h2>
          {structure.title && <p className="mb-3 text-sm font-semibold text-brand">{structure.title}</p>}
          <ol className="space-y-3">
            {structure.cuts.map((c, i) => (
              <li key={i} className="rounded-xl border border-line bg-canvas p-3">
                <p className="text-xs font-bold text-brand">컷 {i + 1} · {c.time}</p>
                <p className="mt-1 text-sm">🎥 {c.shot}</p>
                <p className="mt-1 text-sm font-semibold">💬 자막 "{c.caption}"</p>
              </li>
            ))}
          </ol>
          {structure.why && <p className="mt-3 text-xs text-ink-soft">왜 잘 되나: {structure.why}</p>}

          <button className="btn-ghost mt-4" onClick={copyScript}>
            <span className="inline-flex items-center gap-1.5">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '복사됐어요!' : '대본·자막 복사'}</span>
          </button>

          {/* 4) 올리기 + 추적 */}
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-bold">④ 올리고 링크 등록</h3>
            <button className="btn-primary" onClick={openInstagram}>
              <span className="inline-flex items-center gap-1.5"><Camera size={18} /> 인스타 열어서 올리기 (대본 복사됨)</span>
            </button>
            <input className="field mt-3" value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="올린 릴스 주소 붙여넣기" />
            <button className="btn-ghost mt-2" onClick={registerLink} disabled={!reelId}>링크 등록하고 추적 시작</button>
            {msg && <p className="mt-2 text-sm text-ok">{msg}</p>}
          </div>
        </section>
      )}

      {/* 지난 릴스 */}
      {pastReels.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Film size={15} /> 지난 릴스</h2>
          <ul className="divide-y divide-line rounded-xl2 border border-line bg-surface">
            {pastReels.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="min-w-0 truncate">{r.title || '(제목 없음)'}</span>
                <span className="flex items-center gap-1 text-ink-soft"><Eye size={14} />{r.views ?? '-'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
