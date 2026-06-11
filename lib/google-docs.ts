import { getDocs, getDrive } from './google-auth.js';
import { config } from './config.js';
import { Readable } from 'stream';

export async function createBlogDoc(title: string, content: string, branch?: string, platform?: string, scheduledDate?: string): Promise<string> {
  const drive = getDrive();

  const branchLabel = branch ? ` ${branch}` : '';
  const platformLabel = platform ? `<${platform}> ` : '';
  // KST 기준 오늘 날짜 (scheduledDate 우선)
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const todayKst = new Date(now.getTime() + kstOffset).toISOString().split('T')[0];
  const date = scheduledDate || todayKst;

  // 1. Drive에 빈 문서 생성 (지정 폴더에, 공유 드라이브 지원)
  const file = await drive.files.create({
    requestBody: {
      name: `${date} ${platformLabel}[비주얼살롱${branchLabel}] ${title}`,
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

/** Drive 사진 URL을 독스 끝에 삽입 */
export async function insertImageToDoc(docId: string, imageUrl: string): Promise<void> {
  const docs = getDocs();

  // 문서 끝 인덱스 가져오기
  const doc = await docs.documents.get({ documentId: docId });
  const body = doc.data.body?.content || [];
  const lastElement = body[body.length - 1];
  const endIndex = (lastElement?.endIndex || 2) - 1;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: endIndex },
            text: '\n',
          },
        },
        {
          insertInlineImage: {
            location: { index: endIndex + 1 },
            uri: imageUrl,
            objectSize: {
              width: { magnitude: 400, unit: 'PT' },
              height: { magnitude: 300, unit: 'PT' },
            },
          },
        },
      ],
    },
  });
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

/**
 * 마크다운 텍스트의 줄바꿈을 정규화한다.
 * - 헤더(##/###)와 [IMAGE] 태그 안의 본문 분리
 * - 헤더/이미지/표 블록 앞뒤에 빈 줄
 * - 표 행(|로 시작) 사이는 빈 줄 X (행끼리 붙어있어야 표로 보임)
 */
function normalizeMarkdownNewlines(text: string): string {
  // 1단계: 한 줄에 헤더와 본문이 붙어있는 경우 분리
  //   "## 헤더본문본문" → "## 헤더\n본문본문"
  let t = text
    // ## 또는 ### 앞에 줄바꿈이 없으면 추가
    .replace(/([^\n])\s*(#{2,4}\s)/g, '$1\n$2')
    // [IMAGE] 앞에 줄바꿈 추가
    .replace(/([^\n])\s*(\[IMAGE\])/g, '$1\n$2')
    // [IMAGE] 뒤에 바로 - 메타 라인 시작하면 분리: "[IMAGE]- 종류:" → "[IMAGE]\n- 종류:"
    .replace(/(\[IMAGE\])\s*(-\s)/g, '$1\n$2')
    // [IMAGE] 메타 라인 사이 분리: "...자연광- 포인트:" → "...자연광\n- 포인트:"
    // (특정 키워드로 시작하는 메타 항목만)
    .replace(/([가-힣A-Za-z\)\]\.0-9])\s*(-\s*(?:종류|구도|포인트|alt 텍스트|alt text)\s*:)/g, '$1\n$2');
  // (헤더 본문 자동 분리는 false positive가 많아 제거. AI 프롬프트 단에서 \n 명시 강제)

  // 2단계: 라인 단위 처리 — 블록 사이에 빈 줄 추가
  const lines = t.split('\n');
  const result: string[] = [];
  let prevType: 'header' | 'image' | 'table' | 'text' | 'empty' = 'empty';

  const getType = (line: string): typeof prevType => {
    const trimmed = line.trim();
    if (trimmed === '') return 'empty';
    if (/^#{2,4}\s/.test(trimmed)) return 'header';
    if (/^\[IMAGE\]/.test(trimmed) || /^-\s*(종류|구도|포인트|alt)/.test(trimmed)) return 'image';
    if (/^\|/.test(trimmed)) return 'table';
    return 'text';
  };

  const addBlankIfNeeded = () => {
    if (result.length > 0 && result[result.length - 1].trim() !== '') result.push('');
  };

  for (const line of lines) {
    const type = getType(line);

    if (type === 'empty') {
      if (result.length > 0 && result[result.length - 1].trim() !== '') result.push('');
      prevType = 'empty';
      continue;
    }

    // 블록 전환 시점 (text → header, table → text 등) 빈 줄 보강
    if (prevType !== type && prevType !== 'empty') {
      // 단 image 메타라인(- 종류, - 구도 등)은 같은 블록으로 묶기
      const sameImageBlock = (prevType === 'image' && type === 'image');
      if (!sameImageBlock) addBlankIfNeeded();
    }

    result.push(line);
    prevType = type;
  }

  return result
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildDocRequests(content: string): any[] {
  const requests: any[] = [];
  const baseIndex = 1; // 문서의 시작 인덱스

  // HTML을 간단한 텍스트로 변환 (기본적인 구조만)
  let plainContent = content
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // 마크다운 줄바꿈 후처리 — 라인 단위 처리
  plainContent = normalizeMarkdownNewlines(plainContent);

  // 헤더 라인 식별 + ## 마커 제거 + 스타일 적용 위치 저장
  const lines = plainContent.split('\n');
  type HeaderInfo = { startIndex: number; endIndex: number; type: 'HEADING_2' | 'HEADING_3' };
  const headerInfos: HeaderInfo[] = [];
  const cleanedLines: string[] = [];
  let cursor = baseIndex;

  for (const line of lines) {
    const h2Match = /^(##\s+)(.+)$/.exec(line);
    const h3Match = !h2Match ? /^(###\s+)(.+)$/.exec(line) : null;
    const isHeader = !!(h2Match || h3Match);

    if (isHeader) {
      const cleanText = (h2Match ? h2Match[2] : h3Match![2]).trim();
      const lineStart = cursor;
      // endIndex는 다음 문단 단락 마커 직전까지. 즉 텍스트 + 1 (개행 포함)
      const lineEnd = lineStart + cleanText.length + 1;
      headerInfos.push({
        startIndex: lineStart,
        endIndex: lineEnd,
        type: h2Match ? 'HEADING_2' : 'HEADING_3',
      });
      cleanedLines.push(cleanText);
      cursor += cleanText.length + 1; // +1 for newline
    } else {
      cleanedLines.push(line);
      cursor += line.length + 1;
    }
  }

  const finalContent = cleanedLines.join('\n');

  // 1) 전체 텍스트 삽입
  requests.push({
    insertText: {
      location: { index: baseIndex },
      text: finalContent,
    },
  });

  // 2) 헤더 라인에 H2/H3 스타일 적용
  for (const h of headerInfos) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: h.startIndex, endIndex: h.endIndex },
        paragraphStyle: { namedStyleType: h.type },
        fields: 'namedStyleType',
      },
    });
  }

  return requests;
}
