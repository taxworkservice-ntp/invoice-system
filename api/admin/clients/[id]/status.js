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
    const { active } = readJsonBody(req);
    if (!id) throw new ApiError(400, "Missing client id");
    if (typeof active !== "boolean") throw new ApiError(400, "Active flag is required");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: active ? "none" : "876000h",
    });
    if (error) throw error;

    return sendJson(res, 200, { success: true, isActive: active });
  } catch (error) {
    return sendError(res, error);
  }
}
