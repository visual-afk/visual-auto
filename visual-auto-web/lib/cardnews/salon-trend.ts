/**
 * 비주얼살롱 주간 트렌드 주제 시더 — 구글 트렌드 급상승에서 여자 연예인을 찾아
 * "고급스러움 연구" 각도의 카드뉴스 주제 1건을 cardnews_topics에 편성한다.
 *
 * 트리필드의 은행 시드(topic-seed.ts)와 달리 비결정론(실시간 트렌드)이라
 * generateTopics를 거치지 않는 별도 경로다. append-only·unique(branch_id, topic_date)
 * 계약은 동일하게 지킨다. 인물 관련 사실은 항상 verify_needed=true로 사람 확인을 거친다.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
import { upsertTopicEvent, type GcalTopicItem } from '@/lib/gcal';
import { callAIDelimited, loadFileSafeFor } from '@/lib/generation/ai-client';
import { fetchKrTrends } from '@/lib/trends/googleTrends';

const BRAND_NAME = '비주얼살롱';

export interface SalonTrendResult {
  seeded: number;
  celeb?: string;
  material?: string;
  skipped_reason?: string;
}

export async function seedSalonTrendTopic(topicDate?: string): Promise<SalonTrendResult> {
  const admin = getAdminSupabase();
  const date = topicDate ?? kstTodayStr();

  const { data: brand } = await admin
    .from('branches')
    .select('id')
    .eq('kind', 'brand')
    .eq('name', BRAND_NAME)
    .maybeSingle();
  if (!brand) return { seeded: 0, skipped_reason: '비주얼살롱 브랜드 계정 없음' };

  // 그 날짜에 이미 주제가 있으면(수동 편성 포함) 건드리지 않는다
  const { data: existing } = await admin
    .from('cardnews_topics')
    .select('id')
    .eq('branch_id', brand.id)
    .eq('topic_date', date)
    .maybeSingle();
  if (existing) return { seeded: 0, skipped_reason: '해당 날짜에 이미 주제 있음' };

  const trends = await fetchKrTrends();
  const trendLines = trends
    .slice(0, 20)
    .map((t) => `- ${t.title}${t.traffic ? ` (${t.traffic})` : ''}${t.newsTitles.length ? ` — 뉴스: ${t.newsTitles.join(' / ')}` : ''}`)
    .join('\n');

  const concept = await loadFileSafeFor(`knowledge/cardnews/concept-${BRAND_NAME}.md`, brand.id);
  const system = [
    '너는 비주얼살롱 카드뉴스의 주간 주제 큐레이터다. 구글 트렌드 급상승 목록에서 여자 연예인(배우·가수·아이돌 등)을 찾아, 브랜드 컨셉("고급스러움 연구")에 맞는 카드뉴스 주제 1건을 기획한다.',
    '',
    '규칙:',
    '- 급상승 목록·뉴스 제목에서 여자 연예인을 우선 선정한다. 목록에 없으면 최근 화제인 여성 셀럽을 지식으로 고르되, TREND_BASIS에 "트렌드 목록에 없음 — 지식 기반 선정"이라고 명시한다.',
    '- 논란·사건·사생활로 급상승한 인물은 피한다. 작품·무대·스타일로 화제인 인물만. 비방·외모 평가 금지 — 인물은 무드의 예시일 뿐이다.',
    '- 주제는 인물 소식이 아니라 그 인물의 고급스러운 무드를 해부하는 각도여야 한다. (예: "OO의 그 단정함, 머리가 만드는 공통점")',
    concept ? `\n--- 브랜드 카드뉴스 컨셉 — 반드시 이 컨셉을 따를 것 ---\n${concept}` : '',
  ].join('\n');

  const sections = await callAIDelimited(
    {
      system,
      userMessage: [
        `수집일: ${date}`,
        '오늘 구글 트렌드 급상승 (한국):',
        trendLines || '(트렌드 수집 실패 — 지식 기반으로 선정할 것)',
      ].join('\n'),
      temperature: 0.7,
      maxTokens: 1500,
    },
    [
      { name: 'CELEB', description: '선정한 여자 연예인 이름 한 줄' },
      { name: 'TREND_BASIS', description: '선정 근거 한 줄 (트렌드 목록의 어떤 항목/뉴스인지, 목록에 없으면 그 사실 명시)' },
      { name: 'MATERIAL', description: '카드뉴스 주제 소재 한 줄 — 인물의 고급스러운 무드를 해부하는 각도' },
      { name: 'HOOK_TYPE', description: '공통점 해부형 | 무드 명명형 | 아카이브형 중 하나' },
      { name: 'HEADLINE_DRAFT', description: '표지 훅 초안 (15자 안팎, 최대 2줄)' },
      { name: 'HINT', description: '표지 방향 힌트 한 줄' },
      { name: 'FACT_SEED', description: '근거의 경계 — 참고한 트렌드 검색어·뉴스 제목·수집일. 이 밖의 사실 단정 금지용' },
      { name: 'MEMO', description: '예진 매니저에게 남길 확인 요청 한 줄', required: false },
    ],
  );

  const celeb = (sections.CELEB ?? '').trim();
  const material = (sections.MATERIAL ?? '').trim();
  if (!celeb || !material) return { seeded: 0, skipped_reason: 'AI 주제 생성 실패 (필수 섹션 누락)' };

  // 위에서 존재 여부를 확인했으므로 insert. 동시 실행이 겹치면 unique 충돌(23505)로 skip.
  // (0029 마이그레이션 전의 프로덕션은 unique가 없어 upsert의 ON CONFLICT가 42P10으로 실패한다)
  const { data: inserted, error } = await admin
    .from('cardnews_topics')
    .insert({
      branch_id: brand.id,
      topic_date: date,
      entry_id: 'salon-trend',
      section: '고급스러움 연구',
      pool_label: '구글트렌드',
      material,
      frame: (sections.HOOK_TYPE ?? '').trim() || '공통점 해부형',
      fact_seed: (sections.FACT_SEED ?? '').trim() || null,
      hint: (sections.HINT ?? '').trim() || null,
      headline_draft: (sections.HEADLINE_DRAFT ?? '').trim() || null,
      verify_needed: true, // 인물·사실은 항상 사람이 확인 후 생성
      live_slot: false,
      memo: [`인물: ${celeb}`, (sections.TREND_BASIS ?? '').trim(), (sections.MEMO ?? '').trim()]
        .filter(Boolean)
        .join(' · '),
    })
    .select('id, topic_date, material, section, frame, fact_seed, status, memo, gcal_event_id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return { seeded: 0, skipped_reason: '동시 실행 충돌 — 기존 행 보존' };
    throw new Error(`살롱 트렌드 주제 시드 실패: ${error.message}`);
  }
  if (!inserted) return { seeded: 0, skipped_reason: '삽입 결과 없음' };

  // 구글캘린더 내보내기 (best-effort)
  const eventId = await upsertTopicEvent(inserted as GcalTopicItem, BRAND_NAME);
  if (eventId) await admin.from('cardnews_topics').update({ gcal_event_id: eventId }).eq('id', inserted.id);

  return { seeded: 1, celeb, material };
}
