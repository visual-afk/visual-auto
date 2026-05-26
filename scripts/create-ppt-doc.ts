import { getDrive, getDocs } from '../lib/google-auth.js';
import { config } from '../lib/config.js';
import { readFileSync } from 'fs';

const drive = getDrive();
const docs = getDocs();

const file = await drive.files.create({
  requestBody: {
    name: '블로그 AI 자동화 4~5월 운영 실적 발표자료',
    mimeType: 'application/vnd.google-apps.document',
    parents: [config.google.docsFolderId],
  },
  supportsAllDrives: true,
});

const docId = file.data.id!;
const content = readFileSync('output/발표자료-4월5월실적.md', 'utf-8');

await docs.documents.batchUpdate({
  documentId: docId,
  requestBody: {
    requests: [{
      insertText: {
        location: { index: 1 },
        text: content,
      },
    }],
  },
});

console.log(`https://docs.google.com/document/d/${docId}/edit`);
