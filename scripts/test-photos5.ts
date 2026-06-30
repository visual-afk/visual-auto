import { getDrive } from '../lib/google-auth.js';

const drive = getDrive();
const FOLDER = '198WK_HbOazVSPbAdCjtREJAyCAdVTFQB';

// 1. 하위 폴더 찾기
const folders = await drive.files.list({
  q: `'${FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  fields: 'files(id, name)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  corpora: 'allDrives',
  pageSize: 50,
});

const allFolders = folders.data.files || [];
console.log(`폴더 ${allFolders.length}개 발견`);

const numbered = allFolders.filter(f => /^\d+$/.test(f.name || ''));
console.log(`번호 폴더 ${numbered.length}개`);

// 폴더 이름 확인
for (const f of allFolders.slice(0, 10)) {
  const name = f.name || '';
  console.log(`  "${name}" -> isNum: ${/^\d+$/.test(name)} -> chars: ${[...name].map(c => c.charCodeAt(0)).join(',')}`);
}

if (numbered.length > 0) {
  const testFolder = numbered[0];
  console.log(`\n테스트: ${testFolder.name} (${testFolder.id})`);

  const images = await drive.files.list({
    q: `'${testFolder.id}' in parents and mimeType contains 'image/' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
    pageSize: 3,
  });

  console.log(`이미지 ${images.data.files?.length || 0}장`);
  for (const img of images.data.files || []) {
    console.log(`  ${img.name} -> https://drive.google.com/uc?id=${img.id}`);
  }
}
