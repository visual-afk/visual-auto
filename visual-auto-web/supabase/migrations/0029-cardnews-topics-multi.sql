-- 0029: 카드뉴스 주제 — 하루 여러 개 허용 (2026-08-27 대표 지시 "주제가 여러개여도 되잖아")
-- 실행: Supabase SQL Editor에 붙여넣고 Run (멱등 — 여러 번 실행해도 안전)

-- 하루 한 브랜드 한 주제 제약 제거 → 같은 날짜에 주제 여러 개 편성/이동 가능
alter table cardnews_topics drop constraint if exists cardnews_topics_branch_id_topic_date_key;

-- unique 인덱스가 사라지므로 조회용 일반 인덱스 보강 (월별 캘린더 조회 경로)
create index if not exists cardnews_topics_branch_date_idx on cardnews_topics (branch_id, topic_date);
