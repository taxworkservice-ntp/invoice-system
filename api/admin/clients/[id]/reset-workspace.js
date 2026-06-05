import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const id = req.query.id;
    if (!id) throw new ApiError(400, "Missing client id");

    const [dealUpdate, customerUpdate, itemUpdate, sequenceUpdate] = await Promise.all([
      supabaseAdmin.from("deals").update({ is_active: false }).eq("user_id", id).eq("is_active", true),
      supabaseAdmin.from("customers").update({ is_active: false }).eq("user_id", id).eq("is_active", true),
      supabaseAdmin.from("items").update({ is_active: false }).eq("user_id", id).eq("is_active", true),
      supabaseAdmin.from("doc_number_sequences").update({ last_sequence: 0, last_year: null }).eq("user_id", id),
    ]);

    const firstError = dealUpdate.error || customerUpdate.error || itemUpdate.error || sequenceUpdate.error;
    if (firstError) throw firstError;

    return sendJson(res, 200, { success: true });
  } catch (error) {
    return sendError(res, error);
  }
}
