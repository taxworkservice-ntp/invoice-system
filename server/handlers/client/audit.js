import { requireUser } from "../_lib/auth.js";
import { ApiError, sendError, sendJson } from "../_lib/http.js";
import { supabaseAdmin } from "../_lib/supabase.js";

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);

    const { data: ownMembership } = await supabaseAdmin
      .from("client_members")
      .select("workspace_user_id, role")
      .eq("member_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!ownMembership || ownMembership.role !== "owner" || ownMembership.workspace_user_id !== user.id) {
      throw new ApiError(403, "Owner access required");
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const { data: entries, error } = await supabaseAdmin
      .from("client_permission_audit")
      .select("id, actor_user_id, target_member_id, action, before, after, created_at")
      .eq("workspace_user_id", ownMembership.workspace_user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const userIds = new Set();
    for (const entry of entries || []) {
      if (entry.actor_user_id) userIds.add(entry.actor_user_id);
      if (entry.target_member_id) userIds.add(entry.target_member_id);
    }

    const userMap = new Map();
    await Promise.all(
      [...userIds].map(async (userId) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (data?.user) userMap.set(userId, data.user.email || "");
      }),
    );

    return sendJson(res, 200, {
      entries: (entries || []).map((entry) => ({
        ...entry,
        actor_email: userMap.get(entry.actor_user_id) || "",
        target_email: entry.target_member_id ? userMap.get(entry.target_member_id) || "" : "",
      })),
    });
  } catch (error) {
    console.error("[client audit] Unhandled error:", error);
    return sendError(res, error);
  }
}
