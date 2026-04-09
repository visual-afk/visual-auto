import { appendFileSync } from 'fs';
import { resolve } from 'path';
import { fetchTodayRows, fetchPlannedRows, updateStatus, updateDocUrl, updateGeneratedAt } from '../lib/google-sheets.js';
import { loadKnowledge, loadPrompt, loadTemplate, callClaude, parseJsonResponse } from '../lib/claude-client.js';
import { createBlogDoc } from '../lib/google-docs.js';
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

async function generateForRow(row: SheetRow): Promise<void> {
  const startTime = Date.now();
  console.log(`\n🤖 생성 시작: "${row.topic}" (${row.postType})\n`);

  log({ timestamp: new Date().toISOString(), topic: row.topic, status: 'started' });

  // 상태 업데이트: generating
  await updateStatus(row.rowIndex, 'generating');

  let totalTokens = 0;

  try {
    // 1. 지식베이스 로딩
    const knowledge = loadKnowledge();
    const template = loadTemplate(getPostTypeTemplate(row.postType));
    const writerPrompt = loadPrompt('blog-writer');
    const seoPrompt = loadPrompt('seo-optimizer');

    console.log(`📚 지식베이스 로딩 완료 (${knowledge.length}자)`);

    // 2. 초안 생성 (Agent 1+2: 지식 기반 글쓰기)
    console.log('✍️  초안 생성 중...');
    const draftResult = await callClaude({
      system: [
        writerPrompt,
        '\n\n--- 비주얼살롱 지식베이스 ---\n',
        knowledge,
        '\n\n--- 글 구조 템플릿 ---\n',
        template,
      ].join(''),
      userMessage: [
        `주제: ${row.topic}`,
        `키워드: ${row.keywords}`,
        `글유형: ${row.postType}`,
        '',
        '위 주제로 블로그 글을 작성해주세요. 지식베이스와 템플릿을 참고하되, 자연스럽고 읽기 좋은 글을 써주세요.',
      ].join('\n'),
      temperature: 0.7,
    });

    totalTokens += draftResult.inputTokens + draftResult.outputTokens;
    const draft = parseJsonResponse<GeneratedPost>(draftResult.text);
    console.log(`  ✅ 초안 완료: "${draft.title}" (${draftResult.outputTokens} 토큰)`);

    // 3. SEO 최적화 (Agent 3)
    console.log('🔍 SEO 최적화 중...');
    const seoResult = await callClaude({
      system: seoPrompt,
      userMessage: [
        `원본 블로그 글:`,
        JSON.stringify(draft, null, 2),
        '',
        `타겟 키워드: ${row.keywords}`,
        '',
        'SEO 관점에서 최적화해주세요.',
      ].join('\n'),
      temperature: 0.3,
    });

    totalTokens += seoResult.inputTokens + seoResult.outputTokens;
    const optimized = parseJsonResponse<SeoOptimizedPost>(seoResult.text);
    console.log(`  ✅ SEO 최적화 완료 (점수: ${optimized.seo_score}/100)`);

    // 4. 구글독스 생성
    console.log('📄 구글독스 생성 중...');
    const finalContent = [
      optimized.optimized_content,
      '\n\n---\n',
      `태그: ${optimized.optimized_tags.join(', ')}`,
      `메타 설명: ${optimized.optimized_meta_description}`,
      '\n\n📸 이미지 제안:',
      ...draft.image_suggestions.map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');

    const docUrl = await createBlogDoc(optimized.optimized_title, finalContent);

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
      status: 'failed',
      error: errorMsg,
      duration_ms: duration,
    });

    throw err;
  }
}

async function main() {
  // --topic "주제" 인자 확인
  const topicArg = process.argv.find((_, i, arr) => arr[i - 1] === '--topic');

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

  console.log(`📝 ${rows.length}건 생성 시작\n`);

  for (const row of rows) {
    await generateForRow(row);
  }

  console.log(`\n🎉 전체 완료: ${rows.length}건 생성`);
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
