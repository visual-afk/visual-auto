-- =====================================================================
-- 릴스 레퍼런스 영상 버킷 (비공개)
-- 실행: Supabase SQL Editor 에 붙여넣기
--
-- 왜: 착즙기(레퍼런스 영상 분석)가 영상을 라우트로 직접 프록시해
--     Vercel 서버리스 바디 한계(~4.5MB)에 막혔다. 면담 녹음(interview-audio)과
--     동일하게 클라이언트가 서명 URL로 스토리지에 직접 올리고, 서버 admin이
--     내려받아 Gemini로 분석한 뒤 곧바로 삭제한다(임시 저장소).
--
-- 접근: 업로드는 서명 업로드 URL 토큰, 읽기/삭제는 전부 서버 admin →
--       interview-audio 처럼 별도 RLS 정책 불필요.
-- =====================================================================

insert into storage.buckets (id, name, public)
  values ('reels-video', 'reels-video', false)
  on conflict (id) do nothing;
