import { getDrive } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const drive = getDrive();
const res = await drive.files.list({
  q: `'${config.google.docsFolderId}' in parents and mimeType='application/vnd.google-apps.document'`,
  fields: 'files(id, name, createdTime)',
  orderBy: 'createdTime desc',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
});

for (const f of res.data.files || []) {
  console.log(`${f.name} | ${f.id}`);
}
