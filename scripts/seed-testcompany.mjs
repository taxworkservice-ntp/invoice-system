// ============================================================
// SEED: Full mock data for testcompany@gmail.com / test1234
// Creates auth user + profile + client_profile + customers + items + deals + documents
//
// Usage:
//   node scripts/seed-testcompany.mjs
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_ variants) in env.
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
const PASSWORD = "test1234";

// ---------------------------------------------------------------------------
// Mockup SVGs
// ---------------------------------------------------------------------------
const svgLogo = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="120" viewBox="0 0 440 120">',
  "<defs><linearGradient id='lg' x1='0%' y1='0%' x2='100%' y2='100%'>",
  "<stop offset='0%' style='stop-color:#15803d'/>",
  "<stop offset='100%' style='stop-color:#22c55e'/>",
  "</linearGradient></defs>",
  "<rect width='440' height='120' rx='12' fill='url(#lg)'/>",
  "<rect x='20' y='20' width='80' height='80' rx='16' fill='white' opacity='0.2'/>",
  "<text x='60' y='72' font-family='Arial,sans-serif' font-size='42' font-weight='700' fill='white' text-anchor='middle'>TC</text>",
  "<text x='120' y='56' font-family='Arial,sans-serif' font-size='30' font-weight='700' fill='white'>TEST COMPANY</text>",
  "<text x='120' y='82' font-family='Arial,sans-serif' font-size='15' fill='rgba(255,255,255,0.8)'>บริษัท เทสท์ คอมพานี จำกัด</text>",
  "</svg>",
].join("");
const logoUrl = `data:image/svg+xml,${Buffer.from(svgLogo).toString("base64")}`;

const svgSignature = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120">',
  "<path d='M30,60 C40,40 60,30 80,50 C100,70 90,80 110,60 C130,40 140,55 160,50 C180,45 190,60 210,50 ",
  "C230,40 250,35 270,50 C290,65 300,60 320,55 C340,50 360,48 370,55' ",
  "stroke='#374151' stroke-width='3' fill='none' stroke-linecap='round'/>",
  "<line x1='20' y1='95' x2='380' y2='95' stroke='#9ca3af' stroke-width='1' stroke-dasharray='4,2'/>",
  "<text x='380' y='80' font-family='Arial,sans-serif' font-size='14' fill='#6b7280' text-anchor='end'>Authorised Signatory</text>",
  "</svg>",
].join("");
const signatureUrl = `data:image/svg+xml,${Buffer.from(svgSignature).toString("base64")}`;

