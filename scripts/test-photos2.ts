import { getDrive } from '../lib/google-auth.js';

const drive = getDrive();
const FOLDER = '198WK_HbOazVSPbAdCjtREJAyCAdVTFQB';

// 하위 폴더 목록
const folders = await drive.files.list({
  q: `'${FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  fields: 'files(id, name)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
});

const allFolders = folders.data.files || [];
const numbered = allFolders.filter(f => /^\d+$/.test(f.name || ''));
console.log(`번호 폴더 ${numbered.length}개 발견`);

// 첫번째 번호 폴더에서 이미지 가져오기
const first = numbered[0];
console.log(`\n테스트 폴더: ${first.name} (${first.id})`);

const images = await drive.files.list({
  q: `'${first.id}' in parents and mimeType contains 'image/' and trashed=false`,
  fields: 'files(id, name, mimeType)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 3,
});

console.log(`이미지: ${images.data.files?.length}장`);
for (const img of images.data.files || []) {
  console.log(`  ${img.name} (${img.mimeType}) -> https://drive.google.com/uc?id=${img.id}`);
}
