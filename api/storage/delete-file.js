import { requireStorageAccess } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { deleteR2Object } from "../_lib/r2.js";
import { supabaseAdmin } from "../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const { key } = readJsonBody(req);
    if (!key) throw new ApiError(400, "Missing key");

    await requireStorageAccess(req, key);
    await deleteR2Object(key);

    const { error } = await supabaseAdmin.from("files").delete().eq("r2_key", key);
    if (error) throw error;

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendError(res, error);
  }
}
