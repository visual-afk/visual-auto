-- =====================================================================
-- 리뷰가져오기 지점별 링크 오류 정정 (0008 시드 오류 수정)
-- 실행: Supabase SQL Editor 에 붙여넣기 (2026-07-07 프로덕션 반영 완료)
--
-- 원인:
--   0008에서 서초방배점에 사가정 1호점의 placeId(1071044259)가 잘못 시드됨
--   → 서초방배점 "리뷰 보러가기"가 사가정점 리뷰로 연결
--   사가정점은 placeId 없이 단축링크만 있어 리뷰 딥링크 생성 불가
--   부천신중동점은 placeId·단축링크 둘 다 없어 버튼 자체가 미표시
--
-- 검증 근거:
--   사가정점    1071044259 — naver.me/5A3HX3ng(links.md 사가정 1호점) 리다이렉트 확인
--   서초방배점  1903236993 — 공식 사이트 visualsalon.co.kr/67 지도 링크
--   부천신중동점 1983276055 — 공식 사이트 visualsalon.co.kr/68 → naver.me/xv3f0EqK
-- =====================================================================

update branches set naver_place_id = '1071044259' where name = '사가정점';
update branches set naver_place_id = '1903236993' where name = '서초방배점';
update branches
  set naver_place_id = '1983276055',
      naver_short_url = 'https://naver.me/xv3f0EqK'
  where name = '부천신중동점';
