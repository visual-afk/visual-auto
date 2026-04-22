import { getDrive } from '../lib/google-auth.js';

const drive = getDrive();

try {
  const res = await drive.files.get({
    fileId: '1M6i96IOx4rNs-0Cz6dxrG-44szlhua6P',
    fields: 'id,name',
    supportsAllDrives: true,
  });
  console.log('폴더 접근 성공:', res.data.name);
} catch (e: any) {
  console.log('에러 코드:', e.code);
  console.log('에러 메시지:', e.message);
}
