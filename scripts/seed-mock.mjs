// ============================================================
// Self-service mock data generator (interactive wizard + flags)
//
//   npm run seed:mock                          interactive
//   npm run seed:mock -- --deals 20 --chain dn-inv --items 3-8 \
//     --customer same --status draft --yes     flag mode
//   npm run seed:mock:clean                    remove [MOCK] data only
//
// Chains: dn | dn-inv | inv-bn | dn-inv-bn | random
// Statuses: draft (active pipeline) | issued (done) | random
// All generated data is tagged [MOCK] — safe to clean anytime.
// ============================================================

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { makeAdmin, loadWorkspace, generateMockData, cleanMockData } from "./lib/mockGenerator.mjs";

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else { flags[key] = next; i++; }
  }
  return flags;
}

const CHAIN_MENU = [
  { key: "dn", label: "ใบส่งของเท่านั้น (DN)" },
  { key: "dn-inv", label: "DN → ใบแจ้งหนี้/ใบกำกับภาษี" },
  { key: "inv-bn", label: "ใบแจ้งหนี้ → ใบวางบิล" },
  { key: "dn-inv-bn", label: "DN → ใบแจ้งหนี้ → ใบวางบิล (ครบทั้งสาย)" },
  { key: "random", label: "สุ่มผสมทุกแบบ" },
];
const STATUS_MENU = [
  { key: "draft", label: "ร่าง (โชว์ในหมวดกำลังดำเนินการ)" },
  { key: "issued", label: "ออกแล้ว (โชว์ในหมวดเสร็จแล้ว)" },
  { key: "random", label: "สุ่มผสม" },
];

async function wizard() {
  const rl = readline.createInterface({ input, output });
  const ask = async (q, def) => {
    const a = (await rl.question(`${q}${def ? ` [${def}]` : ""}: `)).trim();
    return a || def;
  };
  console.log("── Mock data generator (classic V2, test workspace) ──\n");
  const deals = parseInt(await ask("จำนวนดีลที่ต้องการสร้าง", "10"), 10);
  console.log("\nประเภทเอกสารในแต่ละดีล:");
  CHAIN_MENU.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
  const chainIdx = parseInt(await ask("เลือก (1-5)", "1"), 10);
  const itemsRange = (await ask("จำนวนรายการต่อเอกสาร (ต่ำ-สูง)", "3-8")).split("-").map((n) => parseInt(n, 10));
  console.log("\nลูกค้า: 1) ลูกค้าเดียวกันทุกดีล 2) สุ่มทุกดีล");
  const custPick = await ask("เลือก (1-2)", "1");
  console.log("\nสถานะ: 1) ร่าง 2) ออกแล้ว 3) สุ่มผสม");
  const statusPick = await ask("เลือก (1-3)", "1");
  const confirm = (await rl.question(`\nสร้าง ${isNaN(deals) ? 10 : deals} ดีล ตกลง? (Y/n): `)).trim().toLowerCase();
  rl.close();
  if (confirm === "n") { console.log("ยกเลิก"); process.exit(0); }
  return {
    deals: isNaN(deals) ? 10 : deals,
    chain: CHAIN_MENU[chainIdx - 1]?.key || "dn",
    itemsMin: itemsRange[0] || 3,
    itemsMax: itemsRange[1] || itemsRange[0] || 8,
    customerMode: custPick === "2" ? "random" : "same",
    statusMode: { 1: "draft", 2: "issued", 3: "random" }[parseInt(statusPick, 10)] || "draft",
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const options = {
    deals: parseInt(flags.deals, 10) || 10,
    chain: flags.chain || "dn",
    itemsMin: (flags.items || "3-8").split("-")[0] | 0 || 3,
    itemsMax: ((flags.items || "3-8").split("-")[1] | 0) || (flags.items || "3-8").split("-")[0] | 0 || 8,
    customerMode: flags.customer || "same",
    customerIndex: parseInt(flags.customerIndex, 10) || 1,
    statusMode: flags.status || "draft",
  };

  const sb = makeAdmin();
  const workspace = await loadWorkspace(sb);

  if (flags.clean) {
    const res = await cleanMockData(sb, workspace.userId);
    console.log(`cleaned: ${res.deals} deals, ${res.documents} documents (+ their line items/links)`);
    return;
  }

  if (!flags.yes) Object.assign(options, await wizard());

  console.log(
    `\nกำลังสร้าง ${options.deals} ดีล · chain: ${options.chain} · items: ${options.itemsMin}-${options.itemsMax} · customer: ${options.customerMode} · status: ${options.statusMode}\n`,
  );
  const res = await generateMockData(sb, workspace, options);
  console.log("✓ สร้างเสร็จ:");
  console.log("  ดีล:", res.deals, "| เอกสาร:", res.documents, "| รายการ:", res.lineItems);
  for (const [t, nums] of Object.entries(res.numbers)) {
    if (nums.length) console.log(`  ${t}: ${nums[0]} → ${nums[nums.length - 1]} (${nums.length})`);
  }
  console.log("\nลบข้อมูล mock ทั้งหมดภายหลัง: npm run seed:mock:clean");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
