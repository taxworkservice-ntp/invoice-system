# 2026-10-26 — Testco customer import (126 rows)

- Source: `C:\Users\buddynl\Desktop\ชื่อ ที่อยู่ ลูกค้า.xlsx` (Sheet1, rows 2–127; 126 data rows, rest blank).
- Target: บริษัท เทสท์ โค จำกัด (resolved at runtime via `client_profiles.company_name_th`).
- Mapping: รายชื่อลูกค้า→`name`, tax digits-only + `padStart(13,'0')`, ที่อยู่→`address`, สาขาที่ 0/blank→`note NULL` else `สาขาที่ N` (1 row: กลุ่มสยามบรรจุภัณฑ์ → สาขาที่ 7). `code` generated `C-001…` sequential from `max(existing C-###)+1`.
- Behavior: skip existing on `tax_id` or case-insensitive `name` match; backfill `code` only when existing `code IS NULL`; insert the rest with next free code. Idempotent — re-running changes nothing.
- Artifact: `sql/import_testco_customers.sql` (DO block, temp staging, RAISE NOTICE summary).
- PENDING MANUAL STEP: apply `sql/import_testco_customers.sql` in Supabase SQL editor (no service-role key locally, so no direct DB write was made). Verify via NOTICE counts + `/customers` search.

# 2026-10-26 (later) — Avatar default OFF + sortable รหัส

- `show_customer_avatars` default flipped ON→OFF: `sql/add_customer_avatar_visibility.sql` default now `false`; new `sql/20261026_avatar_default_off.sql` sets the column default to false and forces all existing rows off.
- App fallback flipped `!== false`→`=== true` in `settings/company.tsx`, `customers/index.tsx`, `home.tsx` (missing pre-migration = hidden); `useState` default false; `types/index.ts` comment updated.
- Detail page (`customers/[id].tsx`): when global is off, the `avatar:` status line and the whole `รูป avatar` editor are replaced with one muted note linking to `ตั้งค่า → การแสดงผล`. Values stay in DB.
- `/customers` รหัส column is now sortable (`SortableTh` + `"code"` in `CustomerSortKey`; nulls sink last).
- PENDING MANUAL STEP: apply `sql/20261026_avatar_default_off.sql` in Supabase SQL editor (Supabase migrations in `sql/` are applied manually).

# 2026-10-26 (later) — Retarget to live client, clean testko

- Live workspace บริษัท เอส.อาร์. แสตมป์ปิ้ง พลัส จำกัด currently holds only 2 customers.
- `sql/remove_testko_customers.sql`: deletes the 126 spreadsheet rows from บริษัท เทสท์ โค จำกัด (match by tax_id or case-insensitive name); rows referenced by that workspace's deals/documents are KEPT and reported (`kept_referenced` + names, FKs are NO ACTION). Idempotent.
- `sql/import_sr_stamping_customers.sql`: same 126 + mapping, OVERWRITE rule for the live workspace — match → UPDATE name/tax/address/note + reactivate, code preserved (backfilled when NULL); no match → INSERT with next free `C-###` from that workspace's max.
- Suggested run order: pre-check both `client_profiles` rows (exact name spelling — scripts abort otherwise) → remove from testko → import to live → verify NOTICE counts + `select count(*)` per workspace + spot-check `/customers`.
- PENDING MANUAL STEP: apply both scripts in Supabase SQL editor (no service key locally).
