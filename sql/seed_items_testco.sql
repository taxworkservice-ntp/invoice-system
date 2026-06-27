-- ============================================================
-- SEED: 20 mock items for testco@gmail.com (auto-resolve user_id)
-- Run this directly in Supabase SQL editor
-- ============================================================

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where email = 'testco@gmail.com';

  if v_user_id is null then
    raise exception 'No auth user found with email testco@gmail.com';
  end if;

  insert into items (user_id, name, sku, item_type, unit_price, base_unit, carton_unit, qty_per_carton, stock_count, avg_cost, stock_value, low_stock_threshold, is_favorite, is_active)
  values
    (v_user_id, 'กล่องแดง 20x15cm ขอบพับ',            'BOX-RED-2015',  'product', 12.50, 'ชิ้น', 'ลัง', 100, 450, 8.20, 3690.00, 20,  true,  true),
    (v_user_id, 'แผ่นพลาสติกใส PP 0.3mm A4',          'PP-SHEET-A4',   'product', 3.75,  'แผ่น', null, null, 2000, 2.10, 4200.00, 100, false, true),
    (v_user_id, 'ฉลากสติกเกอร์กันน้ำ 30x50mm',          'STICK-WP-3050', 'product', 0.85,  'ดวง',  'ม้วน', 500, 12500, 0.45, 5625.00, 500, true,  true),
    (v_user_id, 'ถุงซิปล็อคใส 10x15cm',                  'BAG-ZIP-1015',  'product', 1.20,  'ใบ',   'แพ็ค', 200, 8600, 0.60, 5160.00, 100, false, true),
    (v_user_id, 'เทปใส OPP กว้าง 48mm หลา 100y',        'TAPE-OPP-48',   'product', 18.00, 'ม้วน', 'ลัง', 24, 72, 11.50, 828.00, 10,   false, true),
    (v_user_id, 'เชือกฟางไนล่อน เส้นผ่านศูนย์กลาง 3mm',   'ROPE-NYL-3',    'product', 2.50,  'เมตร', 'ม้วน', 200, 3800, 1.20, 4560.00, 100, false, true),
    (v_user_id, 'กล่องไปรษณีย์ ขาว 30x20x10cm',           'BOX-POST-3020', 'product', 8.00,  'ใบ',   'แพ็ค', 25, 375, 5.00, 1875.00, 20,   true,  true),
    (v_user_id, 'โฟมกันกระแทก PE แผ่นใหญ่ 100x200cm',     'FOAM-PE-L',     'product', 35.00, 'แผ่น', null, null, 88, 22.00, 1936.00, 10,   false, true),
    (v_user_id, 'คลิปดึง/สายคล้องพลาสติก (แพ็ค 100ชิ้น)',  'CLIP-PL-100',   'product', 45.00, 'แพ็ค', 'ลัง', 10, 55, 28.00, 1540.00, 5,    false, true),
    (v_user_id, 'แผ่นรองพาเลท 100x120cm',                 'PALLET-SHEET',  'product', 85.00, 'แผ่น', null, null, 120, 55.00, 6600.00, 15,   false, true),
    (v_user_id, 'สติกเกอร์บาร์โค้ด 1 ม้วน 1000ดวง',       'BC-STICK-1K',   'product', 120.00,'ม้วน', null, null, 30, 72.00, 2160.00, 5,    false, true),
    (v_user_id, 'กล่องดีบุก 20x15x5cm (สำหรับสินค้าพรีเมี่ยม)', 'BOX-TIN-2015', 'product', 45.00, 'ใบ', 'ลัง', 50, 250, 28.00, 7000.00, 3, true, true),
    (v_user_id, 'ซองจดหมายครุฑ น้ำตาล A4',                'ENV-CR-A4',     'product', 2.00,  'ซอง', 'แพ็ค', 100, 1800, 0.95, 1710.00, 50,  false, true),
    (v_user_id, 'กระดาษลังลูกฟูก 3 ชั้น แผ่นใหญ่',         'CART-CRFT-3P',  'product', 22.00, 'แผ่น', null, null, 340, 13.00, 4420.00, 50,  false, true),
    (v_user_id, 'แม็กซ์เย็บกระดาษ No.10',                  'STAPLE-10',     'product', 15.00, 'กล่อง',null, null, 200, 8.50, 1700.00, 10,  false, true),
    (v_user_id, 'พิมพ์ออฟเซ็ท 1 สี (ขั้นต่ำ 1,000 ชิ้น)',   null,            'service', 2500.00,'งาน',  null, null, 0, 0, 0, 0,      false, true),
    (v_user_id, 'ออกแบบผลิตภัณฑ์/แพ็คเกจจิ้ง',              'DSGN-PKG',      'service', 3500.00,'งาน',  null, null, 0, 0, 0, 0,      true,  true),
    (v_user_id, 'ตัด/ไดคัท สั่งทำพิเศษ',                    'DIECUT-CUSTOM', 'service', 1500.00,'แม่พิมพ์',null,null,0, 0, 0, 0,      false, true),
    (v_user_id, 'พ่นสีสเปรย์ ตามแบบ (ต่อชิ้น)',             'SPRAY-CUSTOM',  'service', 3.00,   'ชิ้น', null, null, 0, 0, 0, 0,      false, true),
    (v_user_id, 'จัดส่งพร้อมติดตั้งหน้างาน',                'DELV-INSTALL',  'service', 800.00, 'เที่ยว',null, null, 0, 0, 0, 0,      true,  true)
  on conflict do nothing;

  raise notice 'Inserted 20 items for testco@gmail.com';
end $$;

-- Verify
select i.item_type, count(*) as item_count
from items i
join auth.users u on u.id = i.user_id
where u.email = 'testco@gmail.com'
group by i.item_type;

select name, sku, item_type, unit_price, base_unit, stock_count, is_favorite
from items i
join auth.users u on u.id = i.user_id
where u.email = 'testco@gmail.com'
order by item_type, name;
