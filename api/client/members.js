import { requireUser } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { normalizePermissions, writePermissionAudit } from "../_lib/permissions.js";
import { supabaseAdmin } from "../_lib/supabase.js";

const STAFF_ROLES = new Set(["manager", "officer"]);

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
  return ownMembership.workspace_user_id;
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

async function validateWorkspaceRole(workspaceUserId, roleId) {
  if (roleId == null) return null;
  if (typeof roleId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(roleId)) {
    throw new ApiError(400, "Invalid roleId");
  }
  const { data: role, error } = await supabaseAdmin
    .from("client_roles")
    .select("id")
    .eq("id", roleId)
    .eq("workspace_user_id", workspaceUserId)
    .maybeSingle();
  if (error) throw error;
  if (!role) throw new ApiError(404, "Custom role not found");
  return roleId;
}

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);
    const workspaceUserId = await getOwnerAndMembership(user.id);

    if (req.method === "GET") {
      const { data: members, error } = await supabaseAdmin
        .from("client_members")
        .select("id, workspace_user_id, member_user_id, role, status, permissions, custom_role_id, created_at, updated_at")
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
      if (body.permissions === undefined && body.roleId === undefined && body.role === undefined) {
        throw new ApiError(400, "Nothing to update");
      }

      const permissions = body.permissions !== undefined
        ? normalizePermissions(body.permissions)
        : undefined;
      const roleId = body.roleId !== undefined
        ? await validateWorkspaceRole(workspaceUserId, body.roleId)
        : undefined;
      const role = body.role !== undefined
        ? (() => {
            if (!STAFF_ROLES.has(body.role)) throw new ApiError(400, "Role must be manager or officer");
            return body.role;
          })()
        : undefined;

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("client_members")
        .select("role, permissions, custom_role_id")
        .eq("id", body.memberId)
        .eq("workspace_user_id", workspaceUserId)
        .neq("member_user_id", workspaceUserId)
        .single();
      if (existingError || !existing) throw existingError || new ApiError(404, "Member not found");

      const patch = {};
      if (permissions !== undefined) {
        patch.permissions = { ...(existing.permissions || {}), ...permissions };
      }
      if (roleId !== undefined) {
        patch.custom_role_id = roleId;
      }
      if (role !== undefined && role !== existing.role) {
        patch.role = role;
      }

      if (Object.keys(patch).length === 0) {
        return sendJson(res, 200, { member: existing });
      }

      const { data, error } = await supabaseAdmin
        .from("client_members")
        .update(patch)
        .eq("id", body.memberId)
        .eq("workspace_user_id", workspaceUserId)
        .neq("member_user_id", workspaceUserId)
        .select("id, workspace_user_id, member_user_id, role, status, permissions, custom_role_id")
        .single();
      if (error || !data) throw error || new ApiError(404, "Member not found");

      await writePermissionAudit(supabaseAdmin, {
        workspaceUserId,
        actorUserId: user.id,
        targetMemberId: body.memberId,
        action: patch.role || (roleId !== undefined && roleId !== existing.custom_role_id) ? "role.change" : "permissions.update",
        before: { role: existing.role, permissions: existing.permissions, custom_role_id: existing.custom_role_id },
        after: { role: data.role, permissions: data.permissions, custom_role_id: data.custom_role_id },
      });

      return sendJson(res, 200, { member: data });
    }

    res.setHeader("Allow", "GET, PATCH");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("[client members] Unhandled error:", error);
    return sendError(res, error);
  }
}
