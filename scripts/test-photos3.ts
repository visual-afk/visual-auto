import { getDrive } from '../lib/google-auth.js';

const drive = getDrive();
const FOLDER = '198WK_HbOazVSPbAdCjtREJAyCAdVTFQB';

// 방법 1: 일반 조회
console.log('=== 방법 1: 일반 조회 ===');
const res1 = await drive.files.list({
  q: `'${FOLDER}' in parents and trashed=false`,
  fields: 'files(id, name, mimeType)',
  pageSize: 5,
});
console.log(`결과: ${res1.data.files?.length || 0}개`);

// 방법 2: supportsAllDrives + includeItemsFromAllDrives
console.log('\n=== 방법 2: AllDrives 포함 ===');
const res2 = await drive.files.list({
  q: `'${FOLDER}' in parents and trashed=false`,
  fields: 'files(id, name, mimeType)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 5,
});
console.log(`결과: ${res2.data.files?.length || 0}개`);

// 방법 3: 폴더 자체 접근 확인
console.log('\n=== 방법 3: 폴더 자체 접근 ===');
try {
  const folder = await drive.files.get({
    fileId: FOLDER,
    fields: 'id, name, mimeType, shared, owners',
    supportsAllDrives: true,
  });
  console.log(`폴더 이름: ${folder.data.name}`);
  console.log(`소유자: ${JSON.stringify(folder.data.owners)}`);
  console.log(`공유됨: ${folder.data.shared}`);
} catch (e) {
  console.log(`폴더 접근 실패: ${(e as Error).message?.slice(0, 100)}`);
}

// 방법 4: driveId 포함
console.log('\n=== 방법 4: corpora=allDrives ===');
const res4 = await drive.files.list({
  q: `'${FOLDER}' in parents and trashed=false`,
  fields: 'files(id, name, mimeType)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  corpora: 'allDrives',
  pageSize: 5,
});
console.log(`결과: ${res4.data.files?.length || 0}개`);
for (const f of res4.data.files || []) {
  console.log(`  ${f.name} (${f.mimeType})`);
}
