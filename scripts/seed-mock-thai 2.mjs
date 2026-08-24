// ============================================================
// SEED: Mock Thai-business data for testcompany@gmail.com
//   1. 20 customers
//   2. 20 service catalog items (item_type='service') with
//      job-detail capture ("เก็บรายละเอียดงานของบริการนี้") + a sample detail
//
// Usage:  node scripts/seed-mock-thai.mjs
// Credentials are read from supabase_key.md (same as the test harness).
// ============================================================

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadCreds() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { url, key };
  const raw = fs
    .readFileSync(new URL("../supabase_key.md", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { url: raw.find((l) => l.startsWith("http")), key: raw.find((l) => l.startsWith("eyJ")) };
}

const { url, key } = loadCreds();
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const EMAIL = "testcompany@gmail.com";

const CUSTOMER_NAMES = [
  "บริษัท ศรีเจริญพัฒนา จำกัด",
  "บริษัท ไทยรวมธุรกิจ จำกัด",
  "ห้างหุ้นส่วนส่วนจำกัด วิไลพรการพิมพ์",
  "บริษัท เมืองไทยรับเหมาก่อสร้าง จำกัด",
  "บริษัท อุดมผลิตภัณฑ์ จำกัด",
  "บริษัท สยามเทคโนโลยี จำกัด",
  "บริษัท ภัทรพัฒนา จำกัด",
  "บริษัท รักไทยโลจิสติกส์ จำกัด",
  "บริษัท เอเชียอาหาร จำกัด",
  "บริษัท ประจักษ์กราฟิก จำกัด",
  "บริษัท เดอะดีไซน์สตูดิโอ จำกัด",
  "บริษัท นครหลวงอิเล็กทรอนิกส์ จำกัด",
  "บริษัท ไทยสมุนไพร จำกัด",
  "บริษัท พร้อมพัฒนาอสังหา จำกัด",
  "บริษัท กรุงเทพบริการ จำกัด",
  "นาย สมชาย ใจดี",
  "นางสาว วิมล พรมมา",
  "บริษัท แสงทองพาณิชย์ จำกัด",
  "บริษัท ราชพฤกษ์รับเหมา จำกัด",
  "บริษัท อินทราเคเบิล จำกัด",
];

const CONTACTS = [
  "คุณสมศักดิ์", "คุณวิภา", "คุณน้อย", "คุณชาญ", "คุณอรัญญา",
  "คุณเอก", "คุณพัชรา", "คุณสมบูรณ์", "คุณมาลี", "คุณประจักษ์",
  "คุณดารา", "คุณนที", "คุณสุนันทา", "คุณธีรพล", "คุณกาญจนา",
  "คุณสมชาย", "คุณวิมล", "คุณบุญญา", "คุณรัชชานนท์", "คุณเจริญ",
];

const ADDRESSES = [
  "เลขที่ 12 ถนนรัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพฯ 10400",
  "เลขที่ 45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110",
  "เลขที่ 8 ถนนเพชรบุรี แขวงมักกะเย็น เขตราชเทวี กรุงเทพฯ 10400",
  "เลขที่ 99 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400",
  "เลขที่ 23 ถนนพระราม 4 แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110",
  "เลขที่ 56 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900",
  "เลขที่ 7 ถนนเจริญกรุง แขวงบางรัก เขตบางรัก กรุงเทพฯ 10500",
  "เลขที่ 134 ถนนสุทธิสาร แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310",
  "เลขที่ 300 ถนนเอกชัย แขวงบางคอแหลม เขตจอมทอง กรุงเทพฯ 10150",
  "เลขที่ 15 ถนนนเรศ แขวงบางยี่ขัน เขตบางพลัด กรุงเทพฯ 10700",
  "เลขที่ 42 ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพฯ 10120",
  "เลขที่ 88 ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310",
  "เลขที่ 5 ถนนราชวงศ์ แขวงสัมพันธวงศ์ เขตป้อมปราบศัตรูพ่าย กรุงเทพฯ 10100",
  "เลขที่ 77 ถนนเพชรเกษม แขวงหนองค้างพลู เขตภาษีเจริญ กรุงเทพฯ 10160",
  "เลขที่ 210 ถนนวิทยุ แขวงลุมพินี เขตปทุมวัน กรุงเทพฯ 10330",
  "เลขที่ 31 ถนนนวมินทร์ แขวงคลองจุกเขตบางกะปิ กรุงเทพฯ 10240",
  "เลขที่ 64 ถนนรามคำแหง แขวงวังทองหลาง เขตวังทองหลาง กรุงเทพฯ 10310",
  "เลขที่ 19 ถนนเยาวราช แขวงจักรวรรดิ์ เขตป้อมปราบศัตรูพ่าย กรุงเทพฯ 10100",
  "เลขที่ 150 ถนนประชาอุทิศ แขวงแขวงท่าทอง เขตธนบุรี กรุงเทพฯ 10600",
  "เลขที่ 8 ถนนงามวงศ์วาน แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900",
];

const SERVICES = [
  { n: "ออกแบบเว็บไซต์", u: "โครงการ", p: 25000, d: "ขนาดเว็บ 5 หน้า ภาษาไทย-อังกฤษ ต้องการแบบ Responsive" },
  { n: "พัฒนาซอฟต์แวร์", u: "โครงการ", p: 80000, d: "ระบบจัดการภายในแบบ Custom ใช้งานผ่านเว็บ" },
  { n: "ถ่ายภาพสินค้า", u: "ครั้ง", p: 3500, d: "ถ่ายสินค้า 20 ชิ้น พื้นหลังขาว ความละเอียดสูง" },
  { n: "ผลิตวิดีโอโปรโมท", u: "คลิป", p: 12000, d: "วิดีโอความยาว 60 วินาที ใส่กราฟิกและเสียงพากย์" },
  { n: "รับทำ SEO", u: "เดือน", p: 9000, d: "ติดอันดับค้นหาเป้าหมาย 10 คีย์เวิร์ด" },
  { n: "ดูแลโซเชียลมีเดีย", u: "เดือน", p: 15000, d: "ลงโพสต์ 3 ครั้ง/สัปดาห์ สร้างคอนเทนต์และตอบคอมเมนต์" },
  { n: "ออกแบบโลโก้", u: "แบบ", p: 5000, d: "โลโก้ 3 ร่าง แก้ไขได้ 2 รอบ" },
  { n: "รับทำบัญชี", u: "เดือน", p: 6000, d: "บันทึกบัญชีรายเดือน จัดทำงบทดลอง" },
  { n: "ตรวจสอบระบบบัญชี", u: "ครั้ง", p: 18000, d: "ตรวจสอบงบการเงินประจำปี" },
  { n: "รับสร้างบ้าน", u: "โครงการ", p: 1500000, d: "บ้านสองชั้น พื้นที่ใช้สอย 200 ตร.ม." },
  { n: "ต่อเติมอาคาร", u: "โครงการ", p: 450000, d: "ต่อเติมชั้นลอย 1 ห้องนอน" },
  { n: "ติดตั้งระบบไฟฟ้า", u: "จุด", p: 800, d: "เดินสายไฟ新增จุดปลั๊ก 10 จุด" },
  { n: "ซ่อมแอร์", u: "เครื่อง", p: 1500, d: "ล้างแอร์และเติมสารทำความเย็น" },
  { n: "ทำความสะอาดสำนักงาน", u: "เดือน", p: 9000, d: "ทำความสะอาดสำนักงาน 200 ตร.ม. สัปดาห์ละ 2 ครั้ง" },
  { n: "จัดส่งพัสดุ", u: "เที่ยว", p: 500, d: "จัดส่งในเขตกรุงเทพฯ ถึงจังหวัดใกล้เคียง" },
  { n: "ฝึกอบรมพนักงาน", u: "คอร์ส", p: 20000, d: "อบรมระบบบริการลูกค้า 1 วัน" },
  { n: "รับแปลเอกสาร", u: "หน้า", p: 300, d: "แปลไทย-อังกฤษ เอกสารสัญญา" },
  { n: "ให้คำปรึกษาทางกฎหมาย", u: "ชั่วโมง", p: 2500, d: "ปรึกษากฎหมายธุรกิจและภาษี" },
  { n: "วางแผนธุรกิจ", u: "ชั่วโมง", p: 3500, d: "ที่ปรึกษาวางแผนกลยุทธ์ระยะ 1 ปี" },
  { n: "บำรุงรักษาระบบ", u: "เดือน", p: 7000, d: "ดูแลระบบคอมพิวเตอร์และเน็ตเวิร์กประจำเดือน" },
];

function slug(s) {
  return s
    .replace(/บริษัท|จำกัด|ห้างหุ้นส่วนส่วนจำกัด|นาย|นางสาว|คุณ/g, "")
    .replace(/\s+/g, "")
    .slice(0, 8);
}

async function main() {
  const { data: users } = await admin.auth.admin.listUsers();
  const user = users.users.find((u) => u.email === EMAIL);
  if (!user) throw new Error(`User ${EMAIL} not found`);
  const UID = user.id;
  console.log("Seeding for user:", UID);

  const { count: custCount } = await admin
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("user_id", UID);
  const { count: svcCount } = await admin
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", UID)
    .eq("item_type", "service");

  if (custCount >= 20 && svcCount >= 20) {
    console.log(`Already seeded (customers=${custCount}, services=${svcCount}). Skipping.`);
    return;
  }

  if (custCount < 20) {
    const customers = CUSTOMER_NAMES.map((name, i) => ({
      id: crypto.randomUUID(),
      user_id: UID,
      name,
      tax_id: ("010556600000" + (i + 1)).slice(-13),
      address: ADDRESSES[i],
      contact_name: CONTACTS[i],
      phone: `08${(i % 9) + 1}${String(1000000 + i * 137).slice(0, 6)}`,
      email: `${slug(name) || "cust"}${i + 1}@example.co.th`,
      is_active: true,
    }));
    const { error } = await admin.from("customers").insert(customers);
    if (error) throw error;
    console.log(`Inserted ${customers.length} customers`);
  } else {
    console.log("Customers already present, skipping.");
  }

  if (svcCount < 20) {
    const items = SERVICES.map((s, i) => ({
      id: crypto.randomUUID(),
      user_id: UID,
      name: s.n,
      sku: `SVC-${String(i + 1).padStart(3, "0")}`,
      item_type: "service",
      unit_price: s.p,
      has_job_details: true,
      base_unit: s.u,
      is_active: true,
    }));
    const { data: inserted, error } = await admin.from("items").insert(items).select();
    if (error) throw error;
    console.log(`Inserted ${inserted.length} service items`);

    const fields = inserted.map((it, i) => ({
      id: crypto.randomUUID(),
      user_id: UID,
      item_id: it.id,
      field_key: "detail",
      label: "เก็บรายละเอียดงานของบริการนี้",
      field_type: "text",
      sort_order: 0,
      is_enabled: true,
    }));
    const { error: fErr } = await admin.from("item_job_detail_fields").insert(fields);
    if (fErr) throw fErr;
    console.log(`Inserted ${fields.length} job-detail fields`);

    const presets = inserted.map((it, i) => ({
      id: crypto.randomUUID(),
      user_id: UID,
      item_id: it.id,
      field_key: "detail",
      value: SERVICES[i].d,
      sort_order: 0,
    }));
    const { error: pErr } = await admin.from("item_job_detail_presets").insert(presets);
    if (pErr) throw pErr;
    console.log(`Inserted ${presets.length} job-detail presets`);
  } else {
    console.log("Service items already present, skipping.");
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
