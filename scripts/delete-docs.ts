import { getDrive } from '../lib/google-auth.js';

const drive = getDrive();

const deleteIds = process.argv.slice(2);
if (deleteIds.length === 0) {
  console.log('사용법: npx tsx scripts/delete-docs.ts [docId1] [docId2] ...');
  process.exit(1);
}

for (const id of deleteIds) {
  try {
    await drive.files.delete({ fileId: id, supportsAllDrives: true });
    console.log(`삭제 완료: ${id}`);
  } catch {
    console.log(`스킵 (이미 삭제됨): ${id}`);
  }
}
