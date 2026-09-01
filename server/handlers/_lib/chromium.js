import fs from "node:fs";
import chromium from "@sparticuz/chromium";

const LOCAL_CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

async function findLocalChromium() {
  for (const candidate of LOCAL_CHROME_CANDIDATES) {
    try {
      await fs.promises.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function getChromiumExecutablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  if (process.platform === "linux") return chromium.executablePath();
  const local = await findLocalChromium();
  if (!local) {
    throw new Error(
      `@sparticuz/chromium ships a Linux binary and cannot run on ${process.platform}. Install Google Chrome or set CHROME_EXECUTABLE_PATH to a Chrome/Edge executable.`,
    );
  }
  return local;
}

/**
 * Launch options for playwright.chromium.launch().
 *
 * @sparticuz/chromium's args (--single-process, --no-zygote, headless shell)
 * are tuned for its bundled AWS Lambda binary — system Chrome on macOS hangs
 * in newPage() with them, so local/dev launches use plain headless Chrome.
 * Linux (production) keeps the bundled binary + its args unchanged.
 */
export async function getChromiumLaunchOptions() {
  const executablePath = await getChromiumExecutablePath();
  if (process.platform === "linux") {
    return {
      executablePath,
      args: chromium.args,
      headless: chromium.headless,
    };
  }
  return {
    executablePath,
    args: [],
    headless: true,
  };
}
