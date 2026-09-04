-- =====================================================================
-- 리뷰 답글: 지점별 네이버 공개 플레이스 리뷰 딥링크 + (실험적) 자동 수집
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

-- ── 지점 ↔ 네이버 플레이스 매핑 ──
alter table branches add column if not exists naver_short_url text;  -- naver.me 단축링크 (links.md, 폴백용)
alter table branches add column if not exists naver_place_id text;   -- 공개 플레이스 placeId (딥링크/수집 대상)

-- placeId 시드 (pcmap.place.naver.com/hairshop/{placeId}/review)
update branches set naver_place_id = '2068222017' where name = '강남신사점';
update branches set naver_place_id = '1030021833' where name = '마곡나루점';
update branches set naver_place_id = '1335021795' where name = '성수점';
update branches set naver_place_id = '1165494267' where name = '사가정2호점';
update branches set naver_place_id = '1071044259' where name = '서초방배점';
update branches set naver_place_id = '2006060726' where name = '서면전포점';
-- 사가정점(1호점)·부천신중동점 = placeId 미정 → null (딥링크는 naver_short_url 폴백)

-- naver.me 단축링크 시드 (폴백 + placeId 미확보 지점용, knowledge/brand/links.md 기준)
update branches set naver_short_url = 'https://naver.me/FRLTsCEs' where name = '성수점';
update branches set naver_short_url = 'https://naver.me/5k7jlk97' where name = '마곡나루점';
update branches set naver_short_url = 'https://naver.me/G8hvr7IB' where name = '강남신사점';
update branches set naver_short_url = 'https://naver.me/5A3HX3ng' where name = '사가정점';
update branches set naver_short_url = 'https://naver.me/I55aj5kg' where name = '사가정2호점';
update branches set naver_short_url = 'https://naver.me/x1uuPQij' where name = '서면전포점';
