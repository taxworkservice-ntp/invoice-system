/**
 * Print-layout fill check — the filler rows that fill a page must never push
 * the sheet past A4.
 *
 * Classic V2 pads the items table to a minimum height and then, when the page
 * budget has room, fills it out with ruled blank rows so a short document
 * doesn't leave a dead band above the bottom row. Fillers are decoration, so
 * they never reach the paginator — but they *are* drawn, which means a
 * mis-estimated filler count silently grows the sheet past 297mm and clips the
 * signature band in print (the sheet has no internal scroll).
 *
 * This renders the fixture across page modes, document types and font scales
 * and asserts, per variant:
 *
 *   1. a filled sheet stays inside A4 — unless the content alone already
 *      overflows it (the fixture renders one unpaginated sheet, so a deliberately
 *      over-tall variant is skipped: measured by removing the filler rows);
 *   2. the filler count obeys the rule it claims: the minimum table height, or
 *      (when filling) at least two rows more than that.
 *
 *   npm run test:print-layout:fill
 *
 * Needs a Chromium: the locally installed Chrome/Edge is found
 * automatically; CHROME_EXECUTABLE_PATH overrides it. The bundled
 * `@sparticuz/chromium` binary is used on Linux only.
 */
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { launchPrintLayoutChromium } from "./print-layout-chromium.mjs";
import fs from "node:fs/promises";

const root = process.cwd();
const MM_PER_PX = 25.4 / 96;
const A4_HEIGHT_MM = 297;
// One filler row is deliberately left spare, so a filled page ends a row short
// of the bottom rather than exactly on it.
const TOLERANCE_MM = 0.6;
const MIN_TABLE_ROWS = 8;

const VARIANTS = [
  { name: "invoice single", template: "classic_v2", doc: "base", pageMode: "single" },
  { name: "invoice last", template: "classic_v2", doc: "base", pageMode: "last" },
  { name: "invoice small", template: "classic_v2", doc: "base", pageMode: "single", fontScale: "small" },
  { name: "invoice large", template: "classic_v2", doc: "base", pageMode: "single", fontScale: "large" },
  { name: "invoice xlarge", template: "classic_v2", doc: "base", pageMode: "single", fontScale: "xlarge" },
  { name: "many last", template: "classic_v2", doc: "many", pageMode: "last" },
  { name: "many continuation", template: "classic_v2", doc: "many", pageMode: "continuation" },
  { name: "delivery single", template: "classic_v2", doc: "delivery", pageMode: "single" },
  { name: "delivery compact", template: "classic_v2", doc: "delivery", pageMode: "single", compactDn: true },
  { name: "quotation single", template: "classic_v2", doc: "qt", pageMode: "single" },
  // The project heading is a reserved first-page row, so a multi-page first
  // page and a long (wrapping) name both have to stay inside A4.
  { name: "invoice project single", template: "classic_v2", doc: "project", pageMode: "single" },
  { name: "invoice project first", template: "classic_v2", doc: "project", pageMode: "first" },
  { name: "invoice project last", template: "classic_v2", doc: "project", pageMode: "last" },
  { name: "invoice project xlarge", template: "classic_v2", doc: "project", pageMode: "single", fontScale: "xlarge" },
  // The inner grid can be switched off (rows only / no inner lines) — the sheet
  // must still fit A4 and the page must still be filled the same way.
  { name: "invoice lines rows", template: "classic_v2", doc: "project", pageMode: "single", tableLines: "rows" },
  { name: "invoice lines none", template: "classic_v2", doc: "project", pageMode: "single", tableLines: "none" },
  { name: "dn lines none", template: "classic_v2", doc: "dn", pageMode: "last", tableLines: "none" },
  { name: "dn (invoice from DNs) last", template: "classic_v2", doc: "dn", pageMode: "last" },
  // A last page with few rows but a tall fixed stack (DN groups + terms +
  // payment + the signature band): the filler rows must not spend a budget
  // the page does not have, or the exported PDF clips the band.
  { name: "dn short rows last", template: "classic_v2", doc: "dn-short", pageMode: "last" },
  // The band text in the description column wraps into more lines — the
  // filled sheet still has to stay inside A4.
  { name: "dn last column rules", template: "classic_v2", doc: "dn", pageMode: "last", columnRules: true },
  { name: "dn short rows last column rules", template: "classic_v2", doc: "dn-short", pageMode: "last", columnRules: true },
];

