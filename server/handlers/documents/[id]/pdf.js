import playwright from "playwright-core";
import { requireUser } from "../../_lib/auth.js";
import { getChromiumLaunchOptions } from "../../_lib/chromium.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../_lib/http.js";
import { getR2ObjectBytes, putR2Object } from "../../_lib/r2.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { getEnv } from "../../_lib/env.js";

function documentId(req) {
  const id = req.query.id;
  return Array.isArray(id) ? id[0] : id;
}

function normalizeCopyTypes(value) {
  if (!Array.isArray(value) || value.length === 0) return ["original"];
  const copyTypes = value.filter((item) => item === "original" || item === "copy");
  if (copyTypes.length === 0) return ["original"];
  return copyTypes.slice(0, 2);
}

// Cache variant per render configuration. Single-copy downloads share one
// key; two-copy downloads vary by order/interleave/reference mode, so each
// used combination gets its own bounded key (≤4 per document).
function pdfVariant(copyTypes, interleave, refCollapse) {
  if (copyTypes.length === 1) return copyTypes[0];
  return `both-${copyTypes.join("-")}-il${interleave}-ref${refCollapse ? 1 : 0}`;
}

function pdfCacheKey(userId, documentId, variant) {
  return `pdfs/${userId}/${documentId}/${variant}.pdf`;
}

function originFromRequest(req) {
  // Local dev API (npm run dev:api) only serves /api routes — the app itself
  // runs on Vite (5173). Non-/api paths would otherwise hit the prod-forward
  // fallback, so render from the Vite origin in dev. Vercel (NODE_ENV=
  // production) serves app + API on one origin and keeps request-origin logic.
  if (process.env.NODE_ENV !== "production") {
    return process.env.DEV_APP_ORIGIN || "http://localhost:5173";
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  if (!host) throw new ApiError(400, "Missing request host");
  return `${proto}://${host}`;
}

function supabaseStorageKey() {
  const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function renderSession(token, user) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 30;
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: 60 * 30,
    expires_at: expiresAt,
    refresh_token: "server-pdf-render",
    user,
  };
}

