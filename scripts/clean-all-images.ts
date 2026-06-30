import { getDrive } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const drive = getDrive();

const res = await drive.files.list({
  q: `'${config.google.docsFolderId}' in parents and mimeType='image/png'`,
  fields: 'files(id, name)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 200,
});

const files = res.data.files || [];
console.log(`${files.length}개 이미지 발견. 휴지통으로 이동 중...`);

let success = 0;
for (const f of files) {
  if (!f.id) continue;
  try {
    await drive.files.update({
      fileId: f.id,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
    success++;
    if (success % 20 === 0) console.log(`  ${success}/${files.length}...`);
  } catch { /* skip */ }
}

console.log(`\n✅ ${success}개 이미지 휴지통 이동 완료`);
