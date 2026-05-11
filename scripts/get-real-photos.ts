import { getDrive } from '../lib/google-auth.js';

const BEFORE_AFTER_FOLDER = '198WK_HbOazVSPbAdCjtREJAyCAdVTFQB';
const REVIEW_FOLDER = '1rtqgU8I2WmDZXT5sJfN9-Fb89EMk5_sq';

const BRANCH_REVIEW_MAP: Record<string, string> = {
  '성수점': '14UNWbb5rvSekpMiNOF6wKA1BpNFB-CXU',
  '마곡나루점': '1kH-vtW26i14eTd-9gFcO_pq6vib--Bfb',
  '강남신사점': '1IxQ-43_ZN_tgmwmYmi5P1rQFBQe04Onk',
  '사가정점': '1VrXG6RFuUW9Dskrficm3yMWhKvHzAQam',
  '사가정2호점': '1mWaNk8vmbZDCtpZ2ltYoySitXSO_qj4P',
};

const drive = getDrive();

/** 비포애프터 폴더에서 주제와 관련된 사진 가져오기 */
export async function getBeforeAfterPhotos(topic: string, maxCount = 3): Promise<string[]> {
  // 1. 주제와 관련된 하위 폴더 찾기
  const folders = await drive.files.list({
    q: `'${BEFORE_AFTER_FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const allFolders = folders.data.files || [];

  // 키워드 매칭으로 관련 폴더 찾기
  const keywords = topic.split(/\s+/);
  let matchedFolder = allFolders.find(f =>
    keywords.some(kw => f.name?.includes(kw))
  );

  // 매칭 안 되면 번호 폴더에서 랜덤 선택
  if (!matchedFolder) {
    const numbered = allFolders.filter(f => /^\d+$/.test(f.name || ''));
    if (numbered.length > 0) {
      matchedFolder = numbered[Math.floor(Math.random() * numbered.length)];
    }
  }

  if (!matchedFolder?.id) return [];

  // 2. 해당 폴더의 이미지 가져오기
  const images = await drive.files.list({
    q: `'${matchedFolder.id}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: maxCount,
  });

  return (images.data.files || []).map(f => f.id!).filter(Boolean);
}

/** 지점별 리뷰 캡처 가져오기 */
export async function getReviewPhotos(branch: string, maxCount = 2): Promise<string[]> {
  const folderId = BRANCH_REVIEW_MAP[branch];
  if (!folderId) return [];

  const images = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: maxCount,
  });

  return (images.data.files || []).map(f => f.id!).filter(Boolean);
}

/** 사진 ID를 공개 URL로 변환 */
export function photoIdToUrl(fileId: string): string {
  return `https://drive.google.com/uc?id=${fileId}`;
}
