'use client';

import { useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTIONS = ['이번 달 이행률 어때?', '노출이 잘 나온 콘텐츠는?', '지난달보다 유입이 늘었어?'];

/**
 * 캘린더 AI 챗 (본사·원장 전용). 히스토리는 화면 상태로만 유지(영속 안 함).
 * 질문 → /api/calendar-chat → 리포트 숫자 기반 답변.
 */
export default function CalendarChat({ month, branchParam }: { month: string; branchParam: string }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    const nextTurns: ChatTurn[] = [...turns, { role: 'user', text: q }];
    setTurns(nextTurns);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));

    const res = await fetch('/api/calendar-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, month, branch_id: branchParam, history: turns.slice(-6) }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setTurns([
      ...nextTurns,
      { role: 'assistant', text: res.ok ? body.answer : body.error || '답변을 받지 못했어요. 다시 시도해 주세요.' },
    ]);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }));
  }

  return (
    <section className="rounded-xl2 border border-line bg-surface p-4">
      <h2 className="flex items-center gap-1.5 text-base font-bold">
        <Sparkles size={16} className="text-brand" /> 숫자에게 물어보기
      </h2>
      <p className="mt-0.5 text-xs text-ink-faint">
        이번 달 계획·노출·유입 데이터를 근거로 답해요. 대화는 저장되지 않아요.
      </p>

      {turns.length === 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-ink-soft hover:border-brand hover:text-brand"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div ref={listRef} className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                  t.role === 'user' ? 'bg-brand text-brand-ink' : 'bg-canvas text-ink'
                }`}
              >
                {t.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-canvas px-3.5 py-2.5 text-sm text-ink-faint">답변 작성 중…</div>
            </div>
          )}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 성수점 이번 달 발행이 왜 적어?"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-brand px-3.5 text-brand-ink disabled:opacity-40"
          aria-label="질문 보내기"
        >
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
