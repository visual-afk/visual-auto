import { appendFileSync } from 'fs';
import { resolve } from 'path';
import { fetchTodayRows, fetchPlannedRows, updateStatus, updateDocUrl, updateGeneratedAt } from '../lib/google-sheets.js';
import { loadKnowledge, loadPrompt, loadTemplate, callAI, parseJsonResponse } from '../lib/ai-client.js';
import { loadBranchKnowledge, generateImage } from '../lib/claude-client.js';
import { createBlogDoc, replaceImageTagsInDoc } from '../lib/google-docs.js';
import type { GeneratedPost, SeoOptimizedPost, PipelineLogEntry, SheetRow } from '../lib/types.js';

const LOG_PATH = resolve(import.meta.dirname, '..', 'status', 'pipeline-log.jsonl');

function log(entry: PipelineLogEntry) {
  appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

function getPostTypeTemplate(postType: string): string {
  const map: Record<string, string> = {
    '정보형': 'info-post',
    '스토리형': 'story-post',
    '시즌형': 'seasonal-post',
  };
  return map[postType] || 'info-post';
}

function extractImageDescriptions(content: string): string[] {
  const descriptions: string[] = [];
  // [IMAGE] 블록에서 포인트/구도/종류 정보 추출
  const imageBlocks = content.split(/\[IMAGE\]/gi).slice(1);
  for (const block of imageBlocks) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('-')).slice(0, 4);
    const desc = lines.map(l => l.replace(/^-\s*/, '').replace(/^(종류|구도|포인트|alt 텍스트)\s*:\s*/i, '')).join(', ');
    if (desc.trim()) descriptions.push(desc.trim());
  }
  return descriptions;
}

