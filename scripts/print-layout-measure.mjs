import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";
import { createServer } from "vite";

/**
 * Measures actual rendered Classic V2 heights (mm) and prints them next to the
 * estimator's constants, so src/lib/printRowHeight.ts stays an upper bound on
 * reality. Two probes:
 *   1. row geometry from scripts/print-layout-measure.html (per font scale,
 *      standard vs compact DN)
 *   2. fixed blocks from the real DN fixture
 *      (scripts/print-layout-fixture.html?doc=delivery) — standard vs compact
 *
 * Usage:
 *   CHROME_EXECUTABLE_PATH="..." node scripts/print-layout-measure.mjs
 *   MEASURE_SCALES=1,1.6 node scripts/print-layout-measure.mjs
 */

const root = process.cwd();
const MM_PER_PX = 25.4 / 96;
const scales = (process.env.MEASURE_SCALES || "1,1.6")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

async function executablePath() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known browser path.
    }
  }
  const bundledPath = await chromium.executablePath();
  await fs.access(bundledPath);
  return bundledPath;
}

let server;
let browser;

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

  const usingSystemChrome = Boolean(process.env.CHROME_EXECUTABLE_PATH);
  browser = await playwright.chromium.launch({
    args: usingSystemChrome ? [] : chromium.args,
    executablePath: await executablePath(),
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 1,
  });
  await page.emulateMedia({ media: "screen" });

  const settle = async (selector) => {
    await page.waitForSelector(selector, { timeout: 15000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
  };
  const measure = async (selectors) =>
    page.evaluate((keys) => {
      const out = {};
      for (const key of keys) {
        const el = document.querySelector(key);
        out[key] = el ? el.getBoundingClientRect().height : null;
      }
      return out;
    }, selectors);

  // ---- probe 1: row geometry (standard vs compact DN) ----
  for (const scale of scales) {
    for (const compact of [0, 1]) {
      const url = new URL("/scripts/print-layout-measure.html", baseUrl);
      url.searchParams.set("scale", String(scale));
      if (compact) url.searchParams.set("compact", "1");
      await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
      await settle('[data-measure="item-0"]');
      const rows = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll("[data-measure]").forEach((el) => {
          out[el.getAttribute("data-measure")] = el.getBoundingClientRect().height;
        });
        return out;
      });
      const mm = Object.fromEntries(
        Object.entries(rows).map(([key, px]) => [key, px * MM_PER_PX]),
      );
      console.log(`\n[rows] scale ${scale}${compact ? " compact" : ""}`);
      for (const [key, value] of Object.entries(mm)) {
        console.log(`  ${key.padEnd(12)} ${value.toFixed(2)}mm`);
      }
      console.log(`  note/line    ${((mm["item-4"] - mm["item-0"]) / 4).toFixed(2)}mm`);
    }
  }

  // ---- probe 2: real DN fixed blocks (standard vs compact) ----
  const sections = [
    ".print-classic-top",
    ".print-classic-info-band",
    ".print-classic-items-wrap",
    ".print-classic-bottom-band",
  ];
  for (const compact of [0, 1]) {
    const url = new URL("/scripts/print-layout-fixture.html", baseUrl);
    url.searchParams.set("template", "classic_v2");
    url.searchParams.set("doc", "delivery");
    if (compact) url.searchParams.set("compactDn", "1");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await settle(".print-sheet");
    const px = await measure(sections);
    const mm = Object.fromEntries(
      Object.entries(px).map(([key, value]) => [key, value == null ? null : value * MM_PER_PX]),
    );
    console.log(`\n[DN fixed] ${compact ? "compact" : "standard"}`);
    let total = 0;
    for (const [key, value] of Object.entries(mm)) {
      console.log(`  ${key.padEnd(34)} ${value == null ? "  n/a" : value.toFixed(2) + "mm"}`);
      if (value != null) total += value;
    }
    console.log(`  ${"TOTAL".padEnd(34)} ${total.toFixed(2)}mm`);
  }
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (server) await server.close().catch(() => undefined);
}
