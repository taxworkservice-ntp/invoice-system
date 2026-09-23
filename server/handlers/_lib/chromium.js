import fs from "node:fs";
import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";

const LOCAL_CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

// Chromium launches can fail transiently under concurrency: @sparticuz/chromium
// writes /tmp/chromium, and a second launch on the same instance can exec it
// mid-write (ETXTBSY) or while it is briefly locked (EBUSY/EAGAIN). These are
// retryable — the writer finishes and the exec succeeds.
const RETRYABLE_LAUNCH_CODES = ["ETXTBSY", "EBUSY", "EAGAIN"];
const LAUNCH_RETRY_ATTEMPTS = 4;
const LAUNCH_RETRY_BASE_DELAY_MS = 250;

function isRetryableLaunchError(error) {
  const code = error?.code || error?.errno;
  if (code && RETRYABLE_LAUNCH_CODES.includes(code)) return true;
  const message = String(error?.message || "");
  return RETRYABLE_LAUNCH_CODES.some((candidate) => message.includes(candidate));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function buildChromiumLaunchOptions() {
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

// Memoized so concurrent renders share a single executablePath() extraction
// instead of racing to write /tmp/chromium — the root of the ETXTBSY failures.
// Reset on failure so a later request can retry the extraction.
let launchOptionsPromise;

/**
 * Launch options for playwright.chromium.launch().
 *
 * @sparticuz/chromium's args (--single-process, --no-zygote, headless shell)
 * are tuned for its bundled AWS Lambda binary — system Chrome on macOS hangs
 * in newPage() with them, so local/dev launches use plain headless Chrome.
 * Linux (production) keeps the bundled binary + its args unchanged.
 */
export function getChromiumLaunchOptions() {
  if (!launchOptionsPromise) {
    launchOptionsPromise = buildChromiumLaunchOptions().catch((error) => {
      launchOptionsPromise = undefined;
      throw error;
    });
  }
  return launchOptionsPromise;
}

/**
 * Launch headless Chromium, retrying the transient spawn races that concurrent
 * PDF renders hit on a shared serverless instance. Each attempt reuses the
 * memoized executable path, so retries never re-extract the binary.
 */
export async function launchChromium() {
  const options = await getChromiumLaunchOptions();
  let lastError;
  for (let attempt = 0; attempt < LAUNCH_RETRY_ATTEMPTS; attempt++) {
    try {
      return await playwright.chromium.launch(options);
    } catch (error) {
      lastError = error;
      if (!isRetryableLaunchError(error) || attempt === LAUNCH_RETRY_ATTEMPTS - 1) throw error;
      const waitMs = LAUNCH_RETRY_BASE_DELAY_MS * (attempt + 1);
      console.warn("[chromium] launch retry", {
        attempt: attempt + 1,
        waitMs,
        reason: String(error?.message || error),
      });
      await delay(waitMs);
    }
  }
  throw lastError;
}
