-- 0031: 트리필드 표지를 사진 커버로 (2026-08-29 대표 지시 "사진 넣을 수 있게, 글자는 하단 흰색+그림자")
-- 실행: Supabase SQL Editor에 붙여넣고 Run (멱등)
-- 다른 브랜드(비주얼살롱·아카데미·누혜)는 기존 단색 표지 유지 — 트리필드 행만 토큰 추가

update card_frames
   set tokens = tokens || '{"coverStyle":"photo"}'::jsonb
 where branch_id = (select id from branches where name = '트리필드');
