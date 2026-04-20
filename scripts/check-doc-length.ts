import { getDocs } from '../lib/google-auth.js';

const docs = getDocs();
const docIds = process.argv.slice(2);

for (const id of docIds) {
  const doc = await docs.documents.get({ documentId: id });
  const content = doc.data.body?.content || [];
  let totalChars = 0;
  for (const el of content) {
    if (el.paragraph) {
      for (const e of el.paragraph.elements || []) {
        totalChars += (e.textRun?.content || '').length;
      }
    }
  }
  console.log(`${doc.data.title}: ${totalChars}자`);
}
