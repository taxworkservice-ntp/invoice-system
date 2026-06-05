import { requireAdmin } from "../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const body = readJsonBody(req);
    const email = body.email?.trim();
    const companyName = body.companyName?.trim() || "";
    const adminNote = body.adminNote?.trim() || "";

    if (!email) throw new ApiError(400, "Email is required");

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { company_name: companyName },
    });
    if (authErr) throw authErr;

    const newUserId = authData.user.id;

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      role: "client",
      ...(adminNote ? { admin_notes: adminNote } : {}),
    });
    if (profileErr) throw profileErr;

    if (companyName) {
      const { error: cpErr } = await supabaseAdmin.from("client_profiles").insert({
        user_id: newUserId,
        company_name_th: companyName,
      });
      if (cpErr) throw cpErr;
    }

    try {
      await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email,
      });
    } catch (error) {
      console.warn("Invite link generation failed", error);
    }

    return sendJson(res, 200, { userId: newUserId, email });
  } catch (error) {
    return sendError(res, error);
  }
}
