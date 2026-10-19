import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolveHandler } from "../server/resolve.js";

const PROD_ORIGIN = process.env.DEV_API_FALLBACK_ORIGIN || "https://invoice.taxworkaccount.com";
const PORT = Number(process.env.DEV_API_PORT || 8787);
const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "handlers");

async function loadEnvFiles() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const name of [".env.local", ".env.development", ".env"]) {
    const file = path.join(root, name);
    if (!(await fileExists(file))) continue;
    const content = await readFile(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

await loadEnvFiles();

// Server-only variables the local API handlers read at import time. Without
// them every /api route that touches the admin client or R2 answers 500 with
// an opaque message in the browser, because the throw happens while the
// handler module is being loaded. Naming them up front (and in the response)
// turns a silent 500 into a one-line fix.
const REQUIRED_SERVER_ENV = [
  { name: "SUPABASE_SERVICE_ROLE_KEY", fallback: null },
  { name: "SUPABASE_URL", fallback: "VITE_SUPABASE_URL" },
  { name: "SUPABASE_ANON_KEY", fallback: "VITE_SUPABASE_ANON_KEY" },
  { name: "R2_BUCKET", fallback: null, storage: true },
  { name: "R2_ACCESS_KEY_ID", fallback: null, storage: true },
  { name: "R2_SECRET_ACCESS_KEY", fallback: null, storage: true },
  { name: "R2_ENDPOINT", fallback: null, storage: true },
];

function missingServerEnv() {
  return REQUIRED_SERVER_ENV.filter(
    ({ name, fallback }) => !process.env[name] && !(fallback && process.env[fallback]),
  );
}

const ENV_FIX_HINT =
  "Add the server secrets to .env.local (see .env.example) — `npx vercel env pull .env.development` " +
  "fetches them from the linked Vercel project — then restart `npm run dev:api`.";

const handlerCache = new Map();

async function fileExists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadHandler(file) {
  if (!handlerCache.has(file)) {
    const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
    handlerCache.set(file, mod.default);
  }
  return handlerCache.get(file);
}

function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        req.body = undefined;
      } else if ((req.headers["content-type"] || "").includes("application/json")) {
        try {
          req.body = JSON.parse(raw);
        } catch {
          req.body = raw;
        }
      } else {
        req.body = raw;
      }
      resolve();
    });
    req.on("error", () => {
      req.body = undefined;
      resolve();
    });
  });
}

function forwardToProd(req, res) {
  const url = new URL(req.url, PROD_ORIGIN);
  const isHttps = url.protocol === "https:";
  const doRequest = isHttps ? httpsRequest : httpRequest;

  const headers = { ...req.headers };
  headers.host = url.host;
  delete headers.origin;
  delete headers.referer;

  const upstream = doRequest(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    console.error("[dev-api] forward failed:", error.message);
    if (!res.headersSent) {
      res.status = (code) => ((res.statusCode = code), res);
      res.send = (body) => res.end(body);
      res.status(502).send(JSON.stringify({ error: "Upstream unavailable" }));
    }
  });

  req.pipe(upstream);
}

const server = createServer(async (req, res) => {
  res.status = (code) => ((res.statusCode = code), res);
  res.send = (body) => res.end(body);

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") {
    return forwardToProd(req, res);
  }

  const query = Object.fromEntries(url.searchParams.entries());
  Object.defineProperty(req, "query", { value: query, configurable: true, writable: true });

  const segments = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  try {
    const match = await resolveHandler(segments, API_DIR);
    if (!match) {
      console.log(`[dev-api] no local handler for ${req.method} ${url.pathname} → forwarding to prod`);
      return forwardToProd(req, res);
    }

    const handler = await loadHandler(match.file);
    req.params = match.params;
    // Parity with api/index.js on Vercel: dynamic route params are merged
    // into the query, so handlers reading req.query.action (e.g. storage)
    // work identically for path-style requests like /api/storage/image-proxy.
    req.query = { ...req.query, ...match.params };
    await parseBody(req);
    await handler(req, res);
  } catch (error) {
    console.error(`[dev-api] ${req.method} ${url.pathname} failed:`, error);
    if (!res.headersSent) {
      const message = error?.message || "Internal server error";
      // A missing server var throws while the handler module loads, so the
      // browser only ever saw "Internal server error". Say which var and how
      // to fix it instead — this is a local setup step, not a bug.
      const missing = typeof message === "string" && message.startsWith("Missing required environment variable:");
      res.status(500).send(JSON.stringify({
        error: process.env.NODE_ENV === "production" ? "Internal server error" : message,
        ...(missing ? { hint: ENV_FIX_HINT } : {}),
      }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`[dev-api] local API server on http://localhost:${PORT}`);
  console.log(`[dev-api] unmapped /api routes forward to ${PROD_ORIGIN}`);
  const missing = missingServerEnv();
  if (missing.length > 0) {
    const required = missing.filter((item) => !item.storage).map((item) => item.name);
    const storage = missing.filter((item) => item.storage).map((item) => item.name);
    console.warn("[dev-api] ──────────────────────────────────────────────────────────────");
    if (required.length > 0) {
      console.warn(`[dev-api] MISSING server env: ${required.join(", ")}`);
      console.warn("[dev-api]   → /api routes (PDF export, cron, admin) will answer 500 until set.");
    }
    if (storage.length > 0) {
      console.warn(`[dev-api] MISSING storage env: ${storage.join(", ")}`);
      console.warn("[dev-api]   → storage routes (logo/image proxy, PDF cache) will answer 500 until set.");
    }
    console.warn(`[dev-api] ${ENV_FIX_HINT}`);
    console.warn("[dev-api] ──────────────────────────────────────────────────────────────");
  }
});
