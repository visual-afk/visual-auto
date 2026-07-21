'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, RotateCw, PenLine, Pencil, Mic, Square, Trash2 } from 'lucide-react';
import type { Post, PhotoGuideItem } from '@/lib/types';
import { usePersistentState } from '@/lib/usePersistentState';
import MyNaverBlogField from './MyNaverBlogField';

// 지점(살롱)은 시술 칩, 글쓰기 전용 브랜드는 브랜드별 칩
const SALON_CHIPS = ['결마지', '펌', '염색', '클리닉', '컷'];
const BRAND_CHIPS: Record<string, string[]> = {
  아카데미: ['수강후기', '커리큘럼', '원데이클래스', '수료생'],
  트리필드: ['제품 소개', '사용 후기', '이벤트', '브랜드 스토리'],
  누혜: ['제품 소개', '사용 후기', '이벤트', '브랜드 스토리'],
  비주얼살롱: ['브랜드 소식', '지점 오픈', '이벤트', '교육/세미나'],
};

function chipSetFor(branch: BranchOpt | null): string[] {
  if (!branch || branch.kind !== 'brand') return SALON_CHIPS;
  return BRAND_CHIPS[branch.name] ?? [];
}

const RECORD_MIMES = ['audio/webm', 'audio/mp4', 'audio/ogg'];

