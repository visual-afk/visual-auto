import { updateCell } from '../lib/google-sheets.js';
import { SHEET_COLUMNS } from '../lib/config.js';

// 원래 URL 복구
const fixes: { row: number; imweb?: string; naver?: string; status: string }[] = [
  { row: 2, imweb: 'https://visualsalon.co.kr/hair-beauty-contents/?q=YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9&bmode=view&idx=170877973&t=board', naver: 'https://blog.naver.com/yygg0422/224255491943', status: 'published' },
  { row: 3, naver: 'https://blog.naver.com/yygg0422/224255491943', status: 'published' },
  { row: 4, imweb: 'https://visualsalon.co.kr/hair-beauty-contents/?q=YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9&bmode=view&idx=170945718&t=board', status: 'published' },
  { row: 5, naver: 'https://blog.naver.com/yygg0422/224259553225', status: 'published' },
  { row: 6, imweb: 'https://visualsalon.co.kr/hair-beauty-contents/?q=YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9&bmode=view&idx=170962677&t=board', status: 'published' },
  { row: 7, naver: 'https://blog.naver.com/yygg0422/224262307616', status: 'published' },
  { row: 8, imweb: 'https://visualsalon.co.kr/hair-beauty-contents/?q=YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9&bmode=view&idx=170992963&t=board', status: 'published' },
  { row: 9, naver: 'https://blog.naver.com/yygg0422/224266559633', status: 'published' },
];

for (const fix of fixes) {
  await updateCell(fix.row, SHEET_COLUMNS.STATUS, fix.status);
  if (fix.imweb) await updateCell(fix.row, SHEET_COLUMNS.IMWEB_URL, fix.imweb);
  if (fix.naver) await updateCell(fix.row, SHEET_COLUMNS.NAVER_URL, fix.naver);
  console.log(`행 ${fix.row} 복구 완료`);
}
console.log('\n전체 복구 완료!');
