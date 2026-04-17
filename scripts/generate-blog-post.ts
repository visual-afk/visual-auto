import { appendFileSync } from 'fs';
import { resolve } from 'path';
import { fetchTodayRows, fetchPlannedRows, updateStatus, updateDocUrl, updateGeneratedAt } from '../lib/google-sheets.js';
import { loadKnowledge, loadBranchKnowledge, loadPrompt, loadTemplate, callClaude, parseJsonResponse } from '../lib/claude-client.js';
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
  const branchLabel = row.branch ? ` [${row.branch}]` : '';
  const purposeLabel = row.contentPurpose || '노출용';
  console.log(`\n🤖 생성 시작: "${row.topic}" (${row.postType}, ${purposeLabel})${branchLabel}\n`);

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
    const draftResult = await callClaude({
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
        '위 주제로 블로그 글을 작성해주세요. 지식베이스와 템플릿을 참고하되, 자연스럽고 읽기 좋은 글을 써주세요.',
        '글목적에 맞는 톤, CTA 강도, 마무리 링크를 반드시 적용하세요 (links.md 참고).',
        ...(row.branch ? ['지점 특화 컨텍스트의 톤앤매너, CTA 패턴, 금지 표현을 반드시 준수해주세요.'] : []),
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
        `글목적: ${purposeLabel}`,
        '',
        'SEO 관점에서 최적화해주세요. 글목적에 맞는 SEO 강도를 적용하세요.',
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

    const docUrl = await createBlogDoc(optimized.optimized_title, finalContent, row.branch || undefined);

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

  for (const row of rows) {
    await generateForRow(row);
  }

  console.log(`\n🎉 전체 완료: ${rows.length}건 생성`);
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
