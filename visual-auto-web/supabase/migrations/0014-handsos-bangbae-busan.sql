-- 서면전포점(부산)·서초방배점 HandSOS 연동 — PkCompany 매핑.
-- HandSOS 계정(h66990005) 지점선택 셀렉트에서 확인:
--   12558403 = 비주얼살롱 서면전포점, 12558477 = 비주얼살롱 서초방배점
-- 부천신중동점은 HandSOS에 미등록 (계속 handsos_pk null → 대시보드 빈 상태).

update public.branches set handsos_pk = '12558403' where name = '서면전포점' and handsos_pk is null;
update public.branches set handsos_pk = '12558477' where name = '서초방배점' and handsos_pk is null;
