'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, RotateCw, PenLine, Pencil, Mic, Square } from 'lucide-react';
import type { Post, PhotoGuideItem } from '@/lib/types';

const CHIPS = ['결마지', '펌', '염색', '클리닉', '컷'];

const RECORD_MIMES = ['audio/webm', 'audio/mp4', 'audio/ogg'];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** 녹음 중 마이크 소리에 맞춰 움직이는 실시간 파형 (클로드 음성입력 느낌) */
function MicWave({ analyserRef }: { analyserRef: React.MutableRefObject<AnalyserNode | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BARS = 28;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const step = Math.floor(data.length / BARS) || 1;
      const slot = width / BARS;
      const bw = slot * 0.5;
      for (let i = 0; i < BARS; i++) {
        const v = data[i * step] / 255; // 0..1
        const h = Math.max(3, v * v * height); // 제곱: 조용할 땐 더 잔잔하게
        ctx.fillStyle = '#5b7fd4';
        const x = i * slot + (slot - bw) / 2;
        const y = (height - h) / 2;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, bw, h, bw / 2);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, bw, h);
        }
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyserRef]);

  return <canvas ref={canvasRef} width={280} height={36} className="h-9 flex-1" />;
}

interface Topic {
  title: string;
  reason: string;
}

type BranchOpt = { id: string; name: string; naverBlogUrl: string | null; imwebUrl: string | null };

