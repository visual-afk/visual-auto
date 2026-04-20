import { getDrive } from '../lib/google-auth.js';

const drive = getDrive();

const deleteIds = process.argv.slice(2);
for (const id of deleteIds) {
  try {
    await drive.files.update({
      fileId: id,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
    console.log(`휴지통 이동: ${id}`);
  } catch (e) {
    console.log(`스킵: ${id} - ${(e as Error).message?.slice(0, 50)}`);
  }
}
