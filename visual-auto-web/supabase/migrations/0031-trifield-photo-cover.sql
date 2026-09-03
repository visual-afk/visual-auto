-- 0031: 트리필드 카드를 사진 카드로 (2026-09-03 대표 지시 "사진 넣게, 글자는 하단 흰색+그림자, 전체를")
-- 실행: Supabase SQL Editor에 붙여넣고 Run (멱등)
-- 표지·포인트·CTA 전부 실사 배경 + 하단 흰 글씨로 렌더된다.
-- 다른 브랜드(비주얼살롱·아카데미·누혜)는 기존 단색 카드 유지 — 트리필드 행만 토큰 추가

update card_frames
   set tokens = (tokens - 'coverStyle') || '{"cardStyle":"photo"}'::jsonb
 where branch_id = (select id from branches where name = '트리필드');
