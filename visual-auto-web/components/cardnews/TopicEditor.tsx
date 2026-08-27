'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Sparkles, ExternalLink } from 'lucide-react';
import type { TopicItem } from '@/lib/contentCalendar';

/** 카드뉴스 주제 편성 프레임 6종 (은행 F1~F6 — docs/cardnews/07 참조) */
const FRAMES = ['F1 수치화', 'F2 랭킹', 'F3 비교', 'F4 최초·최고', 'F5 반전', 'F6 사건화'];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 카드뉴스 주제 편집 모달. 저장은 /api/cardnews-topics/{id} (PATCH) → router.refresh().
 * "이 주제로 만들기"는 /api/card-news 에 topic_id 로 초안 생성 후 스튜디오로 이동.
 */
export default function TopicEditor({ topic, onClose }: { topic: TopicItem; onClose: () => void }) {
  const router = useRouter();
  const [material, setMaterial] = useState(topic.material);
  const [frame, setFrame] = useState(topic.frame);
  const [factSeed, setFactSeed] = useState(topic.fact_seed ?? '');
  const [headline, setHeadline] = useState(topic.headline_draft ?? '');
  const [bubble, setBubble] = useState(topic.bubble ?? '');
  const [factConfirmed, setFactConfirmed] = useState(topic.fact_confirmed);
  const [status, setStatus] = useState<TopicItem['status']>(topic.status);
  const [referenceUrl, setReferenceUrl] = useState(topic.reference_url ?? '');
  const [memo, setMemo] = useState(topic.memo ?? '');
  const [busy, setBusy] = useState<'save' | 'delete' | 'create' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dow = WEEKDAYS[new Date(`${topic.topic_date}T00:00:00Z`).getUTCDay()];
  const [, m, d] = topic.topic_date.split('-');
  const factWarn = topic.verify_needed && !factConfirmed;

  async function save() {
    if (!material.trim()) {
      setError('소재를 입력해주세요');
      return;
    }
    setBusy('save');
    setError(null);
    const res = await fetch(`/api/cardnews-topics/${topic.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material: material.trim(),
        frame,
        fact_seed: factSeed.trim(),
        headline_draft: headline.trim(),
        bubble: bubble.trim(),
        fact_confirmed: factConfirmed,
        status,
        reference_url: referenceUrl.trim(),
        memo: memo.trim(),
      }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || '저장에 실패했어요');
      return;
    }
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!confirm('이 주제를 삭제할까요?\n(미래 날짜는 다음 날 자동 편성이 다시 채워요 — 비워두려면 "건너뜀"으로 저장하세요)')) return;
    setBusy('delete');
    const res = await fetch(`/api/cardnews-topics/${topic.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || '삭제에 실패했어요');
      return;
    }
    router.refresh();
    onClose();
  }

  async function makeCardNews() {
    if (topic.card_news_id) {
      router.push(`/card-news/${topic.card_news_id}`);
      return;
    }
    setBusy('create');
    setError(null);
    const res = await fetch('/api/card-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic_id: topic.id, card_count: 5 }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error || '카드뉴스 생성에 실패했어요');
      return;
    }
    router.push(`/card-news/${body.cardNews.id}`);
  }

  const field = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 md:items-center md:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-phone overflow-y-auto rounded-t-xl2 bg-surface p-5 shadow-card md:rounded-xl2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">
            {Number(m)}월 {Number(d)}일 ({dow}) 카드뉴스 주제
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-canvas">
            <X size={18} />
          </button>
        </div>

        {/* 편성 정보 (읽기전용) */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
          {topic.branchName && <span className="rounded bg-ok/15 px-1.5 py-0.5 font-semibold text-ok">{topic.branchName}</span>}
          {topic.section && <span className="rounded bg-canvas px-1.5 py-0.5">{topic.section}</span>}
          {topic.pool_label && <span className="rounded bg-canvas px-1.5 py-0.5">{topic.pool_label}</span>}
          {topic.live_slot && (
            <span className="rounded bg-brand-wash px-1.5 py-0.5 font-semibold text-brand">라이브 슬롯 — 신제품·트렌드로 교체 가능</span>
          )}
          {topic.entry_id && <span className="text-ink-faint">{topic.entry_id}</span>}
        </div>
        {topic.hint && <p className="mt-1.5 text-xs text-ink-faint">훅 힌트: {topic.hint}</p>}

        <div className="mt-4 space-y-3">
          <input className={field} placeholder="소재 (예: 린스 vs 트리트먼트)" value={material} onChange={(e) => setMaterial(e.target.value)} />

          <div className="grid grid-cols-2 gap-2">
            <select className={field} value={frame} onChange={(e) => setFrame(e.target.value)}>
              {!FRAMES.includes(frame) && frame && <option value={frame}>{frame}</option>}
              {FRAMES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select className={field} value={status} onChange={(e) => setStatus(e.target.value as TopicItem['status'])}>
              <option value="planned">예정</option>
              <option value="done">완료</option>
              <option value="skipped">건너뜀 (발행 안 함)</option>
            </select>
          </div>

          <textarea
            className={`${field} min-h-[3.5rem] resize-none`}
            placeholder="팩트 시드 — 카드가 근거로 삼을 사실 (수치·기전)"
            value={factSeed}
            onChange={(e) => setFactSeed(e.target.value)}
          />

          <input className={field} placeholder="헤드라인 초안 (선택 — 생성 시 표지 훅 후보로)" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          <input className={field} placeholder="말풍선 대사 (선택 — 팩트 당사자의 1인칭 유머)" value={bubble} onChange={(e) => setBubble(e.target.value)} />

          <div className="flex items-center gap-2">
            <input
              type="url"
              className={field}
              placeholder="레퍼런스 영상 링크 (인스타 릴스 URL 등, 선택)"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
            />
            {topic.reference_url && (
              <a
                href={topic.reference_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-xl border border-line p-2.5 text-ink-soft hover:border-brand hover:text-brand"
                aria-label="레퍼런스 영상 열기"
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>

          <label className={`flex items-center gap-2 text-sm ${factWarn ? 'text-warn' : 'text-ink-soft'}`}>
            <input type="checkbox" checked={factConfirmed} onChange={(e) => setFactConfirmed(e.target.checked)} className="h-4 w-4 accent-brand" />
            팩트 확인 완료
            {factWarn && <span className="text-xs font-semibold">⚠️ 수치 검증 필요 — 확정 전 발행 금지</span>}
          </label>

          <textarea className={`${field} min-h-[3rem] resize-none`} placeholder="메모" value={memo} onChange={(e) => setMemo(e.target.value)} />

          {error && <p className="text-sm text-warn">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button onClick={remove} disabled={busy !== null} className="text-sm font-medium text-warn disabled:opacity-50">
              삭제
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={makeCardNews}
                disabled={busy !== null || status === 'skipped'}
                className="flex items-center gap-1.5 rounded-2xl border border-brand px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50"
              >
                {topic.card_news_id ? (
                  <>
                    <ExternalLink size={14} /> 만든 카드뉴스 열기
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> {busy === 'create' ? '생성 중…' : '이 주제로 만들기'}
                  </>
                )}
              </button>
              <button
                onClick={save}
                disabled={busy !== null}
                className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
              >
                {busy === 'save' ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
