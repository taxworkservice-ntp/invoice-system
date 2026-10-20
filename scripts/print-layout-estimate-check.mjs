/**
 * Print-layout conformance check — does the paginator's height model still
 * describe what the browser actually lays out?
 *
 * The sheet is drawn by CSS while page breaks are decided by a parallel mm
 * model (`src/lib/printRowHeight.ts` + `src/lib/pagination.ts`). The two are
 * kept in sync by hand, and when they drift the visible symptoms are subtle:
 * a section band that wraps taller than budgeted, a row that quietly grows —
 * each of which can move a page break or leave a page looking cut off.
 *
 * This renders the print fixture and compares MEASURED heights against the
 * model, per row kind:
 *   - DN group band  ↔ band charge from `estimateLineItemHeight`
 *   - item rows      ↔ per-row `estimateLineItemHeight`
 *   - the document note row is excluded: it is appended by the last page and
 *     is not part of the line model
 *
 *   npm run test:print-layout:estimate
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
// Tolerance per row kind (mm). The model carries its own slack (ROW_SAFETY_MM)
// and rounds conservatively, so it runs slightly ahead of the render.
const TOLERANCE_MM = { band: 1.6, item: 2.2 };

const VARIANTS = [
  { name: "delivery", template: "classic_v2", doc: "delivery" },
  { name: "delivery-compact", template: "classic_v2", doc: "delivery", compactDn: true },
  { name: "delivery-xlarge", template: "classic_v2", doc: "delivery", fontScale: "xlarge" },
  { name: "many", template: "classic_v2", doc: "many" },
  // The DN document is the one with the band rows — the model's band charge
  // is compared with the render here, with the merged band and with the band
  // text in the description column.
  { name: "dn bands", template: "classic_v2", doc: "dn-short" },
  { name: "dn bands column rules", template: "classic_v2", doc: "dn-short", columnRules: true },
  // With the inner grid off the rows lose their 0.5px bottom border, so the
  // model (which charges for it) must stay an upper bound.
  { name: "project-no-lines", template: "classic_v2", doc: "project", tableLines: "none" },
];

/** Measures the fixture sheet and the model's predictions for the same rows. */
async function measureVariant(page, baseUrl, variant) {
  const url = new URL("/scripts/print-layout-fixture.html", baseUrl);
  url.searchParams.set("template", variant.template);
  if (variant.copyType) url.searchParams.set("copyType", variant.copyType);
  if (variant.doc) url.searchParams.set("doc", variant.doc);
  if (variant.fontScale) url.searchParams.set("fontScale", variant.fontScale);
  if (variant.compactDn) url.searchParams.set("compactDn", "1");
  if (variant.tableLines) url.searchParams.set("tableLines", variant.tableLines);
  if (variant.columnRules) url.searchParams.set("columnRules", "1");

  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".print-sheet", { timeout: 15000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  return page.evaluate(async () => {
    const MM = 3.7795275591;
    const fixture = window.__printFixture;
    if (!fixture) return { skipped: "fixture data not exposed" };

    const { estimateLineItemHeight } = await import("/src/lib/printRowHeight.ts");
    const {
      buildDnBlocks,
      buildDnSectionPlan,
      buildDnSoHeaderPlan,
      dnHeaderLabel,
      filterDnRefMarkers,
      filterDnRenderLines,
      getDnSoHeaderText,
      planDnRows,
    } = await import("/src/lib/dnGroups.ts");
    const { resolveYearEra } = await import("/src/lib/yearEra.ts");
    const { getClassicV2FontScaleMult, DOCUMENT_FONT_SCALE_DEFAULT } =
      await import("/src/constants/index.ts");

    const { document: doc, clientProfile, lineItems } = fixture;
    const itemsScale =
      doc.print_font_scale && doc.print_font_scale !== DOCUMENT_FONT_SCALE_DEFAULT
        ? getClassicV2FontScaleMult(doc.print_font_scale)
        : getClassicV2FontScaleMult(clientProfile.pdf_font_scale ?? clientProfile.classic_v2_font_scale);
    const isDn = doc.doc_type === "delivery_note";
    // The column rules running through the band put the band's text in the
    // description column — the model has to charge that width.
    const columnRules = clientProfile.classic_v2_column_rules_continuous === true;
    const printEra = resolveYearEra(clientProfile);
    const compactDn = clientProfile.classic_v2_compact_dn === true;
    const rowOpts = (item) => ({
      fontScale: itemsScale,
      hideDeliveryAmounts: false,
      hasLineDiscount: (item.discount_amount ?? 0) > 0 || (item.discount_percent ?? 0) > 0,
      dnNotes: isDn,
      compactDn,
      hasDnGroupBand: false,
      hasInlineDnRef: false,
      hasLineImage: false,
      hasInvoiceRef: false,
    });

    // Rendered rows, classified the same way the component renders them.
    const table = document.querySelector(".print-classic-items-table");
    const rows = table ? Array.from(table.querySelectorAll("tbody tr")) : [];
    const measured = { band: [], item: [] };
    for (const row of rows) {
      const h = row.getBoundingClientRect().height / MM;
      if (row.classList.contains("print-classic-dn-group-row")) measured.band.push(h);
      else if (row.classList.contains("print-classic-blank-row")) continue;
      else if (row.classList.contains("print-classic-note-row")) continue;
      else measured.item.push(h);
    }

    // Model side: the same units the component draws, in the same order. The
    // planner depends on the doc type / SO-header opt-in, exactly as
    // PrintDocumentClassicV2 chooses it.
    const soGroupHeader = getDnSoHeaderText(doc.doc_type, doc.dn_so_header);
    const planInput = filterDnRefMarkers(lineItems);
    const plans = soGroupHeader
      ? buildDnSoHeaderPlan(planInput, soGroupHeader)
      : doc.doc_type === "delivery_note"
        ? buildDnSectionPlan(planInput, fixture.lineDeliveryNoteMap)
        : planDnRows(buildDnBlocks(planInput, fixture.lineDeliveryNoteMap));
    const predictedBands = [];
    const predictedItems = [];
    for (const plan of plans) {
      if (plan.header) {
        const withBand = estimateLineItemHeight(plan.item, "classic_v2", {
          ...rowOpts(plan.item),
          hasDnGroupBand: true,
          dnGroupSoHeader: plan.header.soHeader,
          dnGroupHasRefLine: !!plan.header.number,
          dnGroupNarrow: columnRules,
          dnGroupRefText: columnRules ? dnHeaderLabel(plan.header, printEra) : null,
        });
        const without = estimateLineItemHeight(plan.item, "classic_v2", rowOpts(plan.item));
        predictedBands.push(withBand - without);
      }
      predictedItems.push(estimateLineItemHeight(plan.item, "classic_v2", rowOpts(plan.item)));
    }

    const sum = (xs) => xs.reduce((a, b) => a + b, 0);
    return {
      template: fixture.template,
      docType: doc.doc_type,
      measured: {
        bands: measured.band.map((h) => +h.toFixed(2)),
        items: measured.item.map((h) => +h.toFixed(2)),
      },
      predicted: {
        bands: predictedBands.map((h) => +h.toFixed(2)),
        items: predictedItems.map((h) => +h.toFixed(2)),
      },
      totals: {
        measuredItems: +sum(measured.item).toFixed(2),
        predictedItems: +sum(predictedItems).toFixed(2),
        measuredBands: +sum(measured.band).toFixed(2),
        predictedBands: +sum(predictedBands).toFixed(2),
      },
    };
  });
}

function compare(label, measuredMm, predictedMm, tolerance) {
  const delta = measuredMm - predictedMm;
  const ok = Math.abs(delta) <= tolerance;
  const sign = delta >= 0 ? "+" : "";
  return {
    ok,
    line: `${label}: measured ${measuredMm.toFixed(2)}mm vs model ${predictedMm.toFixed(2)}mm (${sign}${delta.toFixed(2)}mm, tolerance ±${tolerance}mm)`,
  };
}

let server;
let browser;
let failed = false;

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
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.emulateMedia({ media: "screen" });

  for (const variant of VARIANTS) {
    const report = await measureVariant(page, baseUrl, variant);
    if (report.skipped) {
      console.log(`${variant.name}: skipped — ${report.skipped}`);
      continue;
    }
    const checks = [];
    if (report.measured.items.length) {
      checks.push(
        compare(
          `${variant.name} · item rows (${report.measured.items.length})`,
          report.totals.measuredItems,
          report.totals.predictedItems,
          TOLERANCE_MM.item * report.measured.items.length,
        ),
      );
    }
    if (report.measured.bands.length) {
      checks.push(
        compare(
          `${variant.name} · section bands (${report.measured.bands.length})`,
          report.totals.measuredBands,
          report.totals.predictedBands,
          TOLERANCE_MM.band * report.measured.bands.length,
        ),
      );
    }
    for (const check of checks) {
      console.log(`${check.ok ? "ok  " : "FAIL"} ${check.line}`);
      if (!check.ok) failed = true;
    }
    if (!checks.length) console.log(`${variant.name}: no item rows to check`);
  }
} catch (error) {
  console.error(`\nPrint estimate check failed to run:\n${error?.message || error}`);
  failed = true;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}

if (failed) {
  console.error(
    "\nThe CSS and the pagination model disagree — fix the model (or the CSS) so a page break cannot move without being noticed.\n",
  );
  process.exit(1);
}
console.log("\nPrint estimate check passed — the height model matches the rendered sheet.");
