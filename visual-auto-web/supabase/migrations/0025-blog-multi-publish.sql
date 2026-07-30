-- 0025: 블로그 복수 발행처 지원 (같은 글을 아임웹·네이버 양쪽에 올리는 경우 둘 다 집계)
-- 기존 publish_target(단일)로는 양쪽 발행을 표현할 수 없어, 발행처별 불리언으로 전환한다.
-- publish_target 컬럼은 과거 데이터 보존을 위해 남겨두되, 집계·표시·순위추적은 아래 두 컬럼을 쓴다.

alter table posts add column if not exists posted_imweb boolean not null default false;
alter table posts add column if not exists posted_naver boolean not null default false;

-- 기존 단일 발행처 백필 (published/draft 무관하게 기록돼 있던 값 그대로 옮김)
update posts set posted_imweb = true where publish_target = 'imweb' and posted_imweb = false;
update posts set posted_naver = true where publish_target = 'naver' and posted_naver = false;

-- 네이버 순위추적·집계 필터용 부분 인덱스
create index if not exists posts_posted_naver_idx on posts(posted_naver) where posted_naver;
create index if not exists posts_posted_imweb_idx on posts(posted_imweb) where posted_imweb;
