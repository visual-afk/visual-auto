import { getDrive } from '../lib/google-auth.js';

const drive = getDrive();
const fileId = process.argv[2];
const newName = process.argv[3];

if (!fileId || !newName) {
  console.log('사용법: npx tsx scripts/rename-doc.ts [fileId] [새이름]');
  process.exit(1);
}

await drive.files.update({
  fileId,
  requestBody: { name: newName },
  supportsAllDrives: true,
});

console.log(`✅ 이름 변경: ${newName}`);
