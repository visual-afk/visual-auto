-- =====================================================================
-- 글쓰기 전용 브랜드: branches.kind 구분 컬럼 + 브랜드 4개 행
--   'salon' = 미용실 지점 (성과/멤버/출근 등 운영 대시보드 대상)
--   'brand' = 콘텐츠 전용 (글쓰기·주제추천 등에서만 노출)
-- 실행: Supabase SQL Editor 에 붙여넣기
-- ⚠️ 배포 순서: 이 SQL을 먼저 실행한 뒤 코드를 배포할 것 (kind select 에러 방지)
-- =====================================================================

alter table branches add column if not exists kind text not null default 'salon'
  check (kind in ('salon','brand'));

-- 글쓰기 전용 브랜드 4개 (name = knowledge 파일명과 일치해야 함:
--   knowledge/consumer/branch-{name}.md, knowledge/seo/keywords-{name}.md)
insert into branches (name, kind, knowledge_slug) values
  ('아카데미', 'brand', '아카데미'),
  ('트리필드', 'brand', '트리필드'),
  ('누혜', 'brand', '누혜'),
  ('비주얼살롱', 'brand', '비주얼살롱')
on conflict (name) do update set kind = 'brand';
