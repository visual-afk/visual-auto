import { searchUnsplash } from './unsplash.js';

const urls = await searchUnsplash('머릿결 관리 윤기', 3);
console.log(`찾은 사진: ${urls.length}장`);
for (const u of urls) console.log(' ', u);
