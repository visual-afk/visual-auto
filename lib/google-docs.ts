import { getDocs, getDrive } from './google-auth.js';
import { config } from './config.js';

export async function createBlogDoc(title: string, content: string, branch?: string, platform?: string): Promise<string> {
  const drive = getDrive();

  const branchLabel = branch ? ` ${branch}` : '';
  const platformLabel = platform ? `<${platform}> ` : '';

  // 1. Drive에 빈 문서 생성 (지정 폴더에, 공유 드라이브 지원)
  const file = await drive.files.create({
    requestBody: {
      name: `${platformLabel}[비주얼살롱${branchLabel}] ${title} - ${new Date().toISOString().split('T')[0]}`,
      mimeType: 'application/vnd.google-apps.document',
      parents: [config.google.docsFolderId],
    },
    supportsAllDrives: true,
  });

  const docId = file.data.id;
  if (!docId) throw new Error('문서 생성 실패: ID를 받지 못했습니다');

  // 2. 문서에 콘텐츠 삽입
  const docs = getDocs();
  const requests = buildDocRequests(content);

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });
  }

  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
  console.log(`구글독스 생성: ${docUrl}`);
  return docUrl;
}

function buildDocRequests(content: string): any[] {
  const requests: any[] = [];
  let index = 1; // 문서의 시작 인덱스

  // HTML을 간단한 텍스트로 변환 (기본적인 구조만)
  const plainContent = content
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 전체 텍스트를 한 번에 삽입
  requests.push({
    insertText: {
      location: { index },
      text: plainContent,
    },
  });

  return requests;
}
