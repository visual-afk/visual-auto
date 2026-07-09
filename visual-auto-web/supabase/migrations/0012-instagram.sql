-- =====================================================================
-- 인스타그램 공식 연동 (Instagram API with Instagram Login)
-- 디자이너가 본인 프로페셔널 계정을 OAuth로 연결 → 릴스 조회수·저장수 자동 수집
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

create table if not exists instagram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ig_user_id text not null,
  username text not null,
  access_token text not null,              -- long-lived (60일). 서버(service role)만 읽는다
  token_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);

alter table instagram_accounts enable row level security;
-- 클라이언트 정책 없음: 토큰 보호를 위해 모든 접근은 API 라우트(service role)로만.
-- (select 정책도 열지 않는다 — 연결 여부는 서버 컴포넌트가 admin으로 조회해 전달)

-- 릴스 ↔ 인스타 미디어 매칭 캐시 (permalink 매칭 결과)
alter table reels add column if not exists ig_media_id text;
