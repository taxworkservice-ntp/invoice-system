import { requireUser } from "../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../_lib/http.js";
import { normalizePermissions, writePermissionAudit } from "../_lib/permissions.js";
import { supabaseAdmin } from "../_lib/supabase.js";

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

function validateName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) throw new ApiError(400, "Role name must be 1-60 characters");
  return trimmed;
}

async function getRolesWithCounts(workspaceUserId) {
  const { data: roles, error } = await supabaseAdmin
    .from("client_roles")
    .select("id, workspace_user_id, name, permissions, created_at, updated_at")
    .eq("workspace_user_id", workspaceUserId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const { data: members, error: memberError } = await supabaseAdmin
    .from("client_members")
    .select("custom_role_id")
    .eq("workspace_user_id", workspaceUserId);
  if (memberError) throw memberError;

  const counts = new Map();
  for (const member of members || []) {
    if (member.custom_role_id) {
      counts.set(member.custom_role_id, (counts.get(member.custom_role_id) || 0) + 1);
    }
  }

  return (roles || []).map((role) => ({ ...role, member_count: counts.get(role.id) || 0 }));
}

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);
    const workspaceUserId = await getOwnerAndMembership(user.id);

    if (req.method === "GET") {
      const roles = await getRolesWithCounts(workspaceUserId);
      return sendJson(res, 200, { roles });
    }

    if (req.method === "POST") {
      const body = readJsonBody(req);
      const name = validateName(body?.name);
      const permissions = normalizePermissions(body?.permissions) || {};

      const { data: duplicate } = await supabaseAdmin
        .from("client_roles")
        .select("id")
        .eq("workspace_user_id", workspaceUserId)
        .eq("name", name)
        .maybeSingle();
      if (duplicate) throw new ApiError(409, "A role with this name already exists");

      const { data: role, error } = await supabaseAdmin
        .from("client_roles")
        .insert({ workspace_user_id: workspaceUserId, name, permissions })
        .select("id, workspace_user_id, name, permissions, created_at, updated_at")
        .single();
      if (error) throw error;

      await writePermissionAudit(supabaseAdmin, {
        workspaceUserId,
        actorUserId: user.id,
        action: "custom_role.created",
        after: role,
      });

      return sendJson(res, 200, { role: { ...role, member_count: 0 } });
    }

    if (req.method === "PATCH") {
      const body = readJsonBody(req);
      const roleId = body?.roleId;
      if (!roleId) throw new ApiError(400, "Missing roleId");

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("client_roles")
        .select("id, name, permissions")
        .eq("id", roleId)
        .eq("workspace_user_id", workspaceUserId)
        .single();
      if (existingError || !existing) throw existingError || new ApiError(404, "Role not found");

      const patch = {};
      if (body.name !== undefined) {
        patch.name = validateName(body.name);
      }
      if (body.permissions !== undefined) {
        patch.permissions = normalizePermissions(body.permissions) || {};
      }
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update");

      if (patch.name && patch.name !== existing.name) {
        const { data: duplicate } = await supabaseAdmin
          .from("client_roles")
          .select("id")
          .eq("workspace_user_id", workspaceUserId)
          .eq("name", patch.name)
          .neq("id", roleId)
          .maybeSingle();
        if (duplicate) throw new ApiError(409, "A role with this name already exists");
      }

      const { data: role, error } = await supabaseAdmin
        .from("client_roles")
        .update(patch)
        .eq("id", roleId)
        .eq("workspace_user_id", workspaceUserId)
        .select("id, workspace_user_id, name, permissions, created_at, updated_at")
        .single();
      if (error || !role) throw error || new ApiError(404, "Role not found");

      await writePermissionAudit(supabaseAdmin, {
        workspaceUserId,
        actorUserId: user.id,
        action: "custom_role.updated",
        before: existing,
        after: role,
      });

      return sendJson(res, 200, { role });
    }

    if (req.method === "DELETE") {
      const body = readJsonBody(req);
      const roleId = body?.roleId;
      if (!roleId) throw new ApiError(400, "Missing roleId");

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("client_roles")
        .select("id, name")
        .eq("id", roleId)
        .eq("workspace_user_id", workspaceUserId)
        .single();
      if (existingError || !existing) throw existingError || new ApiError(404, "Role not found");

      const { count } = await supabaseAdmin
        .from("client_members")
        .select("id", { count: "exact", head: true })
        .eq("workspace_user_id", workspaceUserId)
        .eq("custom_role_id", roleId);
      if (count && count > 0) {
        throw new ApiError(409, "Role is assigned to team members. Reassign them first.");
      }

      const { error: deleteError } = await supabaseAdmin
        .from("client_roles")
        .delete()
        .eq("id", roleId)
        .eq("workspace_user_id", workspaceUserId);
      if (deleteError) throw deleteError;

      await writePermissionAudit(supabaseAdmin, {
        workspaceUserId,
        actorUserId: user.id,
        action: "custom_role.deleted",
        before: existing,
      });

      return sendJson(res, 200, { success: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("[client roles] Unhandled error:", error);
    return sendError(res, error);
  }
}
