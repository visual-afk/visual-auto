import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstThisMonth, kstTodayStr } from '@/lib/kst';
import {
  buildCalendarReport,
  fetchCalendarMonth,
  prevMonthOf,
  monthLabelOf,
  type CalendarReportData,
} from '@/lib/contentCalendar';
import { aggregateBranch } from '@/lib/metrics';
import { callAI, friendlyAIError } from '@/lib/generation/ai-client';

/**
 * 콘텐츠 캘린더 AI 챗 — 대표(본사)·원장이 이번 달 계획·노출·유입 숫자를 자연어로 질문.
 * 히스토리는 영속하지 않는다(클라이언트 상태로만 유지, 최근 몇 턴을 요청에 동봉).
 */

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

const fmtPct = (v: number | null) => (v == null ? '비교 불가' : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);

function reportToBullets(label: string, r: CalendarReportData): string {
  const lines = [
    `[${label}]`,
    `- 계획: ${r.plan.planned}건 · 완료 ${r.plan.done}건 (이행률 ${r.plan.rate == null ? '-' : Math.round(r.plan.rate * 100) + '%'}) · 실제 발행 ${r.plan.publishedActual}건`,
    `- 노출(그 달 발행 콘텐츠의 누적 조회수): ${r.exposure.views.toLocaleString()}회 (전월 대비 ${fmtPct(r.exposure.delta)})`,
    r.inflow.placeViews == null
      ? '- 유입(플레이스): 기록 없음'
      : `- 유입(플레이스 조회): ${r.inflow.placeViews.toLocaleString()}회 (전월 대비 ${fmtPct(r.inflow.delta)})`,
  ];
  if (r.inflow.topKeywords.length > 0) {
    lines.push(`- 유입 상위 키워드: ${r.inflow.topKeywords.map((k) => `${k.name}(${k.count})`).join(', ')}`);
  }
  if (r.byBranch && r.byBranch.length > 0) {
    lines.push('- 지점별: ' + r.byBranch.map((b) => `${b.name} 계획${b.planned}·완료${b.done}·발행${b.published}`).join(' / '));
  }
  return lines.join('\n');
}

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '원장·본사만 쓸 수 있어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const question = String(body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: '질문을 입력해주세요' }, { status: 400 });
  const month: string = /^\d{4}-\d{2}$/.test(String(body.month ?? '')) ? body.month : kstThisMonth();
  const history: ChatTurn[] = Array.isArray(body.history)
    ? (body.history as ChatTurn[]).filter((t) => t && (t.role === 'user' || t.role === 'assistant')).slice(-6)
    : [];

  // 스코프: 'all'(전사)은 본사만, 지점은 소속 검증
  const branchParam: string = body.branch_id || (member.role === 'hq_admin' ? 'all' : member.branchId || '');
  let branchIds: string[] | null = null;
  let scopeLabel = '전사';
  if (branchParam !== 'all') {
    if (!branchParam || !canActOnBranch(member, branchParam)) {
      return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
    }
    branchIds = [branchParam];
    const { data: b } = await getAdminSupabase().from('branches').select('name').eq('id', branchParam).maybeSingle();
    scopeLabel = b?.name ?? '지점';
  } else if (member.role !== 'hq_admin') {
    return NextResponse.json({ error: '전사 조회는 본사만 가능해요' }, { status: 403 });
  }

  try {
    const prevM = prevMonthOf(month);
    const [report, prevReport, monthData] = await Promise.all([
      buildCalendarReport(branchIds, month),
      buildCalendarReport(branchIds, prevM),
      fetchCalendarMonth(branchIds, month),
    ]);

    // 계획 목록 (제목·날짜·상태 — 상세 질문 대응용, 최대 60건)
    const scheduleLines = Object.values(monthData.days)
      .flatMap((d) => d.schedule)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .slice(0, 60)
      .map(
        (s) =>
          `  · ${s.scheduled_date} [${s.content_type === 'blog' ? '블로그' : s.content_type === 'reels' ? '릴스' : '기타'}] ${s.title} (${s.branchName}${s.assigneeName ? `·${s.assigneeName}` : ''}) — ${s.status === 'done' ? '완료' : s.status === 'canceled' ? '취소' : '예정'}`,
      );

    // 지점 뷰면 매출·퍼널 요약도 곁들인다 (성과 대시보드와 같은 소스)
    let salesBullets = '';
    if (branchIds && branchIds.length === 1) {
      try {
        const dash = await aggregateBranch(branchIds[0], 'month', `${month}-01`);
        if (dash.hasData) {
          salesBullets = [
            `[${scopeLabel} 매출·퍼널 (${dash.range.label})]`,
            `- 매출: ${dash.sales.total.toLocaleString()}원 (전기 대비 ${fmtPct(dash.sales.totalDelta)}) · 신규 ${dash.sales.new.toLocaleString()}원 · 재방 ${dash.sales.repeat.toLocaleString()}원`,
            `- 방문 고객 ${dash.guestCount}명 · 객단가 ${dash.avgPrice.toLocaleString()}원`,
            `- 퍼널: 노출 ${dash.funnel.exposure.toLocaleString()} → 전환 ${dash.funnel.conversion.toLocaleString()}${dash.funnel.exposureToConversion != null ? ` (전환율 ${(dash.funnel.exposureToConversion * 100).toFixed(1)}%)` : ''}`,
          ].join('\n');
        }
      } catch {
        // 매출 데이터가 없어도 챗은 동작해야 한다
      }
    }

    const system = [
      `너는 비주얼살롱의 콘텐츠 성과 분석 비서다. 대상: ${scopeLabel}, 기준 월: ${monthLabelOf(month)} (오늘 ${kstTodayStr()}).`,
      '아래 집계 데이터만 근거로 한국어로 답하라. 데이터에 없는 값을 지어내지 말고, 없으면 "기록이 없어요"라고 말하라.',
      '답변은 3~6문장, 존댓말. 숫자는 천 단위 구분. 필요하면 다음 액션 1가지를 제안하라.',
      '',
      reportToBullets(`${monthLabelOf(month)} 리포트`, report),
      '',
      reportToBullets(`${monthLabelOf(prevM)} 리포트 (전월)`, prevReport),
      ...(salesBullets ? ['', salesBullets] : []),
      '',
      scheduleLines.length > 0 ? `[${monthLabelOf(month)} 계획 목록]\n${scheduleLines.join('\n')}` : '[계획 목록] 없음',
    ].join('\n');

    const transcript = history.map((t) => `${t.role === 'user' ? '질문' : '답변'}: ${t.text}`).join('\n');
    const userMessage = transcript ? `${transcript}\n질문: ${question}` : `질문: ${question}`;

    const result = await callAI({ system, userMessage, maxTokens: 2000, temperature: 0.4 });
    return NextResponse.json({ answer: result.text.trim() });
  } catch (e) {
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
