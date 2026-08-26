import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";
import { createServer } from "vite";

const root = process.cwd();
const updateBaselines = process.argv.includes("--update");
const baselineDir = path.join(root, "tests", "print-layout", "baselines");
const actualDir = path.join(root, "tests", "print-layout", "actual");
const maxDiffPixels = Number(process.env.PRINT_LAYOUT_MAX_DIFF_PIXELS || 500);
const pixelThreshold = Number(process.env.PRINT_LAYOUT_PIXEL_THRESHOLD || 12);

const variants = [
  { template: "modern", copyType: "original" },
  { template: "modern", copyType: "copy" },
  { template: "classic", copyType: "original" },
  { template: "classic", copyType: "copy" },
  { template: "modern", copyType: "original", doc: "many" },
  { template: "classic", copyType: "original", doc: "many" },
  { template: "modern", copyType: "original", doc: "many", appendix: true },
];

function nameFor({ template, copyType, doc, appendix }) {
  if (doc === "many") return appendix ? `many-${template}-${copyType}-appendix.png` : `many-${template}-${copyType}.png`;
  return `${template}-${copyType}.png`;
}

async function executablePath() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
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
  try {
    await fs.access(bundledPath);
    return bundledPath;
  } catch {
    throw new Error(
      "No Chromium executable found. Set CHROME_EXECUTABLE_PATH to Chrome or Edge before running print layout tests.",
    );
  }
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

  // sparticuz args (e.g. --single-process) hang system Chrome on macOS —
  // use them only with the bundled lambda binary.
  const usingSystemChrome = Boolean(process.env.CHROME_EXECUTABLE_PATH);
  browser = await playwright.chromium.launch({
    args: usingSystemChrome ? [] : chromium.args,
    executablePath: await executablePath(),
    headless: usingSystemChrome ? true : chromium.headless,
  });

  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 1,
  });
  await page.emulateMedia({ media: "screen" });

  const failures = [];

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
