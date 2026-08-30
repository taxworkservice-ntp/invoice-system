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
    const tempPassword = body.password?.trim() || "";

    if (!email) throw new ApiError(400, "Email is required");

    const createUserPayload = {
      email,
      email_confirm: !tempPassword,
      user_metadata: { company_name: companyName },
    };

    if (tempPassword) {
      createUserPayload.password = tempPassword;
      createUserPayload.email_confirm = true;
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser(createUserPayload);
    if (authErr) throw authErr;

    const newUserId = authData.user.id;

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      role: "client",
      ...(adminNote ? { admin_notes: adminNote } : {}),
    });
    if (profileErr) throw profileErr;

    const { error: memberErr } = await supabaseAdmin.from("client_members").insert({
      workspace_user_id: newUserId,
      member_user_id: newUserId,
      role: "owner",
      status: "active",
      permissions: null,
    });
    if (memberErr) throw memberErr;

    if (companyName || tempPassword) {
      const cpInsert = { user_id: newUserId };
      cpInsert.company_name_th = companyName || "รอกรอกข้อมูลบริษัท";
      if (tempPassword) cpInsert.password_changed = false;
      const { error: cpErr } = await supabaseAdmin.from("client_profiles").insert(cpInsert);
      if (cpErr) throw cpErr;
    }

    if (!tempPassword) {
      try {
        await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
        });
      } catch (error) {
        console.warn("Invite link generation failed", error);
      }
    }

    return sendJson(res, 200, { userId: newUserId, email, ...(tempPassword ? { tempPassword } : {}) });
  } catch (error) {
    return sendError(res, error);
  }
}
