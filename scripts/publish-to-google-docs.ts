import { fetchAllRows, updateDocUrl, updateStatus } from '../lib/google-sheets.js';
import { createBlogDoc } from '../lib/google-docs.js';

/**
 * 수동으로 특정 내용을 구글독스에 올릴 때 사용
 * Usage: npx tsx scripts/publish-to-google-docs.ts --title "제목" --content "내용"
 * 또는 시트에서 draft_ready 상태인 글을 재생성할 때 사용
 */
async function main() {
  const titleArg = process.argv.find((_, i, arr) => arr[i - 1] === '--title');
  const contentArg = process.argv.find((_, i, arr) => arr[i - 1] === '--content');

  if (titleArg && contentArg) {
    // 직접 입력으로 생성
    const docUrl = await createBlogDoc(titleArg, contentArg);
    console.log(`✅ 생성 완료: ${docUrl}`);
    return;
  }

  // 시트에서 draft_ready인 글 중 doc_url이 없는 것 확인
  const rows = await fetchAllRows();
  const needsDoc = rows.filter(r => r.status === 'draft_ready' && !r.docUrl);

  if (needsDoc.length === 0) {
    console.log('구글독스가 필요한 글이 없습니다.');
    console.log('\n사용법: npx tsx scripts/publish-to-google-docs.ts --title "제목" --content "내용"');
    return;
  }

  console.log(`${needsDoc.length}건의 독스 미생성 글 발견`);
  for (const row of needsDoc) {
    console.log(`  - ${row.topic} (행 ${row.rowIndex})`);
  }
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
