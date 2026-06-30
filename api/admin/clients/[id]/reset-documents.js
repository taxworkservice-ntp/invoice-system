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

    await supabaseAdmin.from("billing_note_invoices").delete().eq("user_id", id);
    await supabaseAdmin.from("document_line_items").delete().eq("user_id", id);
    await supabaseAdmin.from("stock_movements").delete().eq("user_id", id);
    await supabaseAdmin.from("deals").delete().eq("user_id", id);
    await supabaseAdmin.from("documents").delete().eq("user_id", id);

    const { error: seqErr } = await supabaseAdmin
      .from("doc_number_sequences")
      .update({ last_sequence: 0, last_year: null, last_month: null })
      .eq("user_id", id);

    if (seqErr) throw seqErr;

    return sendJson(res, 200, { success: true });
  } catch (error) {
    return sendError(res, error);
  }
}
