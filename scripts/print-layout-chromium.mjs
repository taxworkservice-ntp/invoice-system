/**
 * Shared Chromium launcher for the print-layout scripts.
 *
 * The bundled `@sparticuz/chromium` binary is built for Linux (AWS Lambda) and
 * its args (`--single-process --no-zygote`) either crash a desktop Chrome or
 * hang it. So the bundled binary is used on Linux only; every other platform
 * runs the locally installed Chrome/Edge with no extra args — the same rule
 * `server/handlers/_lib/chromium.js` applies when the API renders a PDF.
 *
 * The pixel baselines are captured per platform for the same reason: font
 * rasterisation differs between macOS, Windows and Linux, so a baseline
 * captured on one platform is not a valid expectation on another.
 */
import fs from "node:fs/promises";
import process from "node:process";
import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";

/** Short, stable platform key used for the baseline folders. */
export function printLayoutPlatform() {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "win32") return "win";
  return "linux";
}

/**
 * Resolve a Chromium binary. Order: the explicit env var, the well-known
 * desktop install paths, and finally the bundled Linux binary.
 */
export async function resolveChromiumExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return { executablePath: candidate, bundled: false };
    } catch {
      // Try the next known browser path.
    }
  }

  try {
    const bundledPath = await chromium.executablePath();
    await fs.access(bundledPath);
    return { executablePath: bundledPath, bundled: true };
  } catch {
    throw new Error(
      "No Chromium executable found. Set CHROME_EXECUTABLE_PATH to Chrome or Edge before running the print layout checks.",
    );
  }
}

/** Launch Chromium the way this platform supports it. */
export async function launchPrintLayoutChromium() {
  const { executablePath, bundled } = await resolveChromiumExecutable();
  return playwright.chromium.launch({
    args: bundled ? chromium.args : [],
    executablePath,
    headless: bundled ? chromium.headless : true,
  });
}
