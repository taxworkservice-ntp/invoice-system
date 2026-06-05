import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const id = req.query.id;
    if (!id) throw new ApiError(400, "Missing client id");

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
    if (error) throw error;
    if (!data?.user) throw new ApiError(404, "Client not found");

    return sendJson(res, 200, {
      user: {
        id: data.user.id,
        email: data.user.email || "",
        isActive: !data.user.banned_until,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
}
