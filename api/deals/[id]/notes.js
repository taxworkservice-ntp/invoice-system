import { requireUser } from "../../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    const { user } = await requireUser(req);
    const dealId = req.query.id;
    if (!dealId) throw new ApiError(400, "Missing deal id");

    // Verify user belongs to the deal's workspace
    const { data: deal, error: dealErr } = await supabaseAdmin
      .from("deals")
      .select("user_id")
      .eq("id", dealId)
      .single();
    if (dealErr || !deal) throw new ApiError(404, "Deal not found");

    const { data: membership } = await supabaseAdmin
      .from("client_members")
      .select("role")
      .eq("workspace_user_id", deal.user_id)
      .eq("member_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    const isOwner = user.id === deal.user_id;
    if (!membership && !isOwner) throw new ApiError(403, "Forbidden");

    if (req.method === "GET") {
      const { data: notes, error } = await supabaseAdmin
        .from("deal_notes")
        .select("id, deal_id, user_id, content, created_at")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch author names and roles
      const authorIds = [...new Set((notes || []).map((n) => n.user_id))];
      const authorMap = new Map();

      if (authorIds.length > 0) {
        const { data: members } = await supabaseAdmin
          .from("client_members")
          .select("member_user_id, role")
          .eq("workspace_user_id", deal.user_id)
          .in("member_user_id", authorIds);

        for (const m of (members || [])) {
          authorMap.set(m.member_user_id, m.role);
        }
      }

      // Get emails for display names
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const userMap = new Map<string, string>();
      for (const u of (users?.users || [])) {
        userMap.set(u.id, u.email || "");
      }

      const result = (notes || []).map((note) => {
        const role = note.user_id === deal.user_id ? "owner" : (authorMap.get(note.user_id) || "officer");
        const email = userMap.get(note.user_id) || "";
        return {
          id: note.id,
          deal_id: note.deal_id,
          user_id: note.user_id,
          author_name: email.split("@")[0] || email,
          author_role: role,
          content: note.content,
          created_at: note.created_at,
        };
      });

      return sendJson(res, 200, { notes: result });
    }

    if (req.method === "POST") {
      const body = readJsonBody(req);
      const content = (body.content || "").trim();
      if (!content) throw new ApiError(400, "Note content is required");
      if (content.length > 2000) throw new ApiError(400, "Note is too long");

      const { data: note, error } = await supabaseAdmin
        .from("deal_notes")
        .insert({ deal_id: dealId, user_id: user.id, content })
        .select("id, deal_id, user_id, content, created_at")
        .single();

      if (error) throw error;

      const role = isOwner ? "owner" : (membership?.role || "officer");
      const email = user.email || "";

      return sendJson(res, 201, {
        note: {
          id: note.id,
          deal_id: note.deal_id,
          user_id: note.user_id,
          author_name: email.split("@")[0] || email,
          author_role: role,
          content: note.content,
          created_at: note.created_at,
        },
      });
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendError(res, error);
  }
}
