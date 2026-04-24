import { getDrive } from '../lib/google-auth.js';

const folderId = process.argv[2];
if (!folderId) {
  console.log('사용법: npx tsx scripts/list-drive-folder.ts [폴더ID]');
  process.exit(1);
}

const drive = getDrive();

// 폴더 안의 하위 폴더 + 파일 목록
const res = await drive.files.list({
  q: `'${folderId}' in parents and trashed = false`,
  fields: 'files(id, name, mimeType)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 100,
  orderBy: 'name',
});

const files = res.data.files || [];
const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
const images = files.filter(f => f.mimeType?.startsWith('image/'));
const others = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder' && !f.mimeType?.startsWith('image/'));

console.log(`\n총 ${files.length}개 (폴더 ${folders.length}개, 이미지 ${images.length}개, 기타 ${others.length}개)\n`);

if (folders.length > 0) {
  console.log('📁 폴더:');
  for (const f of folders) console.log(`  ${f.name} | ${f.id}`);
}
if (images.length > 0) {
  console.log(`\n🖼️  이미지 (${images.length}개):`);
  for (const f of images) console.log(`  ${f.name}`);
}
if (others.length > 0) {
  console.log(`\n📄 기타:`);
  for (const f of others) console.log(`  ${f.name} (${f.mimeType})`);
}