async function generateForRow(row: SheetRow, isWashing = false): Promise<void> {
  const startTime = Date.now();
  const branchLabel = row.branch ? ` [${row.branch}]` : '';
  const purposeLabel = row.contentPurpose || '노출용';
  const washingLabel = isWashing ? ' [워싱]' : '';
  console.log(`\n🤖 생성 시작: "${row.topic}" (${row.postType}, ${purposeLabel})${branchLabel}${washingLabel}\n`);

  log({ timestamp: new Date().toISOString(), topic: row.topic, branch: row.branch || undefined, status: 'started' });

  // 상태 업데이트: generating
  await updateStatus(row.rowIndex, 'generating');

  let totalTokens = 0;

  try {
    // 1. 지식베이스 로딩
    const knowledge = loadKnowledge();
    const branchKnowledge = loadBranchKnowledge(row.branch);
    const template = loadTemplate(getPostTypeTemplate(row.postType));
    const writerPrompt = loadPrompt('blog-writer');
    const seoPrompt = loadPrompt('seo-optimizer');

    console.log(`📚 지식베이스 로딩 완료 (${knowledge.length}자${branchKnowledge ? ` + 지점 ${branchKnowledge.length}자` : ''})`);

    // 2. 초안 생성 (Agent 1+2: 지식 기반 글쓰기)
    console.log('✍️  초안 생성 중...');
    const draftResult = await callAI({
      system: [
        writerPrompt,
        '\n\n--- 비주얼살롱 지식베이스 ---\n',
        knowledge,
        ...(branchKnowledge ? ['\n\n--- 지점 특화 컨텍스트 ---\n', `이 글은 **비주얼살롱 ${row.branch}** 지점용 글입니다.\n`, branchKnowledge] : []),
        '\n\n--- 글 구조 템플릿 ---\n',
        template,
      ].join(''),
      userMessage: [
        ...(row.branch ? [`지점: ${row.branch}`] : []),
        `주제: ${row.topic}`,
        `키워드: ${row.keywords}`,
        `글유형: ${row.postType}`,
        `글목적: ${purposeLabel}`,
        '',
        '위 주제로 블로그 글을 작성해주세요.',
        '',
        '🎯 글의 유일한 목표: 독자가 "어, 이거 내 얘기네?" → "맞아 이게 내 고민" → "그래서 어떻게?" → "한 번 예약해볼까" 로 이어지게.',
        '동시에 검색에서 들어올 사람을 위한 SEO도 놓치지 않습니다.',
        '',
        '⭐ 핵심 규칙:',
        '1. **PASOR 구조 강제**: ① 공감 도입 → ② 고민 깊이 → ③ 원인 분석/오해 짚기 → ④ 해결법 + 케이스 → ⑤ 비교/요약(선택) → ⑥ 행동 제안',
        '2. **분량 6,500~7,500자 (한국어 기준)**. 4,500자 너무 짧음, 9,000자 너무 김. 이 범위.',
        '3. **H2 5~6개**. PASOR 골격 + 디테일 섹션 1~2개.',
        '4. **표 1~2개 (SEO용 필수)**: 비교표·유형별 추천표·체크리스트표 등 본문 흐름 자연스럽게 녹임.',
        '5. **도입부 첫 3줄 = 구체적 상황 묘사**. "거울 보면서 한숨 푹...", "셀프 매직 망친 후 거울 앞에서..."',
        '6. **CTA = 부담 낮춤**. "예약하세요!" X. "사진 한 장만 인스타 DM으로 보내주세요. 무료 진단" OK.',
        '7. **디자이너 한 명 주인공 X. 페르소나 디테일(샤넬/명품/CEO/억대 자산) 본문 노출 X.**',
        '',
        '🔍 SEO 챙기기:',
        '- H1 제목에 메인 키워드 자연 포함',
        '- 도입부 첫 2문장에 메인 키워드 자연 노출',
        '- H2 5~6개 중 3개 이상에 메인 키워드/변형',
        '- 본문 전체에 메인 키워드 5~8회 (자연스럽게)',
        '- 각 H2 본문에 롱테일 키워드 1~2개 분산',
        '- 메타 디스크립션 = 메인 키워드 + 공감 + 클릭 유도 (150자 이내)',
        '',
        '❌ 절대 금지: "이 글에서는 ~", "정리해드릴게요", "그렇다면", "또한", "쉬운 비유로 설명하면", "## 1. 헤더", 박스(📍📷💬)',
        '',
        ...(isWashing ? [
          '⚠️ 플랫폼: 네이버 블로그 — 모바일 가독성 + SEO 둘 다.',
          '⚠️ 워싱 모드: 같은 주제 다른 버전. 도입부·소제목·예시·어투·표 모양 다르게.',
        ] : [
          '⚠️ 플랫폼: 아임웹 (살롱 공식 홈) — 공감 + SEO. 표 1~2개로 정보 정리.',
        ]),
        ...(row.branch ? ['', '지점 특화 컨텍스트의 톤앤매너·금지 표현 준수.'] : []),
      ].join('\n'),
      temperature: 0.7,
    });

    totalTokens += draftResult.inputTokens + draftResult.outputTokens;
    const draft = parseJsonResponse<GeneratedPost>(draftResult.text);
    console.log(`  ✅ 초안 완료: "${draft.title}" (${draftResult.outputTokens} 토큰)`);

    // 3. SEO 최적화 (Agent 3) — 실패 시 초안 그대로 사용 (graceful fallback)
    let optimized: SeoOptimizedPost;
    try {
      console.log('🔍 SEO 최적화 중...');
      const seoResult = await callAI({
        system: seoPrompt,
        userMessage: [
          `원본 블로그 글:`,
          JSON.stringify(draft, null, 2),
          '',
          `타겟 키워드: ${row.keywords}`,
          `글목적: ${purposeLabel}`,
          '',
          'SEO 관점에서 최적화해주세요. 글목적에 맞는 SEO 강도를 적용하세요.',
        ].join('\n'),
        temperature: 0.3,
      });
      totalTokens += seoResult.inputTokens + seoResult.outputTokens;
      optimized = parseJsonResponse<SeoOptimizedPost>(seoResult.text);
      console.log(`  ✅ SEO 최적화 완료 (점수: ${optimized.seo_score}/100)`);
    } catch (err) {
      console.log(`  ⚠️ SEO 최적화 실패 (${(err as Error).message?.slice(0, 60)}). 초안 그대로 사용`);
      optimized = {
        optimized_title: draft.title,
        optimized_meta_description: draft.meta_description,
        optimized_tags: draft.tags,
        optimized_content: draft.content,
        changes_made: ['SEO 최적화 단계 스킵 (모델 혼잡)'],
        seo_score: 0,
      } as SeoOptimizedPost;
    }

    // 4. 구글독스 생성
    console.log('📄 구글독스 생성 중...');
    const mainKeyword = (row.keywords || '').split(',')[0].trim();
    const allKeywords = (row.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
    const finalContent = [
      `🔑 메인 키워드: ${mainKeyword}`,
      `🏷️ 전체 키워드: ${allKeywords.join(', ')}`,
      '',
      '---',
      '',
      `# ${optimized.optimized_title}`,
      '',
      optimized.optimized_content,
      '\n\n---\n',
      `태그: ${(optimized.optimized_tags || []).join(', ')}`,
      `메타 설명: ${optimized.optimized_meta_description || ''}`,
      ...((draft.image_suggestions || []).length > 0 ? ['\n\n📸 이미지 제안:', ...(draft.image_suggestions || []).map((s, i) => `${i + 1}. ${s}`)] : []),
    ].join('\n');

    const platform = isWashing ? '블로그' : '아임웹';
    const docUrl = await createBlogDoc(optimized.optimized_title, finalContent, row.branch || undefined, platform, row.scheduledDate);

    // 4-1. 문단별로 Gemini AI 이미지 자동 생성 + 삽입 ([IMAGE] 위치마다 매칭)
    //      SKIP_IMAGES=true 환경변수가 있으면 이미지 단계 통째로 건너뜀
    const docId = docUrl.match(/\/d\/([^/]+)/)?.[1];
    if (docId && process.env.SKIP_IMAGES !== 'true') {
      try {
        const { generateImage } = await import('../lib/claude-client.js');
        const { replaceImageTagsInDoc } = await import('../lib/google-docs.js');

        const imageDescs = extractImageDescriptions(draft.content);
        if (imageDescs.length > 0) {
          console.log(`🎨 Gemini AI 이미지 ${imageDescs.length}장 생성 중...`);
          const buffers: Buffer[] = [];
          for (let i = 0; i < imageDescs.length; i++) {
            const buf = await generateImage(imageDescs[i]);
            if (buf) {
              buffers.push(buf);
              console.log(`  🎨 ${i + 1}/${imageDescs.length} 생성 완료`);
            } else {
              console.log(`  ⚠️ ${i + 1} 실패`);
            }
          }
          if (buffers.length > 0) {
            await replaceImageTagsInDoc(docId, buffers);
            console.log(`  ✅ 문단별 AI 이미지 ${buffers.length}장 삽입 완료`);
          }
        }
      } catch (err) {
        console.log(`  ⚠️ 이미지 삽입 스킵: ${(err as Error).message?.slice(0, 80)}`);
      }
    } else if (process.env.SKIP_IMAGES === 'true') {
      console.log(`  ⏭️  이미지 단계 SKIP (SKIP_IMAGES=true)`);
    }

    // 5. 시트 업데이트
    await updateStatus(row.rowIndex, 'draft_ready');
    await updateDocUrl(row.rowIndex, docUrl);
    await updateGeneratedAt(row.rowIndex);

    const duration = Date.now() - startTime;
    console.log(`\n✅ 완료! (${(duration / 1000).toFixed(1)}초, ${totalTokens} 토큰)`);
    console.log(`📎 독스: ${docUrl}`);

    log({
      timestamp: new Date().toISOString(),
      topic: row.topic,
      branch: row.branch || undefined,
      status: 'completed',
      doc_url: docUrl,
      tokens_used: totalTokens,
      duration_ms: duration,
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = (err as Error).message;
    console.error(`\n❌ 실패: ${errorMsg}`);

    await updateStatus(row.rowIndex, 'planned'); // 실패 시 다시 planned로

    log({
      timestamp: new Date().toISOString(),
      topic: row.topic,
      branch: row.branch || undefined,
      status: 'failed',
      error: errorMsg,
      duration_ms: duration,
    });

    throw err;
  }
}

async function main() {
  // CLI 인자 확인
  const topicArg = process.argv.find((_, i, arr) => arr[i - 1] === '--topic');
  const branchArg = process.argv.find((_, i, arr) => arr[i - 1] === '--branch');

  let rows: SheetRow[];

  if (topicArg) {
    // 특정 주제로 생성
    const allRows = await fetchPlannedRows();
    rows = allRows.filter(r => r.topic.includes(topicArg));
    if (rows.length === 0) {
      console.log(`"${topicArg}" 주제를 찾을 수 없습니다. (status=planned인 행만 대상)`);
      return;
    }
  } else {
    // 오늘 예정된 주제
    rows = await fetchTodayRows();
    if (rows.length === 0) {
      console.log('오늘 예정된 블로그 글이 없습니다.');
      return;
    }
  }

  // --branch 필터: 특정 지점만 생성
  if (branchArg) {
    rows = rows.filter(r => r.branch === branchArg);
    if (rows.length === 0) {
      console.log(`"${branchArg}" 지점의 글이 없습니다.`);
      return;
    }
    console.log(`🏪 ${branchArg} 지점 필터 적용`);
  }

  console.log(`📝 ${rows.length}건 생성 시작\n`);

  // 같은 주제 첫번째 행 = 아임웹, 두번째 행 = 블로그 (워싱)
  // 재시도 시에도 일관되게 동작하도록 rowIndex 기준으로 판단
  const { fetchAllRows } = await import('../lib/google-sheets.js');
  const allRows = await fetchAllRows();
  const topicFirstRowIndex = new Map<string, number>();
  for (const r of allRows) {
    if (!topicFirstRowIndex.has(r.topic)) topicFirstRowIndex.set(r.topic, r.rowIndex);
  }

  for (const row of rows) {
    // 이 행이 해당 주제의 첫번째 행보다 뒤에 있으면 워싱(블로그)
    const isWashing = row.rowIndex !== topicFirstRowIndex.get(row.topic);
    await generateForRow(row, isWashing);
  }

  console.log(`\n🎉 전체 완료: ${rows.length}건 생성`);
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