const svgStamp = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">',
  "<circle cx='90' cy='90' r='80' fill='none' stroke='#7c3aed' stroke-width='4'/>",
  "<circle cx='90' cy='90' r='74' fill='none' stroke='#7c3aed' stroke-width='1.5'/>",
  "<text x='90' y='46' font-family='Arial,sans-serif' font-size='12' font-weight='700' fill='#7c3aed' text-anchor='middle'>บริษัท เทสท์ คอมพานี จำกัด</text>",
  "<circle cx='90' cy='90' r='28' fill='none' stroke='#7c3aed' stroke-width='1.5'/>",
  "<text x='90' y='84' font-family='Arial,sans-serif' font-size='11' font-weight='700' fill='#7c3aed' text-anchor='middle'>TEST COMPANY</text>",
  "<text x='90' y='100' font-family='Arial,sans-serif' font-size='9' fill='#7c3aed' text-anchor='middle'>TAX ID: 0105566000999</text>",
  "<text x='90' y='148' font-family='Arial,sans-serif' font-size='9' fill='#7c3aed' text-anchor='middle'>BANGKOK, THAILAND</text>",
  "</svg>",
].join("");
const stampUrl = `data:image/svg+xml,${Buffer.from(svgStamp).toString("base64")}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
  { name: "Bangkok Retail Group Co., Ltd.",         tax_id: "0105566001001", address: "100 Sukhumvit 55, Khlong Tan Nuea, Watthana, Bangkok 10110",         contact: "Somchai Sanguan",   phone: "02-123-0001", email: "orders@bangkokretail.co.th",  note: "Preferred customer, net 30" },
  { name: "Siam Food Services Ltd.",                tax_id: "0105566002002", address: "22 Ratchadaphisek 17, Din Daeng, Bangkok 10400",                      contact: "Pranee Wongwai",    phone: "02-123-0002", email: "pranee@siamfoods.co.th",     note: "Monthly standing order" },
  { name: "North Star Logistics Co., Ltd.",         tax_id: "0105566003003", address: "88 Vibhavadi Rangsit 60, Don Mueang, Bangkok 10210",                  contact: "Kittiphum Rodsri",  phone: "02-123-0003", email: "logistics@northstar.co.th",  note: "Warehouse supplies" },
  { name: "Pacific Tech Solutions Ltd.",            tax_id: "0105566004004", address: "333 Silicon Alley, Phra Khanong Nuea, Watthana, Bangkok 10260",       contact: "Natthanan Tech",    phone: "02-123-0004", email: "procurement@pacifictech.co.th", note: "IT equipment vendor" },
  { name: "Green Leaf Construction Ltd.",           tax_id: "0105566005005", address: "777 Ratchaprarop Rd, Makkasan, Ratchathewi, Bangkok 10400",           contact: "Amnat Khamkhruea",  phone: "02-123-0005", email: "projects@greenleaf.co.th",   note: "Net 60 payment terms" },
  { name: "Fortune Auto Parts Ltd.",                tax_id: "0105566006006", address: "45 Rama II Rd, Bang Khun Thian, Bangkok 10150",                       contact: "Somsak Thongchai",  phone: "02-123-0006", email: "parts@fortuneauto.co.th",    note: "Auto parts distributor" },
  { name: "Blue Ocean Trading Co., Ltd.",           tax_id: "0105566007007", address: "12 Charoen Krung 30, Bang Rak, Bangkok 10500",                        contact: "Rungthiwa Saelim",  phone: "02-123-0007", email: "rungthiwa@blueocean.co.th",  note: "Import/export trader" },
  { name: "Royal Garden Hotel Group Ltd.",          tax_id: "0105566008008", address: "56 Wireless Rd, Lumphini, Pathum Wan, Bangkok 10330",                 contact: "Anchalee Phanom",   phone: "02-123-0008", email: "hki@royalgardenhotel.com",   note: "Hospitality client" },
  { name: "Modern Health Plus Co., Ltd.",           tax_id: "0105566009009", address: "9 Ratchadamri Rd, Lumphini, Pathum Wan, Bangkok 10330",               contact: "Thiti Mahawan",     phone: "02-123-0009", email: "supply@modernhealth.co.th",  note: "Medical equipment" },
  { name: "Sunrise Packaging Ltd.",                 tax_id: "0105566010010", address: "201 Bang Na-Trat 28, Bang Na, Bangkok 10260",                          contact: "Wichai Samut",      phone: "02-123-0010", email: "sales@sunrisepkg.co.th",     note: "Regular packaging orders" },
];

const items = [
  { name: "Premium Cardboard Box 40x30x20cm",  sku: "BOX-PRM-4030", type: "product", price: 45.00,  unit: "piece", carton: "pallet", qtyPerCarton: 50,  stock: 300, cost: 28.00,  threshold: 20,  fav: true  },
  { name: "Bubble Wrap Roll 50cm x 100m",       sku: "BUBBLE-50",   type: "product", price: 380.00, unit: "roll",  carton: "carton", qtyPerCarton: 4,   stock: 18,  cost: 220.00, threshold: 2,   fav: false },
  { name: "Packing Tape 48mm x 100y (Clear)",   sku: "TAPE-CLR-48", type: "product", price: 22.00,  unit: "roll",  carton: "carton", qtyPerCarton: 36,  stock: 144, cost: 13.50,  threshold: 10,  fav: true  },
  { name: "Stretch Film 500mm x 300m",          sku: "STRCH-500",   type: "product", price: 155.00, unit: "roll",  carton: "carton", qtyPerCarton: 4,   stock: 32,  cost: 95.00,  threshold: 5,   fav: false },
  { name: "Corrugated Pallets 120x100cm",       sku: "PAL-CRG-1210",type: "product", price: 95.00,  unit: "piece", carton: "bundle", qtyPerCarton: 10,  stock: 50,  cost: 62.00,  threshold: 10,  fav: false },
  { name: "Edge Protectors L-shaped 5x5x100cm", sku: "EDGE-L-0505", type: "product", price: 18.00,  unit: "piece", carton: "bundle", qtyPerCarton: 25,  stock: 500, cost: 9.00,   threshold: 50,  fav: false },
  { name: "Custom Packaging Design Service",     sku: "DSGN-PKG-V2", type: "service", price: 4500.00,unit: "project" },
  { name: "Warehouse Storage (per pallet/month)", sku: "WH-STORAGE", type: "service", price: 120.00, unit: "pallet" },
  { name: "Delivery & Installation Service",     sku: "DELV-INST-V2",type: "service", price: 1500.00,unit: "trip" },
  { name: "Printing & Labeling (per 100 labels)",sku: "PRINT-LBL",  type: "service", price: 650.00, unit: "set" },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function seed() {
  // 1. Get or create auth user
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const found = (existing?.users || []).find((u) => u.email === EMAIL);
  let userId;

  if (found) {
    userId = found.id;
    log("User already exists", `${EMAIL} (${userId})`);
  } else {
    log("Creating auth user", EMAIL);
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { company_name: "Test Company Co., Ltd." },
    });
    if (authErr) err("auth.admin.createUser", authErr);
    userId = authData.user.id;
    log("Auth user created", userId);
  }

  // 2. Upsert profile
  const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
    id: userId,
    role: "client",
  });
  if (profileErr) err("profiles.upsert", profileErr);
  log("Profile upserted");

  // 3. Upsert client_profile
  const { error: cpErr } = await supabaseAdmin.from("client_profiles").upsert({
    user_id: userId,
    company_name_th: "บริษัท เทสท์ คอมพานี จำกัด",
    company_name_en: "Test Company Co., Ltd.",
    tax_id: "0105566000999",
    address: "999 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310",
    phone: "02-999-8888",
    contact_name: "คุณเทสท์ ตัวอย่าง",
    logo_url: logoUrl,
    logo_size: "rectangle",
    vat_registered: true,
    vat_rate: 7.00,
    default_wht_rate: "3",
    credit_term_days: 30,
    stock_deduct_trigger: "invoice",
    pdf_template: "modern",
    classic_terms: "Payment is due within 30 days from the document date.\nPayment: transfer to the bank account listed below.\nGoods remain property of the company until paid in full.",
    bank_name: "Kasikorn Bank",
    bank_account: "999-8-76543-2",
    signature_url: signatureUrl,
    stamp_url: stampUrl,
    dev_mode_enabled: true,
    password_changed: true,
  }, { onConflict: "user_id" });
  if (cpErr) err("client_profiles.upsert", cpErr);
  log("Client profile upserted");

  // 4. Seed customers (delete existing first for clean re-runs)
  const { error: delCustErr } = await supabaseAdmin.from("customers").delete().eq("user_id", userId);
  if (delCustErr) err("customers.delete", delCustErr);

  const custRows = customers.map((c) => ({
    id: randomUUID(),
    user_id: userId,
    name: c.name,
    tax_id: c.tax_id,
    address: c.address,
    contact_name: c.contact,
    phone: c.phone,
    email: c.email,
    note: c.note,
    is_active: true,
  }));
  const { error: insCustErr } = await supabaseAdmin.from("customers").insert(custRows);
  if (insCustErr) err("customers.insert", insCustErr);
  log(`Customers inserted`, custRows.length);

  // 5. Seed items
  const { error: delItemErr } = await supabaseAdmin.from("items").delete().eq("user_id", userId);
  if (delItemErr) err("items.delete", delItemErr);

  const itemRows = items.map((i) => {
    const now = new Date().toISOString();
    const base = {
      id: randomUUID(),
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
    if (i.type === "product") {
      return {
        ...base,
        carton_unit: i.carton || null,
        qty_per_carton: i.qtyPerCarton || null,
        stock_count: i.stock ?? 0,
        avg_cost: i.cost ?? 0,
        stock_value: (i.stock ?? 0) * (i.cost ?? 0),
        low_stock_threshold: i.threshold ?? 0,
      };
    }
    return base;
  });
  const { error: insItemErr } = await supabaseAdmin.from("items").insert(itemRows);
  if (insItemErr) err("items.insert", insItemErr);
  log(`Items inserted`, itemRows.length);

  // 6. Fetch first 2 customers for deals
  const { data: custList } = await supabaseAdmin.from("customers").select("id, name").eq("user_id", userId).limit(2);
  if (!custList || custList.length < 2) err("fetch customers", { message: "Not enough customers" });

  const [cust1, cust2] = custList;

  // 7. Seed deals
  const { error: delDealErr } = await supabaseAdmin.from("deals").delete().eq("user_id", userId);
  if (delDealErr) err("deals.delete", delDealErr);

  const deal1 = { id: randomUUID(), user_id: userId, customer_id: cust1.id, title: "Packaging supplies Q3", is_active: true };
  const deal2 = { id: randomUUID(), user_id: userId, customer_id: cust2.id, title: "Logistics packaging order", is_active: true };
  const { error: insDealErr } = await supabaseAdmin.from("deals").insert([deal1, deal2]);
  if (insDealErr) err("deals.insert", insDealErr);
  log("Deals inserted", 2);

  // 8. Seed documents
  const { error: delDocErr } = await supabaseAdmin.from("documents").delete().eq("user_id", userId);
  if (delDocErr) err("documents.delete", delDocErr);

  const doc1 = {
    id: randomUUID(), user_id: userId, deal_id: deal1.id, customer_id: cust1.id,
    doc_type: "invoice", doc_number: "INV-2026-07-001", status: "sent",
    issue_date: "2026-07-01", due_date: "2026-07-31",
    vat_registered: true, vat_rate: 7, wht_rate: 3, discount_percent: 5, discount_amount: 600,
    subtotal: 11400, vat_amount: 798, total_amount: 12198, wht_amount: 342, net_payable: 11856,
    note: "Please quote invoice number with payment. Deliveries Mon-Fri 9am-5pm.",
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
  };
  const doc2 = {
    id: randomUUID(), user_id: userId, deal_id: deal2.id, customer_id: cust2.id,
    doc_type: "quotation", doc_number: "QT-2026-07-001", status: "draft",
    issue_date: "2026-07-03", due_date: "2026-08-02",
    vat_registered: true, vat_rate: 7, wht_rate: 3, discount_percent: 0, discount_amount: 0,
    subtotal: 6450, vat_amount: 451.50, total_amount: 6901.50, wht_amount: 193.50, net_payable: 6708,
    note: "Valid for 30 days. Contact us for bulk discounts.",
    created_at: "2026-07-03T00:00:00Z", updated_at: "2026-07-03T00:00:00Z",
  };
  const { error: insDocErr } = await supabaseAdmin.from("documents").insert([doc1, doc2]);
  if (insDocErr) err("documents.insert", insDocErr);
  log("Documents inserted", 2);

  // 9. Seed line items
  const { error: delLiErr } = await supabaseAdmin.from("document_line_items").delete().eq("user_id", userId);
  if (delLiErr) err("document_line_items.delete", delLiErr);

  const lineItems = [
    { document_id: doc1.id, user_id: userId, item_id: null, item_name: "Premium Cardboard Box 40x30x20cm", item_sku: "BOX-PRM-4030", item_type: "product", unit: "piece", unit_price: 45.00, quantity: 100, base_quantity: 100, discount_percent: 0, discount_amount: 0, line_total: 4500, sort_order: 1 },
    { document_id: doc1.id, user_id: userId, item_id: null, item_name: "Packing Tape 48mm x 100y (Clear)", item_sku: "TAPE-CLR-48", item_type: "product", unit: "roll", unit_price: 22.00, quantity: 50, base_quantity: 50, discount_percent: 0, discount_amount: 0, line_total: 1100, sort_order: 2 },
    { document_id: doc1.id, user_id: userId, item_id: null, item_name: "Stretch Film 500mm x 300m", item_sku: "STRCH-500", item_type: "product", unit: "roll", unit_price: 155.00, quantity: 8, base_quantity: 8, discount_percent: 0, discount_amount: 0, line_total: 1240, sort_order: 3 },
    { document_id: doc1.id, user_id: userId, item_id: null, item_name: "Bubble Wrap Roll 50cm x 100m", item_sku: "BUBBLE-50", item_type: "product", unit: "roll", unit_price: 380.00, quantity: 10, base_quantity: 10, discount_percent: 0, discount_amount: 0, line_total: 3800, sort_order: 4 },
    { document_id: doc1.id, user_id: userId, item_id: null, item_name: "Delivery & Installation Service", item_sku: "DELV-INST-V2", item_type: "service", unit: "trip", unit_price: 1500.00, quantity: 2, base_quantity: 2, discount_percent: 20, discount_amount: 600, line_total: 2400, sort_order: 5 },
    { document_id: doc2.id, user_id: userId, item_id: null, item_name: "Premium Cardboard Box 40x30x20cm", item_sku: "BOX-PRM-4030", item_type: "product", unit: "piece", unit_price: 45.00, quantity: 50, base_quantity: 50, discount_percent: 0, discount_amount: 0, line_total: 2250, sort_order: 1 },
    { document_id: doc2.id, user_id: userId, item_id: null, item_name: "Corrugated Pallets 120x100cm", item_sku: "PAL-CRG-1210", item_type: "product", unit: "piece", unit_price: 95.00, quantity: 20, base_quantity: 20, discount_percent: 0, discount_amount: 0, line_total: 1900, sort_order: 2 },
    { document_id: doc2.id, user_id: userId, item_id: null, item_name: "Warehouse Storage (per pallet/month)", item_sku: "WH-STORAGE", item_type: "service", unit: "pallet", unit_price: 120.00, quantity: 15, base_quantity: 15, discount_percent: 0, discount_amount: 0, line_total: 1800, sort_order: 3 },
    { document_id: doc2.id, user_id: userId, item_id: null, item_name: "Edge Protectors L-shaped 5x5x100cm", item_sku: "EDGE-L-0505", item_type: "product", unit: "piece", unit_price: 18.00, quantity: 25, base_quantity: 25, discount_percent: 0, discount_amount: 0, line_total: 450, sort_order: 4 },
  ];

  const liRows = lineItems.map((li) => ({ id: randomUUID(), ...li }));
  const { error: insLiErr } = await supabaseAdmin.from("document_line_items").insert(liRows);
  if (insLiErr) err("document_line_items.insert", insLiErr);
  log("Line items inserted", liRows.length);

  // 10. Summary
  console.log("\n=============================================");
  console.log("  Seed complete for testcompany@gmail.com");
  console.log("=============================================");
  const { count: cc } = await supabaseAdmin.from("customers").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const { count: ic } = await supabaseAdmin.from("items").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const { count: dc } = await supabaseAdmin.from("deals").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const { count: oc } = await supabaseAdmin.from("documents").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const { count: lc } = await supabaseAdmin.from("document_line_items").select("*", { count: "exact", head: true }).eq("user_id", userId);
  console.log(`  Customers:       ${cc}`);
  console.log(`  Items:           ${ic}`);
  console.log(`  Deals:           ${dc}`);
  console.log(`  Documents:       ${oc}`);
  console.log(`  Line items:      ${lc}`);
  console.log("");
  console.log(`  Login: testcompany@gmail.com / test1234`);
}

seed().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
