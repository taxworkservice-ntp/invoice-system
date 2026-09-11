-- ============================================================
-- SEED: 10 after-print / stamping services for testcompany@gmail.com
-- Run directly in Supabase SQL editor (idempotent — safe to re-run).
--
-- Each service has "เก็บรายละเอียดงานของบริการนี้" enabled
-- (items.has_job_details = true) with the 5 standard job-detail
-- fields (สี/ฟอยล์, ขนาด, ตำแหน่ง, วัสดุ, หมายเหตุ) + Thai
-- stamping presets (foil colors, positions, materials, remarks).
-- ============================================================

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email = 'testcompany@gmail.com';

  if v_user_id is null then
    raise exception 'No auth user found with email testcompany@gmail.com';
  end if;

  -- ----------------------------------------------------------
  -- 0. Feature flag (already on for testcompany, keep enabled)
  -- ----------------------------------------------------------
  insert into public.client_features (user_id, feature_key, enabled)
  values (v_user_id, 'service_job_details', true)
  on conflict (user_id, feature_key)
  do update set enabled = true, updated_at = now();

  -- ----------------------------------------------------------
  -- 1. Service items (AFT- prefix)
  -- ----------------------------------------------------------
  insert into public.items
    (user_id, name, sku, item_type, unit_price, has_job_details,
     base_unit, carton_unit, qty_per_carton,
     stock_count, avg_cost, stock_value, low_stock_threshold,
     is_favorite, is_active)
  select v_user_id, v.name, v.sku, 'service', v.price, true,
         v.unit, null, null,
         0, 0, 0, 0,
         false, true
  from (values
    ('ปั๊มฟอยล์ทอง / เงิน (Hot Foil Stamping)', 'AFT-FOIL',     'จุด',  8.00),
    ('ปั๊มนูน (Emboss)',                        'AFT-EMBOSS',   'จุด',  6.00),
    ('ปั๊มจม (Deboss)',                         'AFT-DEBOSS',   'จุด',  6.00),
    ('เคลือบ UV เฉพาะจุด (Spot UV)',            'AFT-SPOTUV',   'หน้า', 5.00),
    ('เคลือบด้าน / เคลือบเงา (Lamination)',     'AFT-LAM',      'แผ่น', 4.00),
    ('ไดคัทขึ้นรูปตามแบบ (Die-cut)',            'AFT-DIECUT',   'ชิ้น', 3.50),
    ('พับ + ไสกาว / ติดกาว',                    'AFT-FOLDGLUE', 'ชิ้น', 2.50),
    ('เย็บเล่ม / เข้าเล่ม (Binding)',           'AFT-BIND',     'เล่ม', 15.00),
    ('เจาะรู + ติดตาไก่',                       'AFT-PUNCH',    'รู',   2.00),
    ('ปั๊มตัดขอบ / ตัดมุมโค้ง',                 'AFT-TRIM',     'ชิ้น', 2.00)
  ) as v(name, sku, unit, price)
  where not exists (
    select 1 from public.items i
    where i.user_id = v_user_id
      and lower(i.sku) = lower(v.sku)
  );

  -- Heal existing rows on re-run (name / price / unit / flag)
  update public.items i set
    name = v.name,
    unit_price = v.price,
    base_unit = v.unit,
    item_type = 'service',
    has_job_details = true,
    is_active = true,
    updated_at = now()
  from (values
    ('ปั๊มฟอยล์ทอง / เงิน (Hot Foil Stamping)', 'AFT-FOIL',     'จุด',  8.00),
    ('ปั๊มนูน (Emboss)',                        'AFT-EMBOSS',   'จุด',  6.00),
    ('ปั๊มจม (Deboss)',                         'AFT-DEBOSS',   'จุด',  6.00),
    ('เคลือบ UV เฉพาะจุด (Spot UV)',            'AFT-SPOTUV',   'หน้า', 5.00),
    ('เคลือบด้าน / เคลือบเงา (Lamination)',     'AFT-LAM',      'แผ่น', 4.00),
    ('ไดคัทขึ้นรูปตามแบบ (Die-cut)',            'AFT-DIECUT',   'ชิ้น', 3.50),
    ('พับ + ไสกาว / ติดกาว',                    'AFT-FOLDGLUE', 'ชิ้น', 2.50),
    ('เย็บเล่ม / เข้าเล่ม (Binding)',           'AFT-BIND',     'เล่ม', 15.00),
    ('เจาะรู + ติดตาไก่',                       'AFT-PUNCH',    'รู',   2.00),
    ('ปั๊มตัดขอบ / ตัดมุมโค้ง',                 'AFT-TRIM',     'ชิ้น', 2.00)
  ) as v(name, sku, unit, price)
  where i.user_id = v_user_id
    and lower(i.sku) = lower(v.sku);

  -- ----------------------------------------------------------
  -- 2. Job-detail fields (5 standard fields per item)
  -- ----------------------------------------------------------
  insert into public.item_job_detail_fields
    (user_id, item_id, field_key, label, field_type, sort_order,
     is_enabled, is_custom, default_unit)
  select v_user_id, i.id, f.field_key, f.label, f.field_type, f.sort_order,
         true, false, f.default_unit
  from public.items i
  cross join (values
    ('color',    'สี / ฟอยล์',              'text',      0, null),
    ('size',     'ขนาดใบพิมพ์ กว้าง x ยาว', 'dimension', 1, 'มม.'),
    ('position', 'ตำแหน่ง',                 'text',      2, null),
    ('material', 'วัสดุ',                   'text',      3, null),
    ('remark',   'หมายเหตุ',                'text',      4, null)
  ) as f(field_key, label, field_type, sort_order, default_unit)
  where i.user_id = v_user_id
    and i.sku in ('AFT-FOIL','AFT-EMBOSS','AFT-DEBOSS','AFT-SPOTUV','AFT-LAM',
                  'AFT-DIECUT','AFT-FOLDGLUE','AFT-BIND','AFT-PUNCH','AFT-TRIM')
    and not exists (
      select 1 from public.item_job_detail_fields x
      where x.item_id = i.id and x.field_key = f.field_key
    );

  -- ----------------------------------------------------------
  -- 3. Job-detail presets (text fields only — size has none)
  -- ----------------------------------------------------------
  insert into public.item_job_detail_presets
    (user_id, item_id, field_key, value, sort_order)
  select v_user_id, i.id, p.field_key, p.value, p.sort_order
  from public.items i
  cross join (values
    ('color',    'ฟอยล์ทองเงา',        0),
    ('color',    'ฟอยล์ทองด้าน',        1),
    ('color',    'ฟอยล์เงินเงา',        2),
    ('color',    'ฟอยล์เงินด้าน',        3),
    ('color',    'ฟอยล์โฮโลแกรม',       4),
    ('color',    'ฟอยล์แดง',            5),
    ('color',    'ฟอยล์น้ำเงิน',         6),
    ('color',    'UV เงา',              7),
    ('color',    'UV ด้าน',             8),
    ('position', 'กลางหน้า',            0),
    ('position', 'กลางปก',              1),
    ('position', 'มุมบนขวา',            2),
    ('position', 'มุมล่างซ้าย',          3),
    ('position', 'สันปก',               4),
    ('position', 'หลังปก',              5),
    ('position', 'ขอบบน',               6),
    ('position', 'ขอบล่าง',             7),
    ('material', 'อาร์ตการ์ด 260g',     0),
    ('material', 'อาร์ตการ์ด 300g',     1),
    ('material', 'กระดาษถนอมสายตา 80g', 2),
    ('material', 'กระดาษคราฟท์',        3),
    ('material', 'PP ขาว',              4),
    ('material', 'สติกเกอร์กันน้ำ',      5),
    ('material', 'หนังเทียม PU',        6),
    ('remark',   'งานเร่ง',             0),
    ('remark',   'ต้องทำบล็อกใหม่',      1),
    ('remark',   'ใช้บล็อกเดิมของลูกค้า', 2),
    ('remark',   'ปรู๊ฟก่อนผลิตจริง',    3),
    ('remark',   'ระวังสีตกขอบ',        4)
  ) as p(field_key, value, sort_order)
  where i.user_id = v_user_id
    and i.sku in ('AFT-FOIL','AFT-EMBOSS','AFT-DEBOSS','AFT-SPOTUV','AFT-LAM',
                  'AFT-DIECUT','AFT-FOLDGLUE','AFT-BIND','AFT-PUNCH','AFT-TRIM')
    and not exists (
      select 1 from public.item_job_detail_presets x
      where x.item_id = i.id
        and x.field_key = p.field_key
        and x.value = p.value
    );

  raise notice 'Seeded 10 after-print services for testcompany@gmail.com';
end $$;

-- Verify: 10 AFT- services, all with job details on
select sku, name, item_type, unit_price, base_unit, has_job_details, is_active
from public.items i
join auth.users u on u.id = i.user_id
where u.email = 'testcompany@gmail.com'
  and i.sku like 'AFT-%'
order by i.sku;

-- Verify: 5 fields x 10 items = 50 rows
select f.field_key, count(*) as rows_present
from public.item_job_detail_fields f
join public.items i on i.id = f.item_id
join auth.users u on u.id = i.user_id
where u.email = 'testcompany@gmail.com'
  and i.sku like 'AFT-%'
group by f.field_key
order by min(f.sort_order);

-- Verify: 29 presets x 10 items = 290 rows
select p.field_key, count(*) as rows_present
from public.item_job_detail_presets p
join public.items i on i.id = p.item_id
join auth.users u on u.id = i.user_id
where u.email = 'testcompany@gmail.com'
  and i.sku like 'AFT-%'
group by p.field_key
order by p.field_key;
