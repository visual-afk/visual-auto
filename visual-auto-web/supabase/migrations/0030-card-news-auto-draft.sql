-- 0030: 카드뉴스 초안 자동 생성 (2026-08-27 대표 지시 "헤드라인·초안·캡션까지 자동으로")
-- 실행: Supabase SQL Editor에 붙여넣고 Run (멱등)

-- 크론이 만드는 초안은 작성자가 없다 (author_id null = 자동 생성)
alter table card_news alter column author_id drop not null;
