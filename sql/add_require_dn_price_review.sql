-- ============================================================
-- Mandatory price review on delivery notes (opt-in per client).
-- Owner enables it in ตั้งค่า › รูปแบบเอกสาร ("บังคับยืนยันราคา
-- ทุกครั้งที่ออกใบส่งของ"). Default OFF — other businesses are
-- unaffected until they opt in.
-- ============================================================

alter table public.client_profiles
  add column if not exists require_dn_price_review boolean not null default false;

select count(*) as clients_with_flag
from public.client_profiles
where require_dn_price_review is not null;
