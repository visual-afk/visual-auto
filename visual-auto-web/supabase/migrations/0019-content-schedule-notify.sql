-- =====================================================================
-- 콘텐츠 캘린더 v2: 기한 경과 알림톡 발송 스탬프
-- 크론은 null 또는 3일 경과 항목만 재발송, 수동 발송도 이 컬럼을 갱신해
-- 자동/수동 이중 발송을 막는다.
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
-- =====================================================================

alter table content_schedule
  add column if not exists overdue_notified_at timestamptz;

comment on column content_schedule.overdue_notified_at is
  '기한 경과 알림톡 마지막 발송 시각. 크론은 null 또는 3일 경과 시에만 재발송, 수동 발송도 갱신.';

-- 크론 스캔용 부분 인덱스 (planned 만 대상)
create index if not exists content_schedule_overdue_idx
  on content_schedule (scheduled_date)
  where status = 'planned';