/** 본문을 클립보드에 복사. 인앱 브라우저/비보안 컨텍스트에서는 execCommand로 폴백. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 폴백으로 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface Topic {
  title: string;
  reason: string;
}

type BranchOpt = {
  id: string;
  name: string;
  kind: 'salon' | 'brand'; // brand = 글쓰기 전용 (아카데미/트리필드/누혜/비주얼살롱)
  naverBlogUrl: string | null;
  imwebUrl: string | null;
};

export default function WriteStudio({
  branches,
  needsBranchPick,
  myNaverUrl,
  initialPost,
}: {
  branches: BranchOpt[];
  needsBranchPick: boolean; // 본사: 글 쓸 지점을 직접 골라야 함
  myNaverUrl: string | null; // 본인 개인 네이버 블로그 글쓰기 링크 (사람별)
  initialPost: Post | null; // 발행 안 한 최신 초안 — 새로고침해도 이어쓰기
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState<string>(needsBranchPick ? '' : branches[0]?.id ?? '');
  const selectedBranch = branches.find((b) => b.id === branchId) ?? null;
  const chipSet = chipSetFor(selectedBranch);
  // 네이버는 개인별(본인 링크), 아임웹은 지점 공용
  const [naverUrl, setNaverUrl] = useState<string | null>(myNaverUrl);
  const imwebUrl = selectedBranch?.imwebUrl ?? null;
  // 새로고침해도 안 날아가게 자동 임시저장 (사진은 파일이라 제외)
  const [chips, setChips, clearChips] = usePersistentState<string[]>('va:write:chips', []);
  const [notes, setNotes, clearNotes] = usePersistentState<string>('va:write:notes', '');
  const [photos, setPhotos] = useState<File[]>([]);
  const [topics, setTopics, clearTopics] = usePersistentState<Topic[]>('va:write:topics', []);
  const [topic, setTopic, clearTopic] = usePersistentState<string>('va:write:topic', '');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState<Post | null>(initialPost);
  const [error, setError] = useState('');
  // 복사 결과 안내: 'ok' | 'fail' | '' (안내 없음)
  const [copyState, setCopyState] = useState<'' | 'ok' | 'fail'>('');
  // 발행처를 연 뒤(붙여넣기 완료 확인 대기) 상태
  const [openedTarget, setOpenedTarget] = useState<'naver' | 'imweb' | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function toggleChip(c: string) {
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function pickBranch(id: string) {
    setBranchId(id);
    // 지점/브랜드가 바뀌면 새 칩셋에 없는 칩은 제거 (예: '결마지'가 아카데미 글에 안 넘어가게)
    const next = chipSetFor(branches.find((b) => b.id === id) ?? null);
    setChips((prev) => prev.filter((c) => next.includes(c)));
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
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || 'audio/webm' });
        await transcribe(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
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
        body: JSON.stringify({
          recommended_topic: topic,
          treatment_chips: chips,
          user_notes: notes,
          branch_id: branchId,
          post_id: post?.id, // 초안이 있으면 덮어쓰기 — 유령 초안이 쌓이지 않게
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 덮어쓸 초안이 이미 지워진 경우: 다음 시도는 새 글로
        if (res.status === 400 && post) setPost(null);
        throw new Error(data.error || '생성 실패');
      }
      setPost(data.post);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function discard() {
    if (!post) return;
    if (!window.confirm('이 초안을 버릴까요? 되돌릴 수 없어요.')) return;
    const res = await fetch('/api/posts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id }),
    });
    if (res.ok) {
      setPost(null);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || '초안을 못 지웠어요');
    }
  }

  function draftText(): string {
    if (!post) return '';
    return [post.title, '', post.content, '', (post.tags || []).map((t) => `#${t}`).join(' ')].join('\n');
  }

  // "본문 복사" 버튼 — 직접 클릭 제스처로 복사하고 결과를 눈에 보이게 안내
  async function handleCopy() {
    const ok = await copyText(draftText());
    setCopyState(ok ? 'ok' : 'fail');
    if (ok) window.setTimeout(() => setCopyState(''), 3000);
  }

  // Step 1: 발행처 열기 = 본문 복사 + 사진 저장만. DB/이동은 건드리지 않는다.
  // (앵커 네비게이션이 실제 열기를 담당하므로 여기서 window.open은 하지 않는다)
  async function openTarget(target: 'naver' | 'imweb') {
    if (!post) return;
    // 1) 본문 복사 (실패해도 사용자가 "본문 복사" 버튼으로 재시도 가능)
    const ok = await copyText(draftText());
    setCopyState(ok ? 'ok' : 'fail');
    // 2) 사진 갤러리에 저장(다운로드)
    photos.forEach((f, i) => {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${post.title || 'photo'}-${i + 1}.${f.name.split('.').pop() || 'jpg'}`;
      a.click();
      URL.revokeObjectURL(url);
    });
    // 3) 붙여넣기 완료 확인 대기 상태로 전환 (초안은 화면·DB에 그대로 유지)
    setOpenedTarget(target);
  }

  // Step 2: 붙여넣어 올린 뒤 "발행 완료" 클릭 → 상태 기록 + 초안 정리 + 조회수 화면
  async function confirmPublished() {
    if (!post || !openedTarget) return;
    await fetch('/api/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, action: 'publish', publish_target: openedTarget }),
    });
    clearChips();
    clearNotes();
    clearTopics();
    clearTopic();
    router.push(`/track/${post.id}`);
  }

  return (
    <div className="py-6 md:py-0">
      <h1 className="mb-6 text-2xl font-bold">오늘 글쓰기</h1>

      {needsBranchPick && (
        <div className="mb-6">
          <p className="label">어느 지점으로 쓸까요?</p>
          <select className="field" value={branchId} onChange={(e) => pickBranch(e.target.value)}>
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
          {chipSet.length > 0 && (
            <div>
              <p className="label">{selectedBranch?.kind === 'brand' ? '어떤 내용이에요?' : '어떤 시술 했어요?'}</p>
              <div className="flex flex-wrap gap-2">
                {chipSet.map((c) => (
                  <button key={c} onClick={() => toggleChip(c)} className={`chip ${chips.includes(c) ? 'chip-on' : ''}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="label">기록</p>
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing}
              className={`mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-base font-semibold disabled:opacity-50 ${
                recording ? 'border-warn bg-warn/10 text-warn' : 'border-brand bg-brand-wash text-brand'
              }`}
            >
              {transcribing ? (
                '받아쓰는 중…'
              ) : recording ? (
                <><Square size={20} fill="currentColor" /> 다 말했어요 (멈추기)</>
              ) : (
                <><Mic size={20} /> 말로 쉽게 설명하기</>
              )}
            </button>
            <textarea
              className="field min-h-28 resize-none"
              placeholder="손상 심한데 결 살아난 케이스, 고객님 만족… (위 버튼으로 말로 설명해도 돼요)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {recording && <p className="mt-1 text-sm text-warn">● 듣고 있어요… 다 말하면 "다 말했어요"를 눌러주세요</p>}
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
          <p className="text-xs text-ink-faint">작성 중인 내용은 자동 저장돼요. 새로고침해도 그대로 있어요.</p>
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
              <DraftView post={post} onRewrite={generate} onDiscard={discard} rewriting={generating} />
            )}
          </div>
        </section>
      </div>

      {/* 하단: 발행 (반자동 복붙) */}
      {post && (
        <div className="mt-6 border-t border-line pt-5">
          {openedTarget ? (
            // Step 2: 붙여넣어 올린 뒤 발행 확정
            <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-ink">
                  {openedTarget === 'imweb' ? '아임웹' : '네이버 블로그'}에 붙여넣어 올리셨나요?
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  아직 안 올렸으면 이 화면 그대로 두세요. 글은 그대로 있어요.
                </p>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <button className="btn-ghost md:w-auto md:px-6" onClick={handleCopy} type="button">
                  본문 다시 복사
                </button>
                <button className="btn-primary md:w-auto md:px-6" onClick={confirmPublished} type="button">
                  네, 발행 완료
                </button>
              </div>
            </div>
          ) : (
            // Step 1: 본문 복사 + 발행처 열기
            <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-ink-soft">열면 본문이 자동 복사돼요. 안 되면 "본문 복사"를 눌러주세요</p>
                {copyState === 'ok' && <p className="mt-0.5 text-xs font-medium text-brand">복사됐어요! 붙여넣기(길게 눌러 붙여넣기) 하면 돼요</p>}
                {copyState === 'fail' && <p className="mt-0.5 text-xs font-medium text-warn">복사가 안 되는 브라우저예요. 글을 길게 눌러 직접 복사해주세요</p>}
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <button className="btn-ghost md:w-auto md:px-6" onClick={handleCopy} type="button">
                  본문 복사
                </button>
                {imwebUrl && (
                  <a
                    className="btn-ghost inline-flex items-center justify-center md:w-auto md:px-6"
                    href={imwebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => openTarget('imweb')}
                  >
                    아임웹 열기
                  </a>
                )}
                <MyNaverBlogField
                  initialUrl={naverUrl}
                  onChange={setNaverUrl}
                  onOpen={() => openTarget('naver')}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DraftView({
  post,
  onRewrite,
  onDiscard,
  rewriting,
}: {
  post: Post;
  onRewrite: () => void;
  onDiscard: () => void;
  rewriting: boolean;
}) {
  const guideByPos = new Map<number, PhotoGuideItem>();
  (post.photo_guide || []).forEach((g) => guideByPos.set(g.position, g));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">AI 초안</span>
        <div className="flex items-center gap-4">
          <button onClick={onDiscard} className="flex items-center gap-1 text-sm font-medium text-warn" disabled={rewriting}>
            <Trash2 size={14} /> 버리기
          </button>
          <button onClick={onRewrite} className="flex items-center gap-1 text-sm font-medium text-brand" disabled={rewriting}>
            {rewriting ? '고쳐쓰는 중…' : <><Pencil size={14} /> 고쳐쓰기</>}
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
