import { ApiError, sendError, sendJson } from "../_lib/http.js";
import { supabaseAdmin } from "../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const cronSecret = process.env.CRON_SECRET;
    const authorization = req.headers.authorization || req.headers.Authorization;
    if (!cronSecret) throw new ApiError(500, "Cron secret is not configured");
    if (authorization !== `Bearer ${cronSecret}`) throw new ApiError(401, "Unauthorized");

    const { error } = await supabaseAdmin.rpc("mark_overdue_billing_notes");
    if (error) throw error;

    return sendJson(res, 200, { success: true });
  } catch (error) {
    return sendError(res, error);
  }
}
