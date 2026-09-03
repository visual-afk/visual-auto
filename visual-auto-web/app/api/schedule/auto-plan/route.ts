import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
import { nextMonthStart } from '@/lib/contentCalendar';
import { callAI, loadFileSafeFor, loadBranchKnowledgeFor, parseJsonResponse } from '@/lib/generation/ai-client';
import { loadKeywordContext } from '@/lib/generation/keywords';

export const maxDuration = 60;

/**
 * 콘텐츠 캘린더 자동 기획: 주기(매일/평일/주3/주2/주1)로 날짜를 뽑고 AI가 날짜별 주제를 채운다.
 * 저장하지 않는다 — 월 기획 짜기(BulkPlanner) 행으로 돌려줘 사용자가 다듬은 뒤 /api/schedule/bulk 로 저장.
 * 이미 계획이 있는 날짜는 건너뛰고, 그 달의 기존 주제와 겹치지 않게 AI에 전달한다.
 */

const CADENCES = {
  daily: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  '3x': [1, 3, 5], // 월·수·금
  '2x': [2, 5], // 화·금
  '1x': [3], // 수
} as const;
export type Cadence = keyof typeof CADENCES;

/** month 안에서 from 이후(포함)의 주기 해당 날짜들 (KST 문자열 연산) */
function cadenceDates(month: string, from: string, cadence: Cadence): string[] {
  const wanted = new Set<number>(CADENCES[cadence]);
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= last; d++) {
    const str = `${month}-${String(d).padStart(2, '0')}`;
    if (str < from) continue;
    if (wanted.has(new Date(`${str}T00:00:00Z`).getUTCDay())) dates.push(str);
  }
  return dates;
}

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 기획할 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const branchId: string = body.branch_id;
  const month: string = body.month;
  const cadence: Cadence = (Object.keys(CADENCES) as Cadence[]).includes(body.cadence) ? body.cadence : '3x';
  if (!branchId || !canActOnBranch(member, branchId)) {
    return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
  }
  if (!/^\d{4}-\d{2}$/.test(month ?? '')) {
    return NextResponse.json({ error: '월 형식이 올바르지 않아요' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: branch } = await admin.from('branches').select('id, name').eq('id', branchId).maybeSingle();
  if (!branch) return NextResponse.json({ error: '지점을 찾을 수 없어요' }, { status: 404 });

  // 시작일: 이번 달이면 오늘부터, 다른 달이면 1일부터
  const today = kstTodayStr();
  const from = today.startsWith(month) ? today : `${month}-01`;
  const allDates = cadenceDates(month, from, cadence);
  if (allDates.length === 0) {
    return NextResponse.json({ error: '이 주기로 남은 날짜가 없어요 (다음 달로 넘겨보세요)' }, { status: 400 });
  }

  // 이미 계획이 있는 날짜는 제외, 기존 주제는 중복 방지용으로 AI에 전달
  const { data: existing } = await admin
    .from('content_schedule')
    .select('scheduled_date, title, status')
    .eq('branch_id', branchId)
    .gte('scheduled_date', `${month}-01`)
    .lt('scheduled_date', nextMonthStart(month))
    .neq('status', 'canceled');
  const taken = new Set((existing ?? []).map((r) => r.scheduled_date));
  const dates = allDates.filter((d) => !taken.has(d));
  if (dates.length === 0) {
    return NextResponse.json({ error: '남은 날짜가 전부 이미 계획돼 있어요' }, { status: 400 });
  }
  const existingTitles = (existing ?? []).map((r) => r.title).filter(Boolean);

  const rules = await loadFileSafeFor('knowledge/seo/topic-rules.md', branchId);
  const branchKnowledge = await loadBranchKnowledgeFor(branch.name, branchId);
  const keywordContext = await loadKeywordContext(branchId);
  // 브랜드 계정(아카데미·트리필드 등)은 카드뉴스 컨셉이 주제 각도의 SSOT — 홍보성 주제 방지
  const brandConcept = await loadFileSafeFor(`knowledge/cardnews/concept-${branch.name}.md`, branchId);

  const fallback = () =>
    NextResponse.json({
      items: dates.map((d) => ({ scheduled_date: d, title: '', reason: '' })),
      note: 'AI를 사용할 수 없어 날짜만 채웠어요 — 주제를 직접 입력해주세요',
    });
  if (!process.env.GEMINI_API_KEY) return fallback();

  try {
    const result = await callAI({
      system: [
        '너는 미용실 콘텐츠 기획 에디터다. 한 달 콘텐츠 캘린더의 날짜별 주제를 짠다.',
        '규칙:',
        '- 날짜마다 서로 다른 주제 1개. 짧은 제목(25자 이내)과 한 줄 이유.',
        '- 시즌(월)과 요일 흐름을 반영하고, 검색 수요가 있는 주제를 우선한다.',
        '- 이미 잡힌 주제 목록과 겹치지 않게 한다.',
        '- 브랜드 컨셉이 함께 오면 그 컨셉의 필라·각도·"하지 말 것"이 최우선이다. 홍보·판매성 주제가 아니라 독자에게 정보를 주는 주제만 낸다.',
        '- 반드시 JSON으로만 답한다: {"items":[{"date":"YYYY-MM-DD","title":"...","reason":"..."}]}',
        brandConcept ? `\n--- 브랜드 카드뉴스 컨셉 (${branch.name}) — 반드시 이 컨셉을 따를 것 ---\n${brandConcept}` : '',
        rules ? `\n--- 추천 규칙 (topic-rules.md) ---\n${rules}` : '',
        keywordContext ? `\n--- 이번 달 키워드 조사 (⭐는 우선) ---\n${keywordContext}` : '',
        branchKnowledge ? `\n--- 지점 컨텍스트 (${branch.name}) ---\n${branchKnowledge}` : '',
      ].join('\n'),
      userMessage: [
        `지점: ${branch.name}`,
        `대상 월: ${month}`,
        `채울 날짜 (${dates.length}일): ${dates.join(', ')}`,
        existingTitles.length ? `이미 잡힌 주제 (겹치지 말 것): ${existingTitles.join(' / ')}` : '',
        '',
        '위 날짜 전부에 대해 날짜별 주제를 JSON으로.',
      ].join('\n'),
      temperature: 0.7,
      maxTokens: 4000,
      json: true,
    });
    const parsed = parseJsonResponse<{ items: { date: string; title: string; reason?: string }[] }>(result.text);
    const byDate = new Map((parsed.items ?? []).map((it) => [it.date, it]));
    const items = dates.map((d) => ({
      scheduled_date: d,
      title: (byDate.get(d)?.title ?? '').trim().slice(0, 60),
      reason: (byDate.get(d)?.reason ?? '').trim().slice(0, 120),
    }));
    if (!items.some((it) => it.title)) return fallback();
    return NextResponse.json({ items });
  } catch {
    return fallback();
  }
}
