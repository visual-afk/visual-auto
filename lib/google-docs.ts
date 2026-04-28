import { getDocs, getDrive } from './google-auth.js';
import { config } from './config.js';
import { Readable } from 'stream';

export async function createBlogDoc(title: string, content: string, branch?: string, platform?: string): Promise<string> {
  const drive = getDrive();

  const branchLabel = branch ? ` ${branch}` : '';
  const platformLabel = platform ? `<${platform}> ` : '';
  const date = new Date().toISOString().split('T')[0];

  // 1. Drive에 빈 문서 생성 (지정 폴더에, 공유 드라이브 지원)
  const file = await drive.files.create({
    requestBody: {
      name: `${platformLabel}[비주얼살롱${branchLabel}] ${title} - ${date}`,
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

/** 이미지를 Drive에 업로드하고 URL 반환 */
async function uploadImageToDrive(imageBuffer: Buffer): Promise<string | null> {
  const drive = getDrive();

  const file = await drive.files.create({
    requestBody: {
      name: `blog-image-${Date.now()}.png`,
      mimeType: 'image/png',
      parents: [config.google.docsFolderId],
    },
    media: {
      mimeType: 'image/png',
      body: Readable.from(imageBuffer),
    },
    supportsAllDrives: true,
  });

  const fileId = file.data.id;
  if (!fileId) return null;

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });

  return `https://drive.google.com/uc?id=${fileId}`;
}

/** 독스에서 [IMAGE] 블록을 찾아 이미지로 교체 */
export async function replaceImageTagsInDoc(docId: string, imageBuffers: Buffer[]): Promise<number> {
  const docs = getDocs();

  // 1. 독스 내용 읽기
  const doc = await docs.documents.get({ documentId: docId });
  const content = doc.data.body?.content || [];

  // 2. [IMAGE] 태그 위치 찾기 (뒤에서부터 처리하기 위해 역순)
  const imagePositions: { startIndex: number; endIndex: number }[] = [];

  for (const element of content) {
    if (element.paragraph) {
      const text = element.paragraph.elements
        ?.map(e => e.textRun?.content || '')
        .join('') || '';

      if (text.includes('[IMAGE]')) {
        // [IMAGE]부터 다음 빈 줄까지가 이미지 블록
        const startIdx = element.startIndex || 0;
        // 이미지 블록 끝 찾기: [IMAGE] 포함 단락부터 alt 텍스트 줄까지
        imagePositions.push({ startIndex: startIdx, endIndex: element.endIndex || startIdx + 1 });
      }
    }
  }

  // 연속된 IMAGE 블록 병합 (IMAGE 태그 + 설명 줄들)
  const mergedPositions: { startIndex: number; endIndex: number }[] = [];
  let i = 0;
  while (i < imagePositions.length) {
    let start = imagePositions[i].startIndex;
    let end = imagePositions[i].endIndex;
    // 연속된 줄들 (IMAGE 설명 블록) 병합
    while (i + 1 < imagePositions.length && imagePositions[i + 1].startIndex <= end + 2) {
      end = imagePositions[i + 1].endIndex;
      i++;
    }
    mergedPositions.push({ startIndex: start, endIndex: end });
    i++;
  }

  // 3. 뒤에서부터 교체 (인덱스 밀림 방지)
  let insertedCount = 0;
  const reversedPositions = mergedPositions.reverse();

  for (let idx = 0; idx < reversedPositions.length && idx < imageBuffers.length; idx++) {
    const pos = reversedPositions[idx];
    const imageUrl = await uploadImageToDrive(imageBuffers[idx]);
    if (!imageUrl) continue;

    const requests: any[] = [];

    // 먼저 [IMAGE] 블록 텍스트 삭제
    requests.push({
      deleteContentRange: {
        range: { startIndex: pos.startIndex, endIndex: pos.endIndex },
      },
    });

    // 그 위치에 이미지 삽입
    requests.push({
      insertInlineImage: {
        location: { index: pos.startIndex },
        uri: imageUrl,
        objectSize: {
          width: { magnitude: 400, unit: 'PT' },
          height: { magnitude: 300, unit: 'PT' },
        },
      },
    });

    try {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests },
      });
      insertedCount++;
    } catch {
      // 위치 에러 시 스킵
    }
  }

  return insertedCount;
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
