'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, RotateCw, PenLine, Pencil, Mic, Square, Copy, Check, Save, Eye } from 'lucide-react';
import type { Post, PhotoGuideItem } from '@/lib/types';
import MyNaverBlogField from './MyNaverBlogField';

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

/** 붙여넣기용 텍스트 — 제목 + 본문 + 해시태그 */
function buildPostText(post: Post): string {
  return [post.title, '', post.content, '', (post.tags || []).map((t) => `#${t}`).join(' ')].join('\n');
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
  myNaverUrl,
  initialPost,
}: {
  branches: BranchOpt[];
  needsBranchPick: boolean; // 본사: 글 쓸 지점을 직접 골라야 함
  myNaverUrl: string | null; // 본인 개인 네이버 블로그 글쓰기 링크 (사람별)
  initialPost?: Post | null; // 임시저장 글 다시 열기 (홈 '지난 글' → /write?post=)
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState<string>(
    initialPost?.branch_id ?? (needsBranchPick ? '' : branches[0]?.id ?? ''),
  );
  const selectedBranch = branches.find((b) => b.id === branchId) ?? null;
  // 네이버는 개인별(본인 링크), 아임웹은 지점 공용
  const [naverUrl, setNaverUrl] = useState<string | null>(myNaverUrl);
  const imwebUrl = selectedBranch?.imwebUrl ?? null;
  const [chips, setChips] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topic, setTopic] = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState<Post | null>(initialPost ?? null);
  const [reviewed, setReviewed] = useState(false); // 검토 후 1단어 이상 고쳤는지 (발행 게이트)
  const [published, setPublished] = useState(false); // 발행 버튼 눌러 블로그 연 뒤
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [streamContent, setStreamContent] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
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
    abortRef.current?.abort(); // 진행 중인 생성이 있으면 취소
    const ac = new AbortController();
    abortRef.current = ac;
    setGenerating(true);
    setError('');
    setPost(null);
    setReviewed(false); // 새로 쓰면 다시 검토 필요
    setPublished(false);
    setStreamContent('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommended_topic: topic, treatment_chips: chips, user_notes: notes, branch_id: branchId }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '생성 실패');
      }
      // NDJSON 스트림 읽기 — 토큰을 받는 즉시 화면에 흘림
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: { type: string; text?: string; post?: Post; error?: string };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === 'token' && msg.text) {
            setStreamContent((c) => c + msg.text);
          } else if (msg.type === 'done' && msg.post) {
            setPost(msg.post);
          } else if (msg.type === 'error') {
            setError(msg.error || '생성 실패');
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  // 글을 절대 잃지 않게 — 언제든 눌러서 복사 (제목 + 본문 + 해시태그)
  async function copyPost() {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(buildPostText(post));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사가 안 됐어요. 글을 직접 드래그해서 복사해 주세요.');
    }
  }

  // 검토 편집 — 수정 내용을 즉시 상위 post에 반영(복사·발행이 수정본을 쓰도록) + 발행 게이트 해제
  function onEdit(title: string, content: string, changed: boolean) {
    setPost((p) => (p ? { ...p, title, content } : p));
    if (changed) setReviewed(true);
  }

  // 임시저장 — 수정본을 DB에 저장(status는 draft 유지)
  async function saveDraft(title: string, content: string) {
    if (!post) return;
    const res = await fetch('/api/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, title, content, tags: post.tags }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.post) setPost(data.post);
    else if (!res.ok) throw new Error(data.error || '저장 실패');
  }

  function publish(target: 'naver' | 'imweb') {
    if (!post) return;
    const url = target === 'naver' ? naverUrl : imwebUrl;
    // 1) 새 탭 먼저 연다 — await 이전(사용자 클릭 제스처 안)이라 팝업 차단이 안 걸린다
    const win = url ? window.open(url, '_blank') : null;
    // 2) 본문 복사 (붙여넣기용)
    copyPost();
    // 3) 사진 갤러리에 저장(다운로드) — 다시 연 글은 로컬 사진이 없어 자연히 스킵
    photos.forEach((f, i) => {
      const objectUrl = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${post.title || 'photo'}-${i + 1}.${f.name.split('.').pop() || 'jpg'}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    });
    // 4) 발행 상태 기록 (백그라운드 — 화면은 그대로 유지, 자동 이동 없음)
    fetch('/api/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, action: 'publish', publish_target: target }),
    }).catch(() => {});
    setPublished(true);
    if (url && !win) {
      // 팝업이 차단된 경우: 아래 '복사하기'로 안내
      setError('새 탭이 안 열렸어요. 블로그를 직접 연 뒤 "복사하기"로 붙여넣어 주세요.');
    }
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
            {post ? (
              <DraftView post={post} onRewrite={generate} rewriting={generating} onEdit={onEdit} onSaveDraft={saveDraft} />
            ) : streamContent ? (
              <StreamingView content={streamContent} />
            ) : generating ? (
              <WritingPlaceholder />
            ) : (
              <div className="flex h-full min-h-[20rem] flex-col items-center justify-center text-center text-ink-faint">
                <PenLine size={36} />
                <p className="mt-3 text-sm">왼쪽에서 주제를 고르면
                  <br />AI 초안이 여기 나타나요</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 하단: 발행 (반자동 복붙) */}
      {post && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-ink-soft">
              {reviewed ? '올린 뒤 붙여넣기만 하면 돼요' : '먼저 검토하고 1단어 이상 고쳐야 발행할 수 있어요'}
            </p>
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              {/* 글을 절대 잃지 않게 — 언제든 복사 */}
              <button className="btn-ghost md:w-auto md:px-6" onClick={copyPost}>
                {copied ? (
                  <span className="inline-flex items-center gap-1.5"><Check size={16} /> 복사됨!</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5"><Copy size={16} /> 복사하기</span>
                )}
              </button>
              {imwebUrl && (
                <button
                  className="btn-ghost md:w-auto md:px-6 disabled:opacity-40"
                  onClick={() => publish('imweb')}
                  disabled={!reviewed}
                >
                  아임웹 열기
                </button>
              )}
              <MyNaverBlogField
                initialUrl={naverUrl}
                onChange={setNaverUrl}
                onOpen={() => publish('naver')}
                disabled={!reviewed}
              />
            </div>
          </div>

          {/* 발행 후 — 화면은 유지, 조회수 입력은 사용자가 원할 때 */}
          {published && post && (
            <div className="mt-4 flex flex-col items-stretch gap-2 rounded-2xl bg-brand-wash px-4 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-medium text-brand">새 탭에 붙여넣고 발행하셨나요? 글은 여기 그대로 있어요.</p>
              <Link href={`/track/${post.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand underline">
                <Eye size={15} /> 조회수 입력하러 가기 →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 생성 대기 중 — 오른쪽 패널이 "쓰는 중"으로 살아있게 */
function WritingPlaceholder() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-brand">
        <span className="inline-flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-brand" />
        </span>
        AI가 글을 쓰고 있어요…
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="h-5 w-2/3 animate-pulse rounded bg-line" />
        <div className="h-3 w-full animate-pulse rounded bg-line" />
        <div className="h-3 w-full animate-pulse rounded bg-line" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-line" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-line" />
      </div>
    </div>
  );
}

const CARET = '▍';

/** 스트리밍 중 — AI가 쓰는 즉시 흘러나오는 날(raw) 마크다운을 실시간 렌더 */
function StreamingView({ content }: { content: string }) {
  // 첫 줄 `# 제목` 분리 (아직 제목만 타이핑 중일 수도 있음)
  const nl = content.indexOf('\n');
  const firstLine = (nl === -1 ? content : content.slice(0, nl)).trim();
  const hasHeader = firstLine.startsWith('#');
  const title = hasHeader ? firstLine.replace(/^#+\s*/, '') : '';
  const rawBody = hasHeader ? (nl === -1 ? '' : content.slice(nl + 1)) : content;

  // 커서(▍)는 현재 타이핑되는 끝에 붙임
  const titleText = rawBody.trim() ? title : title + CARET;
  const bodyText = rawBody.trim() ? rawBody + CARET : '';

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-brand" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-brand">실시간으로 쓰는 중…</span>
      </div>
      {titleText.trim() && <h2 className="text-lg font-bold leading-snug">{titleText}</h2>}
      {bodyText && (
        <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink">
          {bodyText.split('\n').map((line, i) => {
            const t = line.trim();
            if (!t) return <div key={i} className="h-1" />;
            if (/^\[IMAGE\]/i.test(t)) {
              return (
                <div key={i} className="my-1 flex items-center gap-1.5 rounded-2xl bg-brand-wash px-4 py-2 text-sm font-semibold text-brand">
                  <Camera size={15} /> 사진 들어갈 자리
                </div>
              );
            }
            if (/^##\s+/.test(t)) return <p key={i} className="pt-2 text-base font-bold">{t.replace(/^#+\s*/, '')}</p>;
            if (/^###\s+/.test(t)) return <p key={i} className="pt-1 font-semibold">{t.replace(/^#+\s*/, '')}</p>;
            return <p key={i}>{line}</p>;
          })}
        </div>
      )}
    </div>
  );
}

function DraftView({
  post,
  onRewrite,
  rewriting,
  onEdit,
  onSaveDraft,
}: {
  post: Post;
  onRewrite: () => void;
  rewriting: boolean;
  onEdit: (title: string, content: string, changed: boolean) => void;
  onSaveDraft: (title: string, content: string) => Promise<void>;
}) {
  const guideByPos = new Map<number, PhotoGuideItem>();
  (post.photo_guide || []).forEach((g) => guideByPos.set(g.position, g));

  // 검토/편집 모드 — 진입 시점의 글을 원본(baseline)으로 잡고, 한 글자라도 달라지면 발행 게이트 해제
  const [editing, setEditing] = useState(false);
  const baseline = useRef({ title: post.title || '', content: post.content || '' });
  const [draftTitle, setDraftTitle] = useState(post.title || '');
  const [draftContent, setDraftContent] = useState(post.content || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function startReview() {
    baseline.current = { title: post.title || '', content: post.content || '' };
    setDraftTitle(post.title || '');
    setDraftContent(post.content || '');
    setEditing(true);
  }

  function applyChange(title: string, content: string) {
    setDraftTitle(title);
    setDraftContent(content);
    const changed = title !== baseline.current.title || content !== baseline.current.content;
    onEdit(title, content, changed);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSaveDraft(draftTitle, draftContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* 상위에서 에러 표시 */
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand">검토 중 — 1단어 이상 고쳐주세요</span>
          <button onClick={() => setEditing(false)} className="text-sm font-medium text-ink-soft">
            검토 완료
          </button>
        </div>
        <input
          className="field text-lg font-bold"
          value={draftTitle}
          onChange={(e) => applyChange(e.target.value, draftContent)}
          placeholder="제목"
        />
        <textarea
          className="field mt-3 min-h-[20rem] resize-y text-[15px] leading-relaxed"
          value={draftContent}
          onChange={(e) => applyChange(draftTitle, e.target.value)}
          placeholder="본문"
        />
        <div className="mt-3 flex gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-ghost flex-1 disabled:opacity-50">
            {saving ? '저장 중…' : saved ? <span className="inline-flex items-center justify-center gap-1.5"><Check size={16} /> 저장됨</span> : <span className="inline-flex items-center justify-center gap-1.5"><Save size={16} /> 임시저장</span>}
          </button>
          <button onClick={() => setEditing(false)} className="btn-primary flex-1">
            검토 완료
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">AI 초안</span>
        <div className="flex items-center gap-3">
          <button onClick={startReview} className="flex items-center gap-1 text-sm font-medium text-brand">
            <Pencil size={14} /> 검토하기
          </button>
          <button
            onClick={onRewrite}
            className="flex items-center gap-1 text-sm font-medium text-ink-soft"
            disabled={rewriting}
          >
            {rewriting ? '고쳐쓰는 중…' : <><RotateCw size={14} /> 고쳐쓰기</>}
          </button>
        </div>
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
