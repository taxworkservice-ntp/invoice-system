import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";
import { requireUser } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError } from "../_lib/http.js";
import { supabaseAdmin } from "../_lib/supabase.js";
import { getEnv } from "../_lib/env.js";

function originFromRequest(req) {
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

async function getExecutablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  return chromium.executablePath();
}

export default async function handler(req, res) {
  let browser;

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      throw new ApiError(405, "Method not allowed");
    }

    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    const user = await requireUser(req);

    const body = readJsonBody(req);
    const ids = body.ids;
    const layout = body.layout || "pnd";
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, "Missing record ids array");
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) throw new ApiError(403, "Profile not found");

    const { data: records, error: recordsError } = await supabaseAdmin
      .from("wht_records")
      .select("id, user_id")
      .in("id", ids);

    if (recordsError || !records || records.length === 0) {
      throw new ApiError(404, "No WHT records found");
    }

    const firstRec = records[0];
    if (profile.role !== "admin" && firstRec.user_id !== user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const origin = originFromRequest(req);
    const idsParam = ids.map(encodeURIComponent).join(",");
    const exportUrl = new URL(`/wht/print`, origin);
    exportUrl.searchParams.set("ids", idsParam);
    exportUrl.searchParams.set("export", "pdf");
    exportUrl.searchParams.set("layout", layout);

    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await getExecutablePath(),
      headless: chromium.headless,
    });

    const isPnd = layout === "pnd";
    const viewport = isPnd
      ? { width: 1512, height: 2138 }
      : { width: 794, height: 1123 };

    const page = await browser.newPage({
      viewport,
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

    const pdfOptions = isPnd
      ? {
          printBackground: true,
          preferCSSPageSize: false,
          width: "1512px",
          height: "2138px",
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        }
      : {
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        };

    const pdfBuffer = await page.pdf(pdfOptions);

    const now = new Date();
    const dateCode = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const filename = `wht_certificates_${dateCode}_${ids.length}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
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
