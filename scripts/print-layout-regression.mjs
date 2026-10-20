import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { launchPrintLayoutChromium, printLayoutPlatform } from "./print-layout-chromium.mjs";

const root = process.cwd();
const updateBaselines = process.argv.includes("--update");
// Pixel baselines are platform-specific: font rasterisation differs between
// macOS, Windows and Linux, so a baseline captured on one platform reports
// thousands of "changed" pixels on another even though the layout is
// identical. Each platform owns its baselines; a platform without them skips
// the pixel comparison (the geometry checks — estimate and fill — stay the
// portable gate).
const platform = printLayoutPlatform();
const baselineDir = path.join(root, "tests", "print-layout", "baselines", platform);
const baselineMetaPath = path.join(baselineDir, "layout.json");
// The print layout version the code is at. The version lives with the print
// code (src/constants/index.ts) — a change to the output must bump it.
const layoutVersion = currentPrintLayoutVersion();
const actualDir = path.join(root, "tests", "print-layout", "actual");
const maxDiffPixels = Number(process.env.PRINT_LAYOUT_MAX_DIFF_PIXELS || 500);
const pixelThreshold = Number(process.env.PRINT_LAYOUT_PIXEL_THRESHOLD || 12);

const variants = [
  { template: "modern", copyType: "original" },
  { template: "modern", copyType: "copy" },
  { template: "classic_v2", copyType: "original" },
  { template: "classic_v2", copyType: "copy" },
  { template: "modern", copyType: "original", doc: "many" },
  { template: "classic_v2", copyType: "original", doc: "many" },
  { template: "classic_v2", copyType: "original", doc: "many", fontScale: "xlarge" },
  { template: "classic_v2", copyType: "original", doc: "many", fontScale: "xxlarge" },
  { template: "classic_v2", copyType: "original", doc: "delivery" },
  // The DN document carries the band rows (the merged heading) — the classic
  // V2 band look is locked here.
  { template: "classic_v2", copyType: "original", doc: "dn" },
  { template: "classic_v2", copyType: "original", doc: "delivery", compactDn: true },
  { template: "classic_v2", copyType: "original", printTitle: "tax_invoice_delivery_invoice" },
  { template: "modern", copyType: "original", printTitle: "tax_invoice_delivery_invoice" },
  { template: "classic_v2", copyType: "original", doc: "qt", wht: true },
  { template: "modern", copyType: "original", doc: "qt", wht: true },
  { template: "modern", copyType: "original", doc: "many", appendix: true },
];

/** The print layout version the code is at (src/constants/index.ts). */
function currentPrintLayoutVersion() {
  const source = fsSync.readFileSync(path.join(root, "src", "constants", "index.ts"), "utf8");
  const parsed = Number(source.match(/PRINT_LAYOUT_VERSION\s*=\s*(\d+)/)?.[1]);
  return Number.isFinite(parsed) ? parsed : 1;
}

function nameFor({ template, copyType, doc, appendix, fontScale, compactDn, printTitle, wht }) {
  const parts = [];
  if (doc === "many") parts.push("many");
  if (doc === "delivery") parts.push("delivery");
  if (doc === "qt") parts.push("qt");
  if (doc === "dn" || doc === "dn-short") parts.push(doc);
  parts.push(template);
  parts.push(copyType);
  if (fontScale) parts.push(fontScale);
  if (compactDn) parts.push("compact-dn");
  if (printTitle) parts.push("title-combined");
  if (wht) parts.push("wht");
  if (appendix) parts.push("appendix");
  return `${parts.join("-")}.png`;
}

async function comparePngs(page, expectedBuffer, actualBuffer) {
  return page.evaluate(
    async ({ expectedBase64, actualBase64, pixelThreshold }) => {
      const load = (base64) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Unable to load PNG for comparison"));
          img.src = `data:image/png;base64,${base64}`;
        });

      const [expected, actual] = await Promise.all([load(expectedBase64), load(actualBase64)]);
      if (expected.width !== actual.width || expected.height !== actual.height) {
        return {
          sameSize: false,
          width: actual.width,
          height: actual.height,
          expectedWidth: expected.width,
          expectedHeight: expected.height,
          diffPixels: Infinity,
          diffRatio: 1,
          diffPngBase64: "",
        };
      }

      const canvas = document.createElement("canvas");
      const diffCanvas = document.createElement("canvas");
      canvas.width = diffCanvas.width = expected.width;
      canvas.height = diffCanvas.height = expected.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const diffCtx = diffCanvas.getContext("2d");

      ctx.drawImage(expected, 0, 0);
      const expectedPixels = ctx.getImageData(0, 0, expected.width, expected.height);
      ctx.clearRect(0, 0, expected.width, expected.height);
      ctx.drawImage(actual, 0, 0);
      const actualPixels = ctx.getImageData(0, 0, expected.width, expected.height);
      const diffPixelsImage = diffCtx.createImageData(expected.width, expected.height);

      let diffPixels = 0;
      for (let i = 0; i < expectedPixels.data.length; i += 4) {
        const dr = Math.abs(expectedPixels.data[i] - actualPixels.data[i]);
        const dg = Math.abs(expectedPixels.data[i + 1] - actualPixels.data[i + 1]);
        const db = Math.abs(expectedPixels.data[i + 2] - actualPixels.data[i + 2]);
        const da = Math.abs(expectedPixels.data[i + 3] - actualPixels.data[i + 3]);
        const different = Math.max(dr, dg, db, da) > pixelThreshold;

        if (different) {
          diffPixels += 1;
          diffPixelsImage.data[i] = 255;
          diffPixelsImage.data[i + 1] = 0;
          diffPixelsImage.data[i + 2] = 255;
          diffPixelsImage.data[i + 3] = 255;
        } else {
          diffPixelsImage.data[i] = actualPixels.data[i];
          diffPixelsImage.data[i + 1] = actualPixels.data[i + 1];
          diffPixelsImage.data[i + 2] = actualPixels.data[i + 2];
          diffPixelsImage.data[i + 3] = 80;
        }
      }

      diffCtx.putImageData(diffPixelsImage, 0, 0);

      return {
        sameSize: true,
        width: actual.width,
        height: actual.height,
        expectedWidth: expected.width,
        expectedHeight: expected.height,
        diffPixels,
        diffRatio: diffPixels / (expected.width * expected.height),
        diffPngBase64: diffCanvas.toDataURL("image/png").split(",")[1],
      };
    },
    {
      expectedBase64: expectedBuffer.toString("base64"),
      actualBase64: actualBuffer.toString("base64"),
      pixelThreshold,
    },
  );
}

