import { getDrive } from '../lib/google-auth.js';
import { config } from '../lib/config.js';
import { readFileSync } from 'fs';
import { Readable } from 'stream';

async function main() {
  const drive = getDrive();
  const content = readFileSync('/Users/guest1/뇌2-브랜딩미용서사.md', 'utf-8');

  const file = await drive.files.create({
    requestBody: {
      name: '뇌2-브랜딩미용서사.md',
      parents: [config.google.docsFolderId],
    },
    media: {
      mimeType: 'text/markdown',
      body: Readable.from(content),
    },
    supportsAllDrives: true,
  });

  const fileId = file.data.id;

  // 링크 공유 설정 (누구나 볼 수 있게)
  await drive.permissions.create({
    fileId: fileId!,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });

  console.log('✅ 업로드 완료!');
  console.log(`📎 링크: https://drive.google.com/file/d/${fileId}/view`);
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
