'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TOPIC_STATUS_LABEL, type TopicStatus } from '@/lib/contentCalendar';

type Brand = { id: string; name: string };

/** 캘린더 편성 주제 중 이 화면에서 고르는 데 필요한 필드만 */
export type TopicPick = {
  id: string;
  branch_id: string;
  topic_date: string; // YYYY-MM-DD
  material: string;
  headline_draft: string | null;
  status: string;
  card_news_id: string | null;
  verify_needed: boolean;
  fact_confirmed: boolean;
  branchName: string;
};

const WEEKDAY = '일월화수목금토';

function fmtTopicDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`;
}

/**
 * 주제로 카드뉴스 만들기 — 직접 입력 또는 콘텐츠 캘린더 편성 주제 선택.
 * 직접: POST /api/card-news { branch_id, topic, card_count }
 * 캘린더: POST /api/card-news { topic_id, card_count } (이미 만든 주제면 해당 카드뉴스 열기)
 */
export default function NewFromTopic({
  brands,
  topics = [],
  today = '',
}: {
  brands: Brand[];
  topics?: TopicPick[];
  today?: string;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(brands[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TopicPick | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [allBrands, setAllBrands] = useState(false);

  const visibleTopics = useMemo(
    () => (allBrands ? topics : topics.filter((t) => t.branch_id === branchId)),
    [topics, allBrands, branchId],
  );

  function pickTopic(t: TopicPick) {
    setSelected(t);
    setBranchId(t.branch_id);
    setError('');
  }

  async function create() {
    if (busy) return;
    // 이미 만든 캘린더 주제 → 만들어둔 카드뉴스 열기
    if (selected?.card_news_id) {
      router.push(`/card-news/${selected.card_news_id}`);
      return;
    }
    if (!selected && (!branchId || !topic.trim())) return;
    setBusy(true);
    setError('');
    try {
      const body = selected
        ? { topic_id: selected.id, card_count: count }
        : { branch_id: branchId, topic: topic.trim(), card_count: count };
      const res = await fetch('/api/card-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      router.push(`/card-news/${data.cardNews.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (brands.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-semibold">주제로 카드뉴스 만들기</p>
      <div className="flex flex-col gap-2 md:flex-row">
        <select
          className="field md:w-36 disabled:opacity-60"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          disabled={selected !== null}
          aria-label="브랜드"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {selected ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-brand bg-brand-wash px-3 py-2">
            <span className="shrink-0 text-xs font-semibold text-brand">{fmtTopicDate(selected.topic_date)}</span>
            <span className="min-w-0 truncate text-sm">{selected.headline_draft?.trim() || selected.material}</span>
            <button
              onClick={() => setSelected(null)}
              className="ml-auto shrink-0 text-xs font-semibold text-ink-soft"
              aria-label="선택 해제"
            >
              ✕ 직접 입력
            </button>
          </div>
        ) : (
          <input
            className="field flex-1"
            placeholder="예: 새치, 뽑으면 두 개 나요?"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
        )}
        <select
          className="field md:w-24"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="카드 장수"
        >
          {[3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n}장
            </option>
          ))}
        </select>
        <button
          onClick={create}
          disabled={busy || (!selected && !topic.trim())}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
        >
          {selected?.card_news_id ? '열기' : busy ? '만드는 중…' : '만들기'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-ink-faint">브랜드 컨셉에 맞춰 정보형 카드(표지·포인트·CTA)가 자동 생성돼요.</p>

      {topics.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setListOpen((v) => !v)}
              className="text-sm font-semibold text-brand"
            >
              {listOpen ? '▾' : '▸'} 콘텐츠 캘린더에서 가져오기
              <span className="ml-1.5 rounded-full bg-brand-wash px-2 py-0.5 text-[11px] text-brand">
                {visibleTopics.length}
              </span>
            </button>
            {listOpen && (
              <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={allBrands}
                  onChange={(e) => setAllBrands(e.target.checked)}
                />
                전체 브랜드 보기
              </label>
            )}
          </div>
          {listOpen && (
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
              {visibleTopics.length === 0 && (
                <li className="px-2 py-3 text-center text-xs text-ink-faint">
                  이 브랜드에는 편성된 주제가 없어요 — 전체 브랜드 보기를 켜보세요.
                </li>
              )}
              {visibleTopics.map((t) => {
                const isSelected = selected?.id === t.id;
                const needsCheck = t.verify_needed && !t.fact_confirmed;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => pickTopic(t)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                        isSelected ? 'bg-brand-wash' : 'hover:bg-brand-wash/50'
                      }`}
                    >
                      <span
                        className={`w-14 shrink-0 text-xs ${t.topic_date === today ? 'font-bold text-brand' : 'text-ink-soft'}`}
                      >
                        {t.topic_date === today ? '오늘' : fmtTopicDate(t.topic_date)}
                      </span>
                      {allBrands && <span className="shrink-0 text-xs text-ink-soft">{t.branchName}</span>}
                      <span className="min-w-0 flex-1 truncate">{t.headline_draft?.trim() || t.material}</span>
                      {needsCheck && <span className="shrink-0 text-[11px] font-semibold text-amber-600">확인필요</span>}
                      {t.card_news_id ? (
                        <span className="shrink-0 rounded-full bg-brand-wash px-2 py-0.5 text-[11px] font-semibold text-brand">
                          만듦
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-ink-faint">
                          {TOPIC_STATUS_LABEL[t.status as TopicStatus] ?? t.status}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
