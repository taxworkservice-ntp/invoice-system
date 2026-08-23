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
  { name: "Bangkok Retail Group Co., Ltd.",         tax_id: "0105566001001", address: "100 Sukhumvit 55, Khlong Tan Nuea, Watthana, Bangkok 10110",   contact: "Somchai Sanguan",  phone: "02-123-0001", email: "orders@bangkokretail.co.th", note: "Preferred customer, net 30" },
  { name: "Siam Food Services Ltd.",                tax_id: "0105566002002", address: "22 Ratchadaphisek 17, Din Daeng, Bangkok 10400",               contact: "Pranee Wongwai",   phone: "02-123-0002", email: "pranee@siamfoods.co.th",    note: "Monthly standing order" },
  { name: "North Star Logistics Co., Ltd.",         tax_id: "0105566003003", address: "88 Vibhavadi Rangsit 60, Don Mueang, Bangkok 10210",           contact: "Kittiphum Rodsri", phone: "02-123-0003", email: "logistics@northstar.co.th", note: "Warehouse supplies" },
  { name: "Pacific Tech Solutions Ltd.",            tax_id: "0105566004004", address: "333 Silicon Alley, Phra Khanong Nuea, Watthana, Bangkok 10260",contact: "Natthanan Tech",   phone: "02-123-0004", email: "procurement@pacifictech.co.th", note: "IT equipment vendor" },
  { name: "Green Leaf Construction Ltd.",           tax_id: "0105566005005", address: "777 Ratchaprarop Rd, Makkasan, Ratchathewi, Bangkok 10400",    contact: "Amnat Khamkhruea", phone: "02-123-0005", email: "projects@greenleaf.co.th",  note: "Net 60 payment terms" },
  { name: "Fortune Auto Parts Ltd.",                tax_id: "0105566006006", address: "45 Rama II Rd, Bang Khun Thian, Bangkok 10150",                contact: "Somsak Thongchai", phone: "02-123-0006", email: "parts@fortuneauto.co.th",   note: "Auto parts distributor" },
  { name: "Blue Ocean Trading Co., Ltd.",           tax_id: "0105566007007", address: "12 Charoen Krung 30, Bang Rak, Bangkok 10500",                 contact: "Rungthiwa Saelim", phone: "02-123-0007", email: "rungthiwa@blueocean.co.th", note: "Import/export trader" },
  { name: "Royal Garden Hotel Group Ltd.",          tax_id: "0105566008008", address: "56 Wireless Rd, Lumphini, Pathum Wan, Bangkok 10330",          contact: "Anchalee Phanom",  phone: "02-123-0008", email: "hki@royalgardenhotel.com",  note: "Hospitality client" },
  { name: "Modern Health Plus Co., Ltd.",           tax_id: "0105566009009", address: "9 Ratchadamri Rd, Lumphini, Pathum Wan, Bangkok 10330",        contact: "Thiti Mahawan",    phone: "02-123-0009", email: "supply@modernhealth.co.th", note: "Medical equipment" },
  { name: "Sunrise Packaging Ltd.",                 tax_id: "0105566010010", address: "201 Bang Na-Trat 28, Bang Na, Bangkok 10260",                   contact: "Wichai Samut",     phone: "02-123-0010", email: "sales@sunrisepkg.co.th",    note: "Regular packaging orders" },
];

const items = [
  { name: "Premium Cardboard Box 40x30x20cm",   sku: "BOX-PRM-4030", type: "product", price: 45.00,   unit: "piece",  carton: "pallet",  qtyPerCarton: 50, stock: 300, cost: 28.00, threshold: 20, fav: true },
  { name: "Bubble Wrap Roll 50cm x 100m",       sku: "BUBBLE-50",    type: "product", price: 380.00,  unit: "roll",   carton: "carton",  qtyPerCarton: 4,  stock: 18,  cost: 220.00, threshold: 2, fav: false },
  { name: "Packing Tape 48mm x 100y (Clear)",   sku: "TAPE-CLR-48",  type: "product", price: 22.00,   unit: "roll",   carton: "carton",  qtyPerCarton: 36, stock: 144, cost: 13.50, threshold: 10, fav: true },
  { name: "Stretch Film 500mm x 300m",          sku: "STRCH-500",    type: "product", price: 155.00,  unit: "roll",   carton: "carton",  qtyPerCarton: 4,  stock: 32,  cost: 95.00, threshold: 5,  fav: false },
  { name: "Corrugated Pallets 120x100cm",       sku: "PAL-CRG-1210", type: "product", price: 95.00,   unit: "piece",  carton: "bundle",  qtyPerCarton: 10, stock: 50,  cost: 62.00, threshold: 10, fav: false },
  { name: "Edge Protectors L-shaped 5x5x100cm", sku: "EDGE-L-0505",  type: "product", price: 18.00,   unit: "piece",  carton: "bundle",  qtyPerCarton: 25, stock: 500, cost: 9.00,  threshold: 50, fav: false },
  { name: "Custom Packaging Design Service",    sku: "DSGN-PKG-V2",  type: "service", price: 4500.00, unit: "project" },
  { name: "Warehouse Storage (per pallet/month)", sku: "WH-STORAGE", type: "service", price: 120.00,  unit: "pallet" },
  { name: "Delivery & Installation Service",    sku: "DELV-INST-V2", type: "service", price: 1500.00, unit: "trip" },
  { name: "Printing & Labeling (per 100 labels)", sku: "PRINT-LBL",  type: "service", price: 650.00,  unit: "set" },
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
