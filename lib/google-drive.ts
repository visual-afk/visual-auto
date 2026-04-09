import { getDrive } from './google-auth.js';
import { config } from './config.js';

export async function listDocsInFolder(): Promise<{ id: string; name: string; url: string }[]> {
  const drive = getDrive();

  const response = await drive.files.list({
    q: `'${config.google.docsFolderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    fields: 'files(id, name, webViewLink, createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 50,
  });

  return (response.data.files || []).map(f => ({
    id: f.id || '',
    name: f.name || '',
    url: f.webViewLink || `https://docs.google.com/document/d/${f.id}/edit`,
  }));
}

export async function checkFolderAccess(): Promise<boolean> {
  const drive = getDrive();

  try {
    await drive.files.get({
      fileId: config.google.docsFolderId,
      fields: 'id, name',
    });
    return true;
  } catch {
    return false;
  }
}