async function renderVariant(page, baseUrl, variant) {
  const url = new URL("/scripts/print-layout-fixture.html", baseUrl);
  url.searchParams.set("template", variant.template);
  url.searchParams.set("copyType", variant.copyType);
  if (variant.doc) url.searchParams.set("doc", variant.doc);
  if (variant.appendix) url.searchParams.set("appendix", "1");
  if (variant.fontScale) url.searchParams.set("fontScale", variant.fontScale);
  if (variant.compactDn) url.searchParams.set("compactDn", "1");
  if (variant.printTitle) url.searchParams.set("printTitle", variant.printTitle);
  if (variant.wht) url.searchParams.set("wht", "1");

  // networkidle never settles on the Vite dev server (HMR socket) — use
  // domcontentloaded + the print-sheet selector below instead.
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".print-sheet", { timeout: 15000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  return page.locator(".print-sheet").screenshot({ type: "png" });
}

let server;
let browser;

try {
  await fs.mkdir(baselineDir, { recursive: true });
  if (!updateBaselines) await fs.mkdir(actualDir, { recursive: true });

  server = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
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

  const failures = [];

  if (updateBaselines) {
    await fs.mkdir(baselineDir, { recursive: true });
    await fs.writeFile(
      baselineMetaPath,
      `${JSON.stringify({ version: layoutVersion, platform, capturedAt: new Date().toISOString() }, null, 2)}\n`,
    );
  }

  // A platform without baselines has no pixel expectation to compare against:
  // the rasterisation differs by platform, so a macOS baseline reports
  // thousands of changed pixels on Windows even when the layout is identical.
  // Capture this platform's baselines with `npm run test:print-layout:update`.
  const hasBaselines = await fs
    .readdir(baselineDir)
    .then((entries) => entries.some((entry) => entry.endsWith(".png")))
    .catch(() => false);

  if (!hasBaselines && !updateBaselines) {
    console.log(
      `skip  no pixel baselines for "${platform}" — run npm run test:print-layout:update to capture them.\n` +
        `      The portable gate is npm run test:print-layout:estimate and npm run test:print-layout:fill.`,
    );
  }

  // Baselines captured with a different layout version cannot be compared to:
  // the render itself changed. Say so and skip, rather than reporting the
  // layout change as thousands of changed pixels.
  const baselineVersion = await fs
    .readFile(baselineMetaPath, "utf8")
    .then((raw) => {
      try {
        return Number(JSON.parse(raw).version);
      } catch {
        return null;
      }
    })
    .catch(() => null);
  const baselinesAreStale =
    hasBaselines && baselineVersion !== null && baselineVersion !== layoutVersion;
  if (baselinesAreStale && !updateBaselines) {
    console.log(
      `skip  the "${platform}" baselines are from print layout v${baselineVersion}, the code is v${layoutVersion}.\n` +
        `      Re-capture them with npm run test:print-layout:update — the layout changed, so the old\n` +
        `      expectations are stale. The portable gate is npm run test:print-layout:estimate and\n` +
        `      npm run test:print-layout:fill.`,
    );
  }

  for (const variant of variants) {
    const fileName = nameFor(variant);
    const baselinePath = path.join(baselineDir, fileName);
    const actualPath = path.join(actualDir, fileName);
    const diffPath = path.join(actualDir, fileName.replace(/\.png$/, ".diff.png"));
    const screenshot = await renderVariant(page, baseUrl, variant);

    if (updateBaselines) {
      await fs.writeFile(baselinePath, screenshot);
      console.log(`updated ${path.relative(root, baselinePath)}`);
      continue;
    }

    if (!hasBaselines || baselinesAreStale) {
      console.log(
        `skip  ${fileName}: ${baselinesAreStale ? "the baselines are stale (nothing to compare against)" : `no "${platform}" baseline to compare against`}`,
      );
      continue;
    }

    let baseline;
    try {
      baseline = await fs.readFile(baselinePath);
    } catch {
      failures.push(`${fileName}: missing baseline. Run npm run test:print-layout:update to approve the current layout.`);
      await fs.writeFile(actualPath, screenshot);
      continue;
    }

    const result = await comparePngs(page, baseline, screenshot);
    if (!result.sameSize || result.diffPixels > maxDiffPixels) {
      await fs.writeFile(actualPath, screenshot);
      if (result.diffPngBase64) await fs.writeFile(diffPath, Buffer.from(result.diffPngBase64, "base64"));
      failures.push(
        `${fileName}: ${result.diffPixels} changed pixels (${(result.diffRatio * 100).toFixed(3)}%). ` +
          `Allowed ${maxDiffPixels}. Actual saved to ${path.relative(root, actualPath)}.`,
      );
    } else {
      console.log(`ok ${fileName}: ${result.diffPixels} changed pixels`);
    }
  }

  if (failures.length > 0) {
    console.error("\nPrint layout regression failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (server) await server.close().catch(() => undefined);
}
