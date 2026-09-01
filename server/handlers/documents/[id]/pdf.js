import playwright from "playwright-core";
import { requireUser } from "../../_lib/auth.js";
import { getChromiumLaunchOptions } from "../../_lib/chromium.js";
import { ApiError, readJsonBody, sendError } from "../../_lib/http.js";
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

export default async function handler(req, res) {
  let browser;

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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) throw new ApiError(403, "Profile not found");

    const { data: document, error: documentError } = await supabaseAdmin
      .from("documents")
      .select("id, user_id, doc_type, doc_number, issue_date")
      .eq("id", id)
      .single();

    if (documentError || !document) throw new ApiError(404, "Document not found");
    if (profile.role !== "admin" && document.user_id !== user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const { data: docOwner, error: docOwnerError } = await supabaseAdmin
      .from("client_profiles")
      .select("company_name_th")
      .eq("user_id", document.user_id)
      .single();

    const origin = originFromRequest(req);
    const exportUrl = new URL(`/documents/${encodeURIComponent(id)}/print`, origin);
    exportUrl.searchParams.set("export", "pdf");
    exportUrl.searchParams.set("copyTypes", normalizedCopyTypes.join(","));

    browser = await playwright.chromium.launch(await getChromiumLaunchOptions());

    const page = await browser.newPage({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
    });
    await page.emulateMedia({ media: "screen" });

    await page.addInitScript(
      ({ storageKey, session }) => {
        window.localStorage.setItem(storageKey, JSON.stringify(session));
      },
      {
        storageKey: supabaseStorageKey(),
        session: renderSession(token, user),
      },
    );

    await page.goto(exportUrl.toString(), { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector(".print-sheet", { timeout: 15000 });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

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
    const pdfBuffer = await page.pdf(pdfOptions);

    const filename = filenameFor(document, docOwner?.company_name_th);
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
    const encodedFilename = encodeURIComponent(filename);
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader("Cache-Control", "no-store");
    res.send(pdfBuffer);
  } catch (error) {
    return sendError(res, error);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
