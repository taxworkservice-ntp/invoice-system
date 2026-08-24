// ============================================================
// SEED (focused): 10 customers + 10 catalog items only
// For testcompany@gmail.com (บริษัท เทสท์ คอมพานี จำกัด)
//
// Unlike scripts/seed-testcompany.mjs this does NOT touch
// deals / documents / line items.
//
// Usage:
//   node scripts/seed-testcompany-catalog.mjs
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_ variants).
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "testcompany@gmail.com";

let step = 0;
function log(label, ...args) {
  console.log(`[${++step}] ${label}`, ...args);
}

function err(label, error) {
  console.error(`FAIL: ${label} — ${error.message}`);
  if (error.details) console.error("  details:", error.details);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const customers = [
  { name: "บริษัท กรุงเทพรีเทล กรุ๊ป จำกัด",      tax_id: "0105566001001", address: "100 ถนนสุขุมวิท 55 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110",   contact: "สมชาย สรรพ์กุล",    phone: "02-123-0001", email: "orders@bangkokretail.co.th", note: "ลูกค้าประจำ เครดิต 30 วัน" },
  { name: "บริษัท สยามฟู้ดเซอร์วิส จำกัด",         tax_id: "0105566002002", address: "22 ถนนรัชดาภิเษก 17 แขวงดินแดง เขตดินแดง กรุงเทพมหานคร 10400",       contact: "ปราณี วงศ์วัย",     phone: "02-123-0002", email: "pranee@siamfoods.co.th",    note: "สั่งซื้อประจำทุกเดือน" },
  { name: "บริษัท นอร์ทสตาร์โลจิสติกส์ จำกัด",     tax_id: "0105566003003", address: "88 ถนนวิภาวดีรังสิต 60 เขตดอนเมือง กรุงเทพมหานคร 10210",              contact: "กิตติพุ่ม รอดศรี",   phone: "02-123-0003", email: "logistics@northstar.co.th", note: "อุปกรณ์คลังสินค้า" },
  { name: "บริษัท แปซิฟิกเทคโซลูชัน จำกัด",        tax_id: "0105566004004", address: "333 อาคารซิลิคอนอัลลีย์ แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพมหานคร 10260", contact: "ณัฐนันท์ เทคโนฯ",  phone: "02-123-0004", email: "procurement@pacifictech.co.th", note: "ผู้ขายอุปกรณ์ไอที" },
  { name: "บริษัท กรีนลีฟก่อสร้าง จำกัด",           tax_id: "0105566005005", address: "777 ถนนราชปรารภ แขวงมัคสะเรียช เขตราชเทวี กรุงเทพมหานคร 10400",     contact: "อำนาจ ขำเครือ",     phone: "02-123-0005", email: "projects@greenleaf.co.th",  note: "เครดิต 60 วัน" },
  { name: "บริษัท ฟอร์จูนออโต้พาร์ท จำกัด",         tax_id: "0105566006006", address: "45 ถนนพระราม 2 แขวงบางคูเวียง เขตบางขุนเทียน กรุงเทพมหานคร 10150",  contact: "สมศักดิ์ ทองใหญ่",   phone: "02-123-0006", email: "parts@fortuneauto.co.th",   note: "ผู้จัดจำหน่ายอะไหล่รถยนต์" },
  { name: "บริษัท บลูโอเชียนเทรดดิ้ง จำกัด",        tax_id: "0105566007007", address: "12 ถนนเจริญกรุง 30 แขวงบางรัก เขตบางรัก กรุงเทพมหานคร 10500",        contact: "รุ่งทิวา แซ่ลิ้ม",    phone: "02-123-0007", email: "rungthiwa@blueocean.co.th", note: "ธุรกิจนำเข้า-ส่งออก" },
  { name: "บริษัท รอยัลการ์เดนโฮเทลกรุ๊ป จำกัด",    tax_id: "0105566008008", address: "56 ถนนไวเลสร์ แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร 10330",            contact: "อัญชลี พนมดี",      phone: "02-123-0008", email: "hki@royalgardenhotel.com",  note: "ลูกค้ากลุ่มโรงแรม" },
  { name: "บริษัท โมเดิร์นเฮลท์พลัส จำกัด",          tax_id: "0105566009009", address: "9 ถนนราชดำริ แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร 10330",             contact: "ธิติ มหาวรรณ",      phone: "02-123-0009", email: "supply@modernhealth.co.th", note: "อุปกรณ์การแพทย์" },
  { name: "บริษัท ซันไรส์แพ็กเกจจิง จำกัด",         tax_id: "0105566010010", address: "201 ถนนบางนา-ตราด 28 แขวงบางนา เขตบางนา กรุงเทพมหานคร 10260",       contact: "วิชัย สมุทร",        phone: "02-123-0010", email: "sales@sunrisepkg.co.th",    note: "สั่งซื้อบรรจุภัณฑ์ประจำ" },
];

const items = [
  { name: "กล่องลูกฟูกพรีเมียม 40x30x20 ซม.",     sku: "BOX-PRM-4030", type: "product", price: 45.00,   unit: "ชิ้น",   carton: "พาเลท",   qtyPerCarton: 50, stock: 300, cost: 28.00, threshold: 20, fav: true },
  { name: "ฟิล์มกันกระแทก (บับเบิล) 50 ซม. x 100 ม.", sku: "BUBBLE-50", type: "product", price: 380.00, unit: "ม้วน",   carton: "ลัง",     qtyPerCarton: 4,  stock: 18,  cost: 220.00, threshold: 2, fav: false },
  { name: "เทปกาวใส 48 มม. x 100 หลา",            sku: "TAPE-CLR-48",  type: "product", price: 22.00,   unit: "ม้วน",   carton: "ลัง",     qtyPerCarton: 36, stock: 144, cost: 13.50, threshold: 10, fav: true },
  { name: "ฟิล์มพลาสติกยืด 500 มม. x 300 ม.",      sku: "STRCH-500",    type: "product", price: 155.00,  unit: "ม้วน",   carton: "ลัง",     qtyPerCarton: 4,  stock: 32,  cost: 95.00, threshold: 5,  fav: false },
  { name: "พาเลทลูกฟูก 120x100 ซม.",               sku: "PAL-CRG-1210", type: "product", price: 95.00,   unit: "ชิ้น",   carton: "มัด",     qtyPerCarton: 10, stock: 50,  cost: 62.00, threshold: 10, fav: false },
  { name: "แผ่นครอบมุมทรงแอล 5x5x100 ซม.",         sku: "EDGE-L-0505",  type: "product", price: 18.00,   unit: "ชิ้น",   carton: "มัด",     qtyPerCarton: 25, stock: 500, cost: 9.00,  threshold: 50, fav: false },
  { name: "บริการออกแบบบรรจุภัณฑ์ตามสั่ง",          sku: "DSGN-PKG-V2",  type: "service", price: 4500.00, unit: "โครงการ" },
  { name: "บริการเก็บสินค้าในคลัง (รายพาเลท/เดือน)", sku: "WH-STORAGE",   type: "service", price: 120.00,  unit: "พาเลท" },
  { name: "บริการส่งและติดตั้ง",                     sku: "DELV-INST-V2", type: "service", price: 1500.00, unit: "เที่ยว" },
  { name: "บริการพิมพ์ฉลาก (ต่อ 100 ฉลาก)",          sku: "PRINT-LBL",    type: "service", price: 650.00,  unit: "ชุด" },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function seed() {
  // 1. Find the account (must already exist — created by seed-testcompany.mjs or signup)
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  const found = (list?.users || []).find((u) => u.email === EMAIL);
  if (!found) {
    console.error(`User not found: ${EMAIL}. Run scripts/seed-testcompany.mjs first.`);
    process.exit(1);
  }
  const userId = found.id;
  log("User found", `${EMAIL} (${userId})`);

  // 2. Sync customers: update matching by tax_id, insert missing,
  //    delete leftovers that are not referenced by any deal/document.
  const { data: existingCusts } = await supabaseAdmin
    .from("customers")
    .select("id, name, tax_id")
    .eq("user_id", userId);
  const custByTaxId = new Map((existingCusts || []).filter((c) => c.tax_id).map((c) => [c.tax_id, c]));
  const custByName = new Map((existingCusts || []).map((c) => [c.name.toLowerCase(), c]));

  let updated = 0;
  let inserted = 0;
  for (const c of customers) {
    const row = {
      user_id: userId,
      name: c.name,
      tax_id: c.tax_id,
      address: c.address,
      contact_name: c.contact,
      phone: c.phone,
      email: c.email,
      note: c.note,
      is_active: true,
    };
    const match = custByTaxId.get(c.tax_id) || custByName.get(c.name.toLowerCase());
    if (match) {
      const { error } = await supabaseAdmin.from("customers").update(row).eq("id", match.id);
      if (error) err(`customers.update (${c.name})`, error);
      updated++;
    } else {
      const { error } = await supabaseAdmin.from("customers").insert({ id: randomUUID(), ...row });
      if (error) err(`customers.insert (${c.name})`, error);
      inserted++;
    }
  }

  const keepIds = new Set(customers.map((c) => (custByTaxId.get(c.tax_id) || custByName.get(c.name.toLowerCase()) || {}).id).filter(Boolean));
  const staleCustIds = (existingCusts || []).map((c) => c.id).filter((id) => !keepIds.has(id));
  let removedCustomers = 0;
  if (staleCustIds.length) {
    const [{ data: dealRefs }, { data: docRefs }] = await Promise.all([
      supabaseAdmin.from("deals").select("customer_id").eq("user_id", userId),
      supabaseAdmin.from("documents").select("customer_id").eq("user_id", userId),
    ]);
    const referenced = new Set([
      ...(dealRefs || []).map((r) => r.customer_id),
      ...(docRefs || []).map((r) => r.customer_id),
    ].filter(Boolean));
    const deletable = staleCustIds.filter((id) => !referenced.has(id));
    if (deletable.length) {
      const { error } = await supabaseAdmin.from("customers").delete().in("id", deletable);
      if (error) err("customers.delete (unreferenced)", error);
      removedCustomers = deletable.length;
    }
  }
  log("Customers synced", `${inserted} inserted, ${updated} updated, ${removedCustomers} stale removed`);

  // 3. Sync catalog items: update matching by sku, insert missing,
  //    delete unreferenced leftovers.
  const { data: existingItems } = await supabaseAdmin
    .from("items")
    .select("id, sku")
    .eq("user_id", userId);
  const itemBySku = new Map((existingItems || []).map((i) => [i.sku, i]));

  let itemsUpdated = 0;
  let itemsInserted = 0;
  for (const i of items) {
    const base = {
      user_id: userId,
      name: i.name,
      sku: i.sku,
      item_type: i.type,
      unit_price: i.price,
      base_unit: i.unit,
      is_active: true,
      is_favorite: i.fav ?? false,
      has_job_details: false,
      stock_count: 0,
      avg_cost: 0,
      stock_value: 0,
      low_stock_threshold: 0,
    };
    let row = base;
    if (i.type === "product") {
      row = {
        ...base,
        carton_unit: i.carton || null,
        qty_per_carton: i.qtyPerCarton || null,
        stock_count: i.stock ?? 0,
        avg_cost: i.cost ?? 0,
        stock_value: (i.stock ?? 0) * (i.cost ?? 0),
        low_stock_threshold: i.threshold ?? 0,
      };
    }
    const match = itemBySku.get(i.sku);
    if (match) {
      const { error } = await supabaseAdmin.from("items").update(row).eq("id", match.id);
      if (error) err(`items.update (${i.sku})`, error);
      itemsUpdated++;
    } else {
      const { error } = await supabaseAdmin.from("items").insert({ id: randomUUID(), ...row });
      if (error) err(`items.insert (${i.sku})`, error);
      itemsInserted++;
    }
  }

  const keepItemIds = new Set(items.map((i) => itemBySku.get(i.sku)?.id).filter(Boolean));
  const staleItemIds = (existingItems || []).map((i) => i.id).filter((id) => !keepItemIds.has(id));
  let removedItems = 0;
  if (staleItemIds.length) {
    const { data: liRefs } = await supabaseAdmin
      .from("document_line_items")
      .select("item_id")
      .eq("user_id", userId);
    const referencedItems = new Set((liRefs || []).map((r) => r.item_id).filter(Boolean));
    const deletableItems = staleItemIds.filter((id) => !referencedItems.has(id));
    if (deletableItems.length) {
      const { error } = await supabaseAdmin.from("items").delete().in("id", deletableItems);
      if (error) err("items.delete (unreferenced)", error);
      removedItems = deletableItems.length;
    }
  }
  log("Catalog items synced", `${itemsInserted} inserted, ${itemsUpdated} updated, ${removedItems} stale removed`);

  // 4. Summary
  const { count: cc } = await supabaseAdmin.from("customers").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const { count: ic } = await supabaseAdmin.from("items").select("*", { count: "exact", head: true }).eq("user_id", userId);
  console.log("\n=============================================");
  console.log("  Seed complete for บริษัท เทสท์ คอมพานี จำกัด");
  console.log("=============================================");
  console.log(`  Customers:     ${cc}`);
  console.log(`  Catalog items: ${ic}`);
  console.log(`  Login: ${EMAIL} / test1234`);
}

seed().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
