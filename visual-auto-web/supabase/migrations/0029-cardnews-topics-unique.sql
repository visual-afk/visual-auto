-- 0028의 unique (branch_id, topic_date)가 프로덕션에 누락된 경우 보정 (멱등).
-- 이 제약이 없으면 topic-seed.ts의 upsert(ON CONFLICT)가 매번 42P10으로 실패해
-- 트리필드 매일 편성 크론(extend-cardnews-topics)이 동작하지 않는다.
-- 실행 전 중복 확인(2026-09-03 기준 중복 0건 확인됨):
--   select branch_id, topic_date, count(*) from cardnews_topics group by 1,2 having count(*) > 1;
create unique index if not exists cardnews_topics_branch_date_key
  on cardnews_topics (branch_id, topic_date);
