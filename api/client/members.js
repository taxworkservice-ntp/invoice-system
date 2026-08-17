import { requireUser } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { supabaseAdmin } from "../_lib/supabase.js";

const PERMISSION_KEYS = new Set([
  "canCreateEditDocuments",
  "canSendQuotations",
  "canSendDeliveryNotes",
  "canSendFinancialDocuments",
  "canRecordPayments",
  "canVoidDocuments",
  "canDeleteDocuments",
]);

async function getOwnerAndMembership(userId) {
  const { data: ownMembership } = await supabaseAdmin
    .from("client_members")
    .select("workspace_user_id, role")
    .eq("member_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!ownMembership || ownMembership.role !== "owner" || ownMembership.workspace_user_id !== userId) {
    throw new ApiError(403, "Owner access required");
  }
  return userId;
}

async function getAuthUserMap(userIds) {
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      return [userId, data?.user || null];
    }),
  );
  return new Map(entries);
}

function normalizePermissions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "Invalid permissions");
  }
  const normalized = {};
  for (const [key, value] of Object.entries(input)) {
    if (!PERMISSION_KEYS.has(key)) continue;
    if (typeof value !== "boolean") throw new ApiError(400, "Invalid permission value");
    normalized[key] = value;
  }
  return normalized;
}

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);
    const workspaceUserId = await getOwnerAndMembership(user.id);

    if (req.method === "GET") {
      const { data: members, error } = await supabaseAdmin
        .from("client_members")
        .select("id, workspace_user_id, member_user_id, role, status, permissions, created_at, updated_at")
        .eq("workspace_user_id", workspaceUserId)
        .neq("member_user_id", workspaceUserId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const userMap = await getAuthUserMap((members || []).map((member) => member.member_user_id));
      return sendJson(res, 200, {
        members: (members || []).map((member) => ({
          ...member,
          email: userMap.get(member.member_user_id)?.email || "",
        })),
      });
    }

    if (req.method === "PATCH") {
      const body = readJsonBody(req);
      if (!body?.memberId) throw new ApiError(400, "Missing memberId");
      const permissions = normalizePermissions(body.permissions);
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("client_members")
        .select("permissions")
        .eq("id", body.memberId)
        .eq("workspace_user_id", workspaceUserId)
        .neq("member_user_id", workspaceUserId)
        .single();
      if (existingError || !existing) throw existingError || new ApiError(404, "Member not found");
      const { data, error } = await supabaseAdmin
        .from("client_members")
        .update({ permissions: { ...(existing.permissions || {}), ...permissions } })
        .eq("id", body.memberId)
        .eq("workspace_user_id", workspaceUserId)
        .neq("member_user_id", workspaceUserId)
        .select("id, workspace_user_id, member_user_id, role, status, permissions")
        .single();
      if (error || !data) throw error || new ApiError(404, "Member not found");
      return sendJson(res, 200, { member: data });
    }

    res.setHeader("Allow", "GET, PATCH");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("[client members] Unhandled error:", error);
    return sendError(res, error);
  }
}
