'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, RotateCw, PenLine, Pencil, Mic, Square, Trash2, Sparkles, Copy, LayoutGrid } from 'lucide-react';
import type { Post, PhotoGuideItem, PostPhoto } from '@/lib/types';
import { usePersistentState } from '@/lib/usePersistentState';
import MyNaverBlogField from './MyNaverBlogField';

// 지점(살롱)은 시술 칩, 글쓰기 전용 브랜드는 브랜드별 칩
const SALON_CHIPS = ['결마지', '펌', '염색', '클리닉', '컷'];
// "어디에 쓸까요?" 칩 노출 순서 (지점 블로그 다음)
const BRAND_ORDER = ['누혜', '아카데미', '비주얼살롱', '트리필드'];
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

/** 아임웹 글쓰기 딥링크에서 로그인 페이지 URL을 조립. 저장값이 비정상이면 null. */
function imwebLoginUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return `${new URL(url).origin}/?mode=login`;
  } catch {
    return null;
  }
}

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
  initialBranchId,
  canCardNews,
}: {
  branches: BranchOpt[];
  needsBranchPick: boolean; // 본사: 글 쓸 지점을 직접 골라야 함
  myNaverUrl: string | null; // 본인 개인 네이버 블로그 글쓰기 링크 (사람별)
  initialPost: Post | null; // 발행 안 한 최신 초안 — 새로고침해도 이어쓰기
  initialBranchId?: string | null; // 마지막으로 골랐던 지점/브랜드 (서버 기억)
  canCardNews?: boolean; // 카드뉴스 만들기 권한 (기본 본사만 — lib/flags.ts)
}) {
  const router = useRouter();
  const salons = branches.filter((b) => b.kind === 'salon');
  const brands = branches
    .filter((b) => b.kind === 'brand')
    .sort((a, b) => BRAND_ORDER.indexOf(a.name) - BRAND_ORDER.indexOf(b.name));
  const [branchId, setBranchId] = useState<string>(
    needsBranchPick ? initialBranchId ?? '' : branches[0]?.id ?? '',
  );
  const selectedBranch = branches.find((b) => b.id === branchId) ?? null;
  // "지점 블로그"를 눌렀지만 아직 어느 지점인지 안 고른 상태 (살롱이 여러 개일 때)
  const [salonScope, setSalonScope] = useState<boolean>(selectedBranch?.kind === 'salon');
  const chipSet = chipSetFor(selectedBranch);
  // 네이버는 개인별(본인 링크), 아임웹은 지점 공용
  const [naverUrl, setNaverUrl] = useState<string | null>(myNaverUrl);
  const imwebUrl = selectedBranch?.imwebUrl ?? null;
  const imwebLogin = imwebLoginUrl(imwebUrl);
  // 홈 화면 앱(standalone)에서는 아임웹 로그인 세션이 매번 끊길 수 있어 별도 안내
  const [isStandalone, setIsStandalone] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(!!standalone);
  }, []);
  // 새로고침해도 안 날아가게 자동 임시저장 (사진은 파일이라 제외)
  const [chips, setChips, clearChips] = usePersistentState<string[]>('va:write:chips', []);
  const [notes, setNotes, clearNotes] = usePersistentState<string>('va:write:notes', '');
  // 사진은 고르는 즉시 서버(post-photos)에 올라간다 — 새로고침 생존 + 카드뉴스에서 재사용
  const [photos, setPhotos, clearPhotos] = usePersistentState<PostPhoto[]>('va:write:photos', []);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [topics, setTopics, clearTopics] = usePersistentState<Topic[]>('va:write:topics', []);
  const [topic, setTopic, clearTopic] = usePersistentState<string>('va:write:topic', '');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState<Post | null>(initialPost);
  const [error, setError] = useState('');
  // 복사 결과 안내: 'ok' | 'fail' | '' (안내 없음)
  const [copyState, setCopyState] = useState<'' | 'ok' | 'fail'>('');
  // 연 발행처(복수 가능) — 같은 글을 아임웹·네이버 양쪽에 올릴 수 있다
  const [opened, setOpened] = useState<{ imweb: boolean; naver: boolean }>({ imweb: false, naver: false });
  const anyOpened = opened.imweb || opened.naver;
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function toggleChip(c: string) {
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function pickBranch(id: string) {
    setBranchId(id);
    setSalonScope((branches.find((b) => b.id === id) ?? null)?.kind !== 'brand');
    // 지점/브랜드가 바뀌면 새 칩셋에 없는 칩은 제거 (예: '결마지'가 아카데미 글에 안 넘어가게)
    const next = chipSetFor(branches.find((b) => b.id === id) ?? null);
    setChips((prev) => prev.filter((c) => next.includes(c)));
  }

  // "지점 블로그" 칩: 살롱이 하나면 바로 그 지점, 여러 개면 아래 2차 칩에서 고르게
  function pickSalonScope() {
    if (salons.length === 1) {
      pickBranch(salons[0].id);
      return;
    }
    setSalonScope(true);
    if (selectedBranch?.kind === 'brand') setBranchId('');
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

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 2);
    e.target.value = ''; // 같은 파일 다시 고를 수 있게 초기화
    if (!files.length) return;
    setUploadingPhotos(true);
    setError('');
    try {
      const uploaded: PostPhoto[] = [];
      for (const [i, f] of files.entries()) {
        const form = new FormData();
        form.append('photo', f);
        form.append('slot', String(i + 1));
        const res = await fetch('/api/upload-photo', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '사진 업로드 실패');
        uploaded.push({ slot: data.slot, storage_path: data.storage_path, url: data.url });
      }
      setPhotos(uploaded);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingPhotos(false);
    }
  }

  // 업로드된 사진을 사용자 갤러리에 저장(다운로드). a[download]는 크로스오리진에서 무시돼 blob으로.
  async function downloadPhotos(title: string | null) {
    for (const [i, p] of photos.entries()) {
      if (!p.url) continue;
      try {
        const blob = await fetch(p.url).then((r) => r.blob());
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title || 'photo'}-${i + 1}.${p.storage_path.split('.').pop() || 'jpg'}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        /* 사진 저장 실패는 발행을 막지 않는다 */
      }
    }
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
          photo_paths: photos.map((p) => ({ slot: p.slot, storage_path: p.storage_path })),
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

  const [creatingCards, setCreatingCards] = useState(false);

  // 초안 → 카드뉴스 에디터. 브랜드 모드(정보형/이미지형)는 서버가 프레임에서 정한다.
  async function toCardNews() {
    if (!post) return;
    setCreatingCards(true);
    setError('');
    try {
      const res = await fetch('/api/card-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '카드뉴스 생성 실패');
      router.push(`/card-news/${data.cardNews.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreatingCards(false);
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
    // 2) 사진 갤러리에 저장(다운로드) — 업로드된 사진(PostPhoto)을 받아서 저장
    await downloadPhotos(post.title);
    // 3) 이 발행처를 "열었음"으로 표시 (초안은 화면·DB에 그대로 유지). 다른 곳도 더 열 수 있다.
    setOpened((o) => ({ ...o, [target]: true }));
  }

  // Step 2: 붙여넣어 올린 뒤 "발행 완료" 클릭 → 연 발행처들 기록 + 초안 정리 + 조회수 화면
  async function confirmPublished() {
    if (!post || !anyOpened) return;
    const publish_targets = [
      ...(opened.imweb ? ['imweb'] : []),
      ...(opened.naver ? ['naver'] : []),
    ];
    await fetch('/api/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, action: 'publish', publish_targets }),
    });
    clearChips();
    clearNotes();
    clearTopics();
    clearTopic();
    clearPhotos();
    router.push(`/track/${post.id}`);
  }

  // 브랜드 글: "발행용 복사" — 본문 복사 + 사진 저장만. 담당자가 직접 브랜드 계정에 올린다.
  // (네이버/아임웹 자동 열기·발행 기록 없음 — 초안 상태로 남겨두고 복사만)
  async function copyForManual() {
    if (!post) return;
    const ok = await copyText(draftText());
    setCopyState(ok ? 'ok' : 'fail');
    await downloadPhotos(post.title);
  }

  return (
    <div className="py-6 md:py-0">
      <h1 className="mb-6 text-2xl font-bold">오늘 글쓰기</h1>

      {needsBranchPick && (
        <div className="mb-6">
          <p className="label">어디에 쓸까요?</p>
          <div className="flex flex-wrap gap-2">
            {salons.length > 0 && (
              <button
                onClick={pickSalonScope}
                className={`chip ${salonScope && selectedBranch?.kind !== 'brand' ? 'chip-on' : ''}`}
              >
                지점 블로그
              </button>
            )}
            {brands.map((b) => (
              <button key={b.id} onClick={() => pickBranch(b.id)} className={`chip ${branchId === b.id ? 'chip-on' : ''}`}>
                {b.name}
              </button>
            ))}
          </div>
          {salonScope && selectedBranch?.kind !== 'brand' && salons.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {salons.map((b) => (
                <button key={b.id} onClick={() => pickBranch(b.id)} className={`chip ${branchId === b.id ? 'chip-on' : ''}`}>
                  {b.name}
                </button>
              ))}
            </div>
          )}
          {selectedBranch && (
            <p className="mt-2 flex items-center gap-1 text-sm font-medium text-brand">
              <Sparkles size={14} /> {selectedBranch.name} 톤·지식으로 써드려요
            </p>
          )}
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
            <p className="label">사진 (여러 장 가능)</p>
            <div className="flex gap-3">
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-line bg-surface text-ink-faint">
                <Camera size={24} />
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickPhotos} />
              </label>
              {photos.map((p) => (
                <button
                  key={p.storage_path}
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((x) => x.storage_path !== p.storage_path))}
                  className="relative h-20 w-20 shrink-0"
                  title="탭하면 사진을 뺍니다"
                >
                  <img src={p.url} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                  <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white">✕</span>
                </button>
              ))}
            </div>
            {uploadingPhotos && <p className="mt-1 text-sm text-ink-faint">사진 올리는 중…</p>}
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
      {post && selectedBranch?.kind === 'brand' && (
        <div className="mt-6 flex flex-col items-stretch gap-3 border-t border-line pt-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-ink-soft">복사한 글을 {selectedBranch.name} 계정에 붙여넣어 주세요</p>
            {copyState === 'ok' && <p className="mt-0.5 text-xs font-medium text-brand">복사됐어요! 붙여넣기(길게 눌러 붙여넣기) 하면 돼요</p>}
            {copyState === 'fail' && <p className="mt-0.5 text-xs font-medium text-warn">복사가 안 되는 브라우저예요. 글을 길게 눌러 직접 복사해주세요</p>}
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <button className="btn-ghost md:w-auto md:px-6" onClick={copyForManual} type="button">
              <span className="flex items-center justify-center gap-1.5"><Copy size={16} /> 발행용 복사</span>
            </button>
            {canCardNews && (
              <button className="btn-primary md:w-auto md:px-6" onClick={toCardNews} disabled={creatingCards}>
                <span className="flex items-center justify-center gap-1.5">
                  <LayoutGrid size={16} /> {creatingCards ? '카드 구성 중…' : '카드뉴스로'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
      {post && selectedBranch?.kind !== 'brand' && (
        <div className="mt-6 space-y-4 border-t border-line pt-5">
          {/* 본문 복사 + 발행처 열기 — 아임웹·네이버 양쪽 다 열 수 있다 */}
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-ink-soft">올릴 곳을 누르면 본문이 자동 복사돼요. 양쪽에 올리려면 두 곳 다 누르세요.</p>
              {copyState === 'ok' && <p className="mt-0.5 text-xs font-medium text-brand">복사됐어요! 붙여넣기(길게 눌러 붙여넣기) 하면 돼요</p>}
              {copyState === 'fail' && <p className="mt-0.5 text-xs font-medium text-warn">복사가 안 되는 브라우저예요. 글을 길게 눌러 직접 복사해주세요</p>}
              {imwebUrl && (
                <p className="mt-1 text-xs text-ink-faint">
                  아임웹은 처음에 먼저 로그인(로그인 유지 체크)해야 글쓰기가 열려요.
                  {isStandalone && ' 홈 화면 앱에서는 로그인이 매번 필요할 수 있어요 — 사파리/크롬 주소창으로 열면 로그인이 유지돼요.'}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              {canCardNews && (
                <button className="btn-ghost md:w-auto md:px-6" onClick={toCardNews} disabled={creatingCards} type="button">
                  <span className="flex items-center justify-center gap-1.5">
                    <LayoutGrid size={16} /> {creatingCards ? '카드 구성 중…' : '카드뉴스로'}
                  </span>
                </button>
              )}
              <button className="btn-ghost md:w-auto md:px-6" onClick={handleCopy} type="button">
                본문 복사
              </button>
              {imwebUrl && (
                <div className="flex flex-col items-stretch gap-1 md:items-start">
                  <a
                    className={`btn-ghost inline-flex items-center justify-center gap-1 md:w-auto md:px-6 ${opened.imweb ? 'border-brand text-brand' : ''}`}
                    href={imwebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => openTarget('imweb')}
                  >
                    아임웹 글쓰기 열기{opened.imweb ? ' ✓' : ''}
                  </a>
                  {imwebLogin && (
                    <a
                      className="text-xs text-ink-faint underline"
                      href={imwebLogin}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      안 열리면 → 아임웹 로그인
                    </a>
                  )}
                </div>
              )}
              <MyNaverBlogField
                initialUrl={naverUrl}
                onChange={setNaverUrl}
                onOpen={() => openTarget('naver')}
                opened={opened.naver}
              />
            </div>
          </div>

          {/* 붙여넣어 올린 뒤 발행 확정 — 한 곳이라도 열면 나타난다 */}
          {anyOpened && (
            <div className="flex flex-col items-stretch gap-3 rounded-2xl bg-brand-wash p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-ink">
                  {[opened.imweb ? '아임웹' : null, opened.naver ? '네이버 블로그' : null].filter(Boolean).join('·')}에 붙여넣어 올리셨나요?
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  다 올렸으면 "발행 완료"를 눌러주세요. 창이 닫혔으면 위 버튼으로 다시 열면 돼요 — 글은 안 날아가요. (한 곳 더 올릴 거면 그 버튼도 눌러요)
                </p>
              </div>
              <button className="btn-primary md:w-auto md:px-6" onClick={confirmPublished} type="button">
                네, 발행 완료
              </button>
            </div>
          )}
        </div>
      )}
      {post && canCardNews && (
        <p className="mt-2 text-xs text-ink-faint md:text-right">카드는 브랜드에 맞는 스타일로 만들어져요</p>
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
