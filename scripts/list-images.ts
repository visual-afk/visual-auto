import { getDrive } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const drive = getDrive();
const res = await drive.files.list({
  q: `'${config.google.docsFolderId}' in parents and mimeType='image/png'`,
  fields: 'files(id, name, createdTime)',
  orderBy: 'createdTime desc',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  pageSize: 100,
});

const files = res.data.files || [];
console.log(`이미지 ${files.length}개 발견\n`);
for (const f of files) {
  console.log(`${f.name} | ${f.id}`);
}