/** Measures one fixture variant: sheet height, filler rows, their row height. */
async function measureVariant(page, baseUrl, variant) {
  const url = new URL("/scripts/print-layout-fixture.html", baseUrl);
  url.searchParams.set("template", variant.template);
  if (variant.doc) url.searchParams.set("doc", variant.doc);
  if (variant.pageMode) url.searchParams.set("pageMode", variant.pageMode);
  if (variant.fontScale) url.searchParams.set("fontScale", variant.fontScale);
  if (variant.compactDn) url.searchParams.set("compactDn", "1");
  if (variant.tableLines) url.searchParams.set("tableLines", variant.tableLines);
  if (variant.columnRules) url.searchParams.set("columnRules", "1");

  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".print-sheet", { timeout: 15000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });

  return page.evaluate((mm) => {
    const sheet = document.querySelector(".print-sheet");
    if (!sheet) return null;
    const rows = Array.from(document.querySelectorAll(".print-classic-items-wrap tbody tr"));
    const fillers = rows.filter((row) => row.classList.contains("print-classic-blank-row"));
    const noteRows = document.querySelectorAll(".print-classic-note-row").length;
    return {
      sheetMm: sheet.offsetHeight * mm,
      // Content rows = everything that isn't filler or the document-note row.
      contentRows: rows.length - fillers.length - noteRows,
      fillerCount: fillers.length,
      fillerRowMm: fillers[0] ? fillers[0].offsetHeight * mm : 0,
    };
  }, MM_PER_PX);
}

let server;
let browser;
let failures = 0;

try {
  server = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === "object" && address ? address.port : 5173;
  const baseUrl = `http://127.0.0.1:${port}`;

  // The bundled Lambda binary (and its --single-process args) only work on
  // Linux; everywhere else the locally installed Chrome/Edge is used.
  browser = await launchPrintLayoutChromium();
  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 1,
  });
  await page.emulateMedia({ media: "screen" });

  for (const variant of VARIANTS) {
    const m = await measureVariant(page, baseUrl, variant);
    if (!m) {
      console.log(`FAIL  ${variant.name} — no sheet rendered`);
      failures += 1;
      continue;
    }
    // The sheet the variant would print without the filler rows. When that
    // alone exceeds A4 the fixture is simply too tall for one sheet (it renders
    // unpaginated), which is not this check's concern.
    const withoutFillersMm = m.sheetMm - m.fillerCount * m.fillerRowMm;
    const contentOverflows = withoutFillersMm > A4_HEIGHT_MM + TOLERANCE_MM;
    const sheetOverflows = m.sheetMm > A4_HEIGHT_MM + TOLERANCE_MM;

    const minFillers = Math.max(0, MIN_TABLE_ROWS - m.contentRows);
    // Either the minimum table height (never more than the budget allows), or
    // a fill worth at least two rows.
    const ruleHolds =
      m.fillerCount <= minFillers || m.fillerCount >= minFillers + 2;

    const problems = [];
    if (sheetOverflows && !contentOverflows) {
      problems.push(
        `filled sheet is ${m.sheetMm.toFixed(1)}mm (> A4 ${A4_HEIGHT_MM}mm) while the same sheet without its ${m.fillerCount} filler rows is ${withoutFillersMm.toFixed(1)}mm`,
      );
    }
    if (!ruleHolds) {
      problems.push(
        `filler rows ${m.fillerCount} break the rule (minimum ${minFillers}, or ≥ ${minFillers + 2})`,
      );
    }

    const status = problems.length > 0 ? "FAIL" : contentOverflows ? "skip" : "ok  ";
    if (problems.length > 0) failures += 1;
    console.log(
      `${status}  ${variant.name.padEnd(28)} sheet ${m.sheetMm.toFixed(1)}mm · fillers ${m.fillerCount} (min ${minFillers}) · content-only ${withoutFillersMm.toFixed(1)}mm`,
    );
    for (const problem of problems) console.log(`      ↳ ${problem}`);
  }
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (server) await server.close().catch(() => undefined);
}

if (failures > 0) {
  console.error(`\nPrint fill check failed — ${failures} variant(s) above.`);
  process.exit(1);
}
console.log("\nPrint fill check passed — every filled sheet stays inside A4.");
