-- =====================================================================
-- 브랜드 글쓰기 + 카드뉴스
--   1) branch_users.last_write_branch_id — 마지막으로 고른 글쓰기 지점/브랜드 기억
--   2) posts.publish_target 'manual' 허용 — 브랜드 글은 "발행용 복사"로 발행
--   3) card_news — 글에서 뽑은 인스타 카드뉴스 (reels 와 동형, /track 패턴 재사용)
--   4) card_frames — 브랜드별 카드 디자인 토큰 (본사가 프롬프트 관리에서 수정)
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
-- ⚠️ 배포 순서: 이 SQL을 먼저 실행한 뒤 코드를 배포할 것
-- =====================================================================

-- ── 1) 마지막 글쓰기 지점/브랜드 (서버측 사용자 설정) ──
alter table branch_users add column if not exists
  last_write_branch_id uuid references branches(id) on delete set null;

comment on column branch_users.last_write_branch_id is
  '글쓰기에서 마지막으로 고른 지점/브랜드. /api/generate 성공 시 갱신, 다음 방문 때 프리셀렉트.';

-- ── 2) 브랜드 글 발행: 복사만 하고 담당자가 직접 올림 ──
alter table posts drop constraint if exists posts_publish_target_check;
alter table posts add constraint posts_publish_target_check
  check (publish_target in ('naver','imweb','manual'));

-- ── 사진 버킷 멱등 재선언 (schema.sql 과 동일 — 라이브 DB 누락 대비) ──
insert into storage.buckets (id, name, public)
  values ('post-photos', 'post-photos', true)
  on conflict (id) do nothing;

drop policy if exists post_photos_read on storage.objects;
create policy post_photos_read on storage.objects for select
  using (bucket_id = 'post-photos');
drop policy if exists post_photos_write on storage.objects;
create policy post_photos_write on storage.objects for insert
  with check (bucket_id = 'post-photos' and auth.uid() is not null);

-- ── 3) 카드뉴스 (reels 와 동형) ──
create table if not exists card_news (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete set null,   -- 원본 글
  branch_id uuid not null references branches(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('info','image')),    -- 정보형/이미지형
  card_count int not null default 5,
  -- info:  [{idx, kind:'cover'|'point'|'cta', title, body}]
  -- image: [{idx, photo_path, phrase, is_cta}]
  cards jsonb not null default '[]'::jsonb,
  caption text,                                           -- 이미지형 인스타 캡션
  hashtags text[] default '{}',
  status text not null default 'draft' check (status in ('draft','published')),
  published_url text,
  ig_media_id text,                                       -- 인스타 공식 API 매칭 캐시
  views int,
  saves int,
  views_updated_at timestamptz,
  next_check_at date,                                     -- "3일 뒤 다시" 리마인드
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists card_news_branch_idx on card_news(branch_id);
create index if not exists card_news_author_idx on card_news(author_id);
create index if not exists card_news_post_idx   on card_news(post_id);

alter table card_news enable row level security;
-- 본사만 만들기(기본)는 DB가 아니라 앱 레이어 플래그로 제어 —
-- 나중에 정보형을 디자이너에게 열 때 마이그레이션 없이 켤 수 있게.
drop policy if exists card_news_read on card_news;
create policy card_news_read on card_news for select
  using (is_hq() or branch_id = my_branch_id());
drop policy if exists card_news_insert on card_news;
create policy card_news_insert on card_news for insert
  with check (author_id = auth.uid() and (branch_id = my_branch_id() or is_hq()));
drop policy if exists card_news_update on card_news;
create policy card_news_update on card_news for update
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));
drop policy if exists card_news_delete on card_news;
create policy card_news_delete on card_news for delete
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));

-- ── 4) 브랜드 카드 프레임 토큰 ──
-- content_overrides(자유 텍스트)가 아니라 전용 테이블인 이유:
-- 컬러는 구조화된 입력 + 미리보기가 필요하고, md 텍스트로 두면 JSON이 조용히 깨진다.
create table if not exists card_frames (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid unique references branches(id) on delete cascade, -- null = 지점(살롱) 기본 프레임
  mode text not null default 'info' check (mode in ('info','image')),
  -- tokens 키: bg, surface, ink, point, logoText, ctaBg, ctaInk (이미지형은 ink/point/logoText만)
  tokens jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- 기본 프레임(branch_id null)은 1행만
create unique index if not exists card_frames_default_one on card_frames ((1)) where branch_id is null;

alter table card_frames enable row level security;
drop policy if exists card_frames_read on card_frames;
create policy card_frames_read on card_frames for select using (auth.uid() is not null);
drop policy if exists card_frames_write on card_frames;
create policy card_frames_write on card_frames for all using (is_hq()) with check (is_hq());

-- 시드: 브랜드 4종 + 지점 기본 (있으면 건너뜀 — 본사가 고친 값 보존)
insert into card_frames (branch_id, mode, tokens)
select id, 'info', '{"bg":"#FFFFFF","surface":"#F7F4F0","ink":"#1C1C1E","point":"#B8865B","logoText":"TRIFIELD","ctaBg":"#1C1C1E","ctaInk":"#FFFFFF"}'::jsonb
  from branches where name = '트리필드'
on conflict (branch_id) do nothing;

insert into card_frames (branch_id, mode, tokens)
select id, 'info', '{"bg":"#FFFFFF","surface":"#F0FAF7","ink":"#1C1C1E","point":"#2DD4BF","logoText":"VISUAL ACADEMY","ctaBg":"#1C1C1E","ctaInk":"#FFFFFF"}'::jsonb
  from branches where name = '아카데미'
on conflict (branch_id) do nothing;

insert into card_frames (branch_id, mode, tokens)
select id, 'image', '{"ink":"#FFFFFF","point":"#00F5D4","logoText":"VISUAL SALON"}'::jsonb
  from branches where name = '비주얼살롱'
on conflict (branch_id) do nothing;

insert into card_frames (branch_id, mode, tokens)
select id, 'image', '{"ink":"#FFFFFF","point":"#88B04B","logoText":"NUHYÉ"}'::jsonb
  from branches where name = '누혜'
on conflict (branch_id) do nothing;

-- 지점(살롱) 기본: 정보형, 앱 브랜드 블루. logoText 비우면 렌더러가 지점명을 쓴다.
insert into card_frames (branch_id, mode, tokens)
select null, 'info', '{"bg":"#FFFFFF","surface":"#EEF2FB","ink":"#1D1D22","point":"#5B7FD4","logoText":"","ctaBg":"#1D1D22","ctaInk":"#FFFFFF"}'::jsonb
where not exists (select 1 from card_frames where branch_id is null);
