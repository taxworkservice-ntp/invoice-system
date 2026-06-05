import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const id = req.query.id;
    const { password } = readJsonBody(req);
    if (!id) throw new ApiError(400, "Missing client id");
    if (!password || password.length < 6) throw new ApiError(400, "Password must be at least 6 characters");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
    if (error) throw error;

    return sendJson(res, 200, { success: true });
  } catch (error) {
    return sendError(res, error);
  }
}