function sanitizeFilenamePart(name) {
  return name
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\u0E00-\u0E7F\-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function filenameFor(document, companyName) {
  const docNumber = document.doc_number || "doc";
  const datePart = document.issue_date
    ? String(document.issue_date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const safeName = sanitizeFilenamePart(companyName || "");
  const parts = [docNumber];
  if (safeName) parts.push(safeName);
  parts.push(datePart);
  return `${parts.join("_")}.pdf`;
}

function sendPdf(res, buffer, filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  const encodedFilename = encodeURIComponent(filename);
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`);
  res.setHeader("Cache-Control", "no-store");
  res.send(buffer);
}

// Freshness mirrors src/lib/storageApi.ts getCachedPdfFile: the cached bytes
// are valid while the files row is at least as new as the document's RENDER
// version. Every render input bumps documents.render_updated_at via
// touch-triggers (supabase/migrations/20260915120000_pdf_render_version.sql),
// so a hit can never serve bytes rendered from older content. The user-facing
// documents.updated_at is deliberately NOT used here — profile/customer edits
// bump the render version in bulk but must not move "last edited".
async function lookupFreshCache(document, variant) {
  const key = pdfCacheKey(document.user_id, document.id, variant);
  const { data: file, error } = await supabaseAdmin
    .from("files")
    .select("r2_key, updated_at")
    .eq("r2_key", key)
    .maybeSingle();
  if (error || !file) return null;
  if (new Date(file.updated_at).getTime() < new Date(document.render_updated_at).getTime()) return null;
  return file;
}

async function backfillPdfCache({ key, documentId, userId, filename, buffer, expectedRenderUpdatedAt }) {
  try {
    // Race guard: a render takes seconds, and the document may have been
    // edited (or a newer render may have already backfilled) while it ran.
    // Backfilling older bytes under a fresh timestamp would freeze stale
    // content in the cache permanently — so verify before writing. A skipped
    // backfill only costs one more render on the next download.
    const { data: current, error: currentError } = await supabaseAdmin
      .from("documents")
      .select("render_updated_at")
      .eq("id", documentId)
      .single();
    if (currentError || !current) return "skipped";
    if (new Date(current.render_updated_at).getTime() !== new Date(expectedRenderUpdatedAt).getTime()) return "skipped";

    await putR2Object(key, buffer, "application/pdf");
    const { error } = await supabaseAdmin.from("files").upsert(
      {
        user_id: userId,
        document_id: documentId,
        r2_key: key,
        purpose: "pdfs",
        filename,
        content_type: "application/pdf",
        size_bytes: buffer.length,
      },
      { onConflict: "r2_key" }
    );
    if (error) throw error;
    return "stored";
  } catch (error) {
    // Cache is best-effort: the freshly rendered bytes are still served.
    console.warn("[pdf-cache] backfill failed", key, error?.message || error);
    return "failed";
  }
}

// Stage budgets for the headless render. Kept here (not inline) so the timing
// log and the actual waits can never drift apart. RENDER_BUDGET_MS keeps the
// whole render under the 60s serverless cap, so a slow document fails fast
// with a clear message instead of an opaque platform 504.
const RENDER_BUDGET_MS = 55000;
const RENDER_TIMEOUTS = { gotoMs: 25000, selectorMs: 30000, assetsMs: 5000 };

// A stage never waits past the render deadline: min(stage budget, time left).
function boundedTimeout(stageMs, deadline) {
  return Math.max(1000, Math.min(stageMs, deadline - Date.now()));
}

function truncateText(value, max = 240) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

// Snapshot of what the headless page actually showed when a stage failed. The
// difference between the error card, the spinner, and a login redirect is the
// difference between a data bug and a slow/expired render — without it every
// failure is an opaque "Internal server error".
async function describeRenderPage(page) {
  try {
    return await page.evaluate(() => ({
      path: `${window.location.pathname}${window.location.search}`,
      title: document.title,
      sheets: document.querySelectorAll(".print-sheet").length,
      text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200),
    }));
  } catch {
    return null;
  }
}

async function renderPdfBuffer({
  origin,
  storageKey,
  session,
  id,
  normalizedCopyTypes,
  interleave,
  refCollapse,
}) {
  let browser;
  let page;
  let succeeded = false;
  let stage = "launch";
  const startedAt = Date.now();
  const deadline = startedAt + RENDER_BUDGET_MS;
  const timings = { launch: 0, goto: 0, selector: 0, assets: 0, pdf: 0, total: 0 };
  const pageErrors = [];
  const consoleErrors = [];

  try {
    const exportUrl = new URL(`/documents/${encodeURIComponent(id)}/print`, origin);
    exportUrl.searchParams.set("export", "pdf");
    exportUrl.searchParams.set("copyTypes", normalizedCopyTypes.join(","));
    // Print-time reference collapse (classic V2): one line per DN group
    if (refCollapse) exportUrl.searchParams.set("refCollapse", "1");
    exportUrl.searchParams.set("interleave", interleave);

    browser = await playwright.chromium.launch(await getChromiumLaunchOptions());
    timings.launch = Date.now() - startedAt;

    page = await browser.newPage({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
    });
    // The print SPA runs its own auth/data bootstrap inside this page; surface
    // its errors so a blank render is diagnosable instead of an opaque timeout.
    page.on("pageerror", (error) => {
      if (pageErrors.length < 5) pageErrors.push(truncateText(error?.message || String(error), 160));
    });
    page.on("console", (message) => {
      if (message.type() === "error" && consoleErrors.length < 5) {
        consoleErrors.push(truncateText(message.text(), 160));
      }
    });
    await page.emulateMedia({ media: "screen" });

    await page.addInitScript(
      ({ key, sess }) => {
        window.localStorage.setItem(key, JSON.stringify(sess));
      },
      {
        key: storageKey,
        sess: session,
      },
    );

    // domcontentloaded + explicit readiness beats networkidle: idle never
    // fires while any connection lingers and always costs the full tail.
    stage = "goto";
    const gotoStart = Date.now();
    await page.goto(exportUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: boundedTimeout(RENDER_TIMEOUTS.gotoMs, deadline),
    });
    timings.goto = Date.now() - gotoStart;

    stage = "selector";
    const selectorStart = Date.now();
    await page.waitForSelector(".print-sheet", {
      timeout: boundedTimeout(RENDER_TIMEOUTS.selectorMs, deadline),
    });
    timings.selector = Date.now() - selectorStart;

    stage = "assets";
    const assetsStart = Date.now();
    await page.evaluate(async (capMs) => {
      if (document.fonts?.ready) await document.fonts.ready;
      // Logos load via the image proxy — never freeze them out of a cached
      // PDF, but cap the wait so one slow asset can't stall the render.
      const pending = Array.from(document.images).filter((img) => !img.complete);
      if (pending.length > 0) {
        await Promise.race([
          Promise.all(
            pending.map(
              (img) =>
                new Promise((resolve) => {
                  img.addEventListener("load", resolve, { once: true });
                  img.addEventListener("error", resolve, { once: true });
                }),
            ),
          ),
          new Promise((resolve) => setTimeout(resolve, capMs)),
        ]);
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, boundedTimeout(RENDER_TIMEOUTS.assetsMs, deadline));
    timings.assets = Date.now() - assetsStart;

    await page.addStyleTag({ content: "@page { margin: 0 !important; }" });

    const useExplicitPageSize = process.env.PDF_USE_EXPLICIT_PAGE_SIZE !== "false";
    const pdfOptions = {
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    };
    if (useExplicitPageSize) {
      pdfOptions.width = "210mm";
      pdfOptions.height = "297mm";
    } else {
      pdfOptions.format = "A4";
    }

    stage = "pdf";
    const pdfStart = Date.now();
    const buffer = await page.pdf(pdfOptions);
    timings.pdf = Date.now() - pdfStart;
    succeeded = true;
    return buffer;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    const pageState = page ? await describeRenderPage(page) : null;
    const parts = [
      `stage=${stage}`,
      `elapsed=${Date.now() - startedAt}ms`,
      `reason=${truncateText(error?.message || String(error), 200)}`,
    ];
    if (pageState) {
      parts.push(`url=${pageState.path}`, `sheets=${pageState.sheets}`);
      if (pageState.text) parts.push(`text="${truncateText(pageState.text, 160)}"`);
    }
    if (pageErrors.length > 0) parts.push(`pageerror="${pageErrors[0]}"`);
    if (consoleErrors.length > 0) parts.push(`console="${consoleErrors[0]}"`);

    console.error("[pdf-render] failed", {
      id,
      stage,
      timings,
      pageState,
      pageErrors,
      consoleErrors,
      error: error?.stack || String(error),
    });
    // 502 (not 500): the render is an upstream/render failure and the message
    // is safe to surface — it is the only way to see why a document fails.
    throw new ApiError(502, `PDF render failed (${parts.join(" ")})`);
  } finally {
    timings.total = Date.now() - startedAt;
    console.log(
      "[pdf-render]",
      JSON.stringify({
        id,
        ok: succeeded,
        stage,
        timings,
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length,
      }),
    );
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      throw new ApiError(405, "Method not allowed");
    }

    const id = documentId(req);
    if (!id) throw new ApiError(400, "Missing document id");

    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    const user = await requireUser(req);
    const body = readJsonBody(req);
    const { copyTypes } = body;
    const normalizedCopyTypes = normalizeCopyTypes(copyTypes);
    // Two-copy page order: interleave pages (default) or print each copy
    // complete first (?interleave=0). Always forwarded explicitly.
    const interleave = body.interleave === 0 ? "0" : "1";
    const refCollapse = body.refCollapse ? 1 : 0;
    // Warm mode (background pre-render after finalize): render + backfill
    // the cache, then reply with JSON instead of shipping PDF bytes to a
    // caller that would discard them.
    const warm = body.warm === true;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) throw new ApiError(403, "Profile not found");

    const { data: document, error: documentError } = await supabaseAdmin
      .from("documents")
      .select("id, user_id, doc_type, doc_number, issue_date, updated_at, render_updated_at")
      .eq("id", id)
      .single();

    if (documentError || !document) throw new ApiError(404, "Document not found");
    if (profile.role !== "admin" && document.user_id !== user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const { data: docOwner } = await supabaseAdmin
      .from("client_profiles")
      .select("company_name_th")
      .eq("user_id", document.user_id)
      .single();

    const filename = filenameFor(document, docOwner?.company_name_th);
    const variant = pdfVariant(normalizedCopyTypes, interleave, refCollapse);
    const cacheKey = pdfCacheKey(document.user_id, document.id, variant);

    // Fast path: serve cached bytes rendered from identical content.
    const cached = await lookupFreshCache(document, variant);
    if (cached) {
      try {
        const { bytes } = await getR2ObjectBytes(cached.r2_key);
        if (warm) return sendJson(res, 200, { success: true, cached: true });
        return sendPdf(res, Buffer.from(bytes), filename);
      } catch (error) {
        // Orphan row (object gone) or transient storage error: fall through
        // to a fresh render, which also repairs the cache.
        console.warn("[pdf-cache] serve failed, re-rendering", cacheKey, error?.message || error);
      }
    }

    // Slow path (first download, or content changed since last render).
    const origin = originFromRequest(req);
    const pdfBuffer = await renderPdfBuffer({
      origin,
      storageKey: supabaseStorageKey(),
      session: renderSession(token, user),
      id,
      normalizedCopyTypes,
      interleave,
      refCollapse,
    });

    await backfillPdfCache({
      key: cacheKey,
      documentId: document.id,
      userId: document.user_id,
      filename,
      buffer: pdfBuffer,
      expectedRenderUpdatedAt: document.render_updated_at,
    });

    if (warm) return sendJson(res, 200, { success: true, cached: false });
    return sendPdf(res, pdfBuffer, filename);
  } catch (error) {
    return sendError(res, error);
  }
}
