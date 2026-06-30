import { getDrive } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const drive = getDrive();

try {
  const folder = await drive.files.get({
    fileId: config.google.docsFolderId,
    fields: 'id, name, owners(emailAddress)',
    supportsAllDrives: true,
  });
  console.log('OK 폴더 접근 성공:', folder.data.name);
  console.log('소유자:', folder.data.owners?.map(o => o.emailAddress).join(', '));
} catch (e: any) {
  console.error('FAIL 폴더 접근 실패:', e.message);
  console.error('Service Account:', config.google.serviceAccountEmail);
  console.error('Folder ID:', config.google.docsFolderId);
}