export default function WriteStudio({
  branches,
  needsBranchPick,
}: {
  branches: BranchOpt[];
  needsBranchPick: boolean; // 본사: 글 쓸 지점을 직접 골라야 함
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState<string>(needsBranchPick ? '' : branches[0]?.id ?? '');
  const selectedBranch = branches.find((b) => b.id === branchId) ?? null;
  const naverBlogUrl = selectedBranch?.naverBlogUrl ?? null;
  const imwebUrl = selectedBranch?.imwebUrl ?? null;
  const [chips, setChips] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topic, setTopic] = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function teardownAudio() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function toggleChip(c: string) {
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = RECORD_MIMES.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        teardownAudio();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || 'audio/webm' });
        await transcribe(blob);
      };

      // 실시간 파형용 오디오 분석기
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      recorder.start();
      recorderRef.current = recorder;
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setRecording(true);
    } catch {
      setError('마이크를 쓸 수 없어요. 브라우저 권한을 확인해주세요');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    setError('');
    try {
      const audio = await blobToBase64(blob);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio, mime_type: blob.type.split(';')[0] || 'audio/webm' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '녹음 변환 실패');
      if (data.text) setNotes((prev) => (prev.trim() ? prev.trimEnd() + ' ' : '') + data.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  }

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 2);
    setPhotos(files);
  }

  async function getTopics() {
    setLoadingTopics(true);
    setError('');
    try {
      const res = await fetch('/api/recommend-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ treatment_chips: chips, user_notes: notes, branch_id: branchId }),
      });
      const data = await res.json();
      setTopics(data.topics || []);
      if (data.topics?.[0]) setTopic(data.topics[0].title);
    } catch {
      setError('추천 주제를 못 불러왔어요');
    } finally {
      setLoadingTopics(false);
    }
  }

  async function generate() {
    if (needsBranchPick && !branchId) {
      setError('어느 지점으로 쓸지 골라주세요');
      return;
    }
    if (!topic) {
      setError('주제를 골라주세요');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommended_topic: topic, treatment_chips: chips, user_notes: notes, branch_id: branchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setPost(data.post);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function publish(target: 'naver' | 'imweb') {
    if (!post) return;
    // 1) 본문 복사
    const text = [post.title, '', post.content, '', (post.tags || []).map((t) => `#${t}`).join(' ')].join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 클립보드 거부 시 무시 */
    }
    // 2) 사진 갤러리에 저장(다운로드)
    photos.forEach((f, i) => {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${post.title || 'photo'}-${i + 1}.${f.name.split('.').pop() || 'jpg'}`;
      a.click();
      URL.revokeObjectURL(url);
    });
    // 3) 발행 상태 기록
    await fetch('/api/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, action: 'publish', publish_target: target }),
    });
    // 4) 발행처 열기 + 조회수 입력 화면으로
    const url = target === 'naver' ? naverBlogUrl : imwebUrl;
    if (url) window.open(url, '_blank');
    router.push(`/track/${post.id}`);
  }

  return (
    <div className="py-6 md:py-0">
      <h1 className="mb-6 text-2xl font-bold">오늘 글쓰기</h1>

      {needsBranchPick && (
        <div className="mb-6">
          <p className="label">어느 지점으로 쓸까요?</p>
          <select className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">지점 선택</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* 좌측: 입력 */}
        <section className="space-y-6">
          <div>
            <p className="label">어떤 시술 했어요?</p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button key={c} onClick={() => toggleChip(c)} className={`chip ${chips.includes(c) ? 'chip-on' : ''}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label">기록</p>
            {recording ? (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-brand bg-brand-wash px-4 py-3">
                <MicWave analyserRef={analyserRef} />
                <span className="tabular-nums text-sm font-semibold text-brand">{fmtTime(elapsed)}</span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-ink"
                >
                  <Square size={16} fill="currentColor" /> 완료
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={transcribing}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-brand bg-brand-wash px-4 py-3.5 text-base font-semibold text-brand disabled:opacity-50"
              >
                {transcribing ? '받아쓰는 중…' : <><Mic size={20} /> 말로 쉽게 설명하기</>}
              </button>
            )}
            <textarea
              className="field min-h-28 resize-none"
              placeholder="손상 심한데 결 살아난 케이스, 고객님 만족… (위 버튼으로 말로 설명해도 돼요)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {recording && <p className="mt-1 text-sm text-brand">듣고 있어요… 다 말하면 "완료"를 눌러주세요</p>}
          </div>

          <div>
            <p className="label">사진 (1~2장)</p>
            <div className="flex gap-3">
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-line bg-surface text-ink-faint">
                <Camera size={24} />
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickPhotos} />
              </label>
              {photos.map((f, i) => (
                <img
                  key={i}
                  src={URL.createObjectURL(f)}
                  alt=""
                  className="h-20 w-20 rounded-2xl object-cover"
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label mb-0">추천 주제</p>
              <button onClick={getTopics} className="flex items-center gap-1 text-sm font-medium text-brand" disabled={loadingTopics}>
                {loadingTopics ? '불러오는 중…' : <>추천 받기 <RotateCw size={14} /></>}
              </button>
            </div>
            <div className="space-y-2">
              {topics.length === 0 && (
                <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-ink-faint">
                  시술/기록을 적고 "추천 받기"를 눌러보세요
                </p>
              )}
              {topics.map((t) => (
                <button
                  key={t.title}
                  onClick={() => setTopic(t.title)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left ${
                    topic === t.title ? 'border-brand bg-brand-wash' : 'border-line bg-surface'
                  }`}
                >
                  <span className="block font-semibold">{t.title}</span>
                  <span className="block text-sm text-ink-soft">{t.reason}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary" onClick={generate} disabled={generating || !topic}>
            {generating ? 'AI가 글 쓰는 중…' : '이 주제로 글쓰기'}
          </button>
          {error && <p className="text-sm text-warn">{error}</p>}
        </section>

        {/* 우측: AI 초안 */}
        <section>
          <div className="card min-h-[24rem]">
            {!post ? (
              <div className="flex h-full min-h-[20rem] flex-col items-center justify-center text-center text-ink-faint">
                <PenLine size={36} />
                <p className="mt-3 text-sm">왼쪽에서 주제를 고르면
                  <br />AI 초안이 여기 나타나요</p>
              </div>
            ) : (
              <DraftView post={post} onRewrite={generate} rewriting={generating} />
            )}
          </div>
        </section>
      </div>

      {/* 하단: 발행 (반자동 복붙) */}
      {post && (
        <div className="mt-6 flex flex-col items-stretch gap-3 border-t border-line pt-5 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-ink-soft">올린 뒤 붙여넣기만 하면 돼요</p>
          <div className="flex gap-3">
            {imwebUrl && (
              <button className="btn-ghost md:w-auto md:px-6" onClick={() => publish('imweb')}>
                아임웹 열기
              </button>
            )}
            <button className="btn-primary md:w-auto md:px-6" onClick={() => publish('naver')}>
              네이버 블로그 열기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftView({ post, onRewrite, rewriting }: { post: Post; onRewrite: () => void; rewriting: boolean }) {
  const guideByPos = new Map<number, PhotoGuideItem>();
  (post.photo_guide || []).forEach((g) => guideByPos.set(g.position, g));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">AI 초안</span>
        <button onClick={onRewrite} className="flex items-center gap-1 text-sm font-medium text-brand" disabled={rewriting}>
          {rewriting ? '고쳐쓰는 중…' : <><Pencil size={14} /> 고쳐쓰기</>}
        </button>
      </div>
      <h2 className="text-lg font-bold leading-snug">{post.title}</h2>
      <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink">
        {(post.content || '').split('\n').map((line, i) => {
          const m = line.match(/^\[사진(\d+)\]\s*(.*)$/);
          if (m) {
            const pos = Number(m[1]);
            const g = guideByPos.get(pos);
            return (
              <div key={i} className="my-2 rounded-2xl bg-brand-wash px-4 py-3 text-sm text-brand">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Camera size={15} /> [사진{pos}] {g?.label || m[2]}
                </div>
                {g && (
                  <ul className="mt-1 space-y-0.5 text-brand/90">
                    {g.종류 && <li>· 종류: {g.종류}</li>}
                    {g.구도 && <li>· 구도: {g.구도}</li>}
                    {g.포인트 && <li>· 포인트: {g.포인트}</li>}
                  </ul>
                )}
              </div>
            );
          }
          if (!line.trim()) return <div key={i} className="h-1" />;
          return <p key={i}>{line}</p>;
        })}
      </div>
      {(post.tags || []).length > 0 && (
        <p className="mt-4 text-sm text-ink-faint">{(post.tags || []).map((t) => `#${t}`).join(' ')}</p>
      )}
    </div>
  );
}
