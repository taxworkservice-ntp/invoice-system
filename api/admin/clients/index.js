import { requireAdmin } from "../../_lib/auth.js";
import { sendError, sendJson } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;

    const users = (data?.users || []).map((user) => ({
      id: user.id,
      email: user.email || "",
      isActive: !user.banned_until,
    }));

    return sendJson(res, 200, { users });
  } catch (error) {
    return sendError(res, error);
  }
}
