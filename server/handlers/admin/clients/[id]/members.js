import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../../_lib/http.js";
import { normalizePermissions, writePermissionAudit } from "../../../_lib/permissions.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

const STAFF_ROLES = new Set(["manager", "officer"]);
const STATUSES = new Set(["active", "disabled"]);

const ROLE_PERMISSION_DEFAULTS = {
  owner: null,
  manager: {},
  officer: {},
};

async function getAuthUserMap(userIds) {
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      return [userId, data?.user || null];
    }),
  );
  return new Map(entries);
}

async function getWorkspaceRoleNames(workspaceId) {
  const { data: roles } = await supabaseAdmin
    .from("client_roles")
    .select("id, name")
    .eq("workspace_user_id", workspaceId);
  return new Map((roles || []).map((role) => [role.id, role.name]));
}

async function validateWorkspaceRole(workspaceId, roleId) {
  if (roleId == null) return null;
  if (typeof roleId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(roleId)) {
    throw new ApiError(400, "Invalid roleId");
  }
  const { data: role, error } = await supabaseAdmin
    .from("client_roles")
    .select("id")
    .eq("id", roleId)
    .eq("workspace_user_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!role) throw new ApiError(404, "Custom role not found");
  return roleId;
}

async function mapMember(row, authUser, roleNames) {
  return {
    id: row.id,
    workspaceUserId: row.workspace_user_id,
    memberUserId: row.member_user_id,
    email: authUser?.email || "",
    role: row.role,
    status: row.status,
    permissions: row.permissions || null,
    customRoleId: row.custom_role_id || null,
    customRoleName: row.custom_role_id ? roleNames?.get(row.custom_role_id) || null : null,
    isActive: !authUser?.banned_until && row.status === "active",
    createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  try {
    const admin = await requireAdmin(req);

    const id = req.query.id;
    if (!id) throw new ApiError(400, "Missing client id");

    if (req.method === "GET") {
      const { data: members, error } = await supabaseAdmin
        .from("client_members")
        .select("*")
        .eq("workspace_user_id", id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[members GET] client_members query failed:", JSON.stringify(error));
        throw error;
      }

      const userMap = await getAuthUserMap((members || []).map((member) => member.member_user_id));
      const roleNames = await getWorkspaceRoleNames(id);
      return sendJson(res, 200, {
        members: (members || []).map((member) => mapMember(member, userMap.get(member.member_user_id), roleNames)),
      });
    }

    if (req.method === "POST") {
      const body = readJsonBody(req);
      const email = (body && body.email ? String(body.email).trim() : "");
      const role = (body && body.role ? String(body.role).trim() : "");
      const tempPassword = (body && body.password ? String(body.password).trim() : "");
      const roleId = await validateWorkspaceRole(id, body?.roleId ?? null);

      if (!email) throw new ApiError(400, "Email is required");
      if (!STAFF_ROLES.has(role)) throw new ApiError(400, "Role must be manager or officer");

      const { data: existingMembership } = await supabaseAdmin
        .from("client_members")
        .select("id")
        .eq("workspace_user_id", id)
        .eq("member_user_id", id)
        .maybeSingle();

      if (!existingMembership) {
        await supabaseAdmin.from("client_members").upsert(
          {
            workspace_user_id: id,
            member_user_id: id,
            role: "owner",
            status: "active",
            permissions: null,
          },
          { onConflict: "workspace_user_id,member_user_id" },
        );
      }

      const createUserPayload = {
        email,
        email_confirm: !tempPassword,
        user_metadata: { workspace_user_id: id, workspace_role: role },
      };

      if (tempPassword) {
        createUserPayload.password = tempPassword;
        createUserPayload.email_confirm = true;
      }

      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser(createUserPayload);
      if (authErr) {
        console.error("[members POST] createUser failed:", JSON.stringify(authErr));
        throw authErr;
      }

      const memberUserId = authData.user.id;

      const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
        id: memberUserId,
        role: "client",
        admin_notes: "Staff for client " + id,
      });
      if (profileErr) {
        console.error("[members POST] profile insert failed:", JSON.stringify(profileErr));
        throw profileErr;
      }

      const { data: member, error: memberErr } = await supabaseAdmin
        .from("client_members")
        .insert({
          workspace_user_id: id,
          member_user_id: memberUserId,
          role,
          status: "active",
          permissions: ROLE_PERMISSION_DEFAULTS[role],
          custom_role_id: roleId,
        })
        .select("*")
        .single();
      if (memberErr) {
        console.error("[members POST] member insert failed:", JSON.stringify(memberErr));
        throw memberErr;
      }

      if (!tempPassword) {
        try {
          await supabaseAdmin.auth.admin.generateLink({ type: "invite", email });
        } catch (error) {
          console.warn("[members POST] Invite link generation failed", error);
        }
      }

      const roleNames = await getWorkspaceRoleNames(id);
      await writePermissionAudit(supabaseAdmin, {
        workspaceUserId: id,
        actorUserId: admin.id,
        targetMemberId: member.id,
        action: "member.added",
        after: { email, role, custom_role_id: roleId },
      });

      return sendJson(res, 200, {
        member: await mapMember(member, authData.user, roleNames),
        ...(tempPassword ? { tempPassword } : {}),
      });
    }

    if (req.method === "PATCH") {
      const body = readJsonBody(req);
      const memberId = body.memberId;
      if (!memberId) throw new ApiError(400, "Missing memberId");

      if (body.action === "reset-password") {
        const newPassword = body.password;
        if (!newPassword || newPassword.length < 6) throw new ApiError(400, "Password must be at least 6 characters");

        const { data: memberRow, error: fetchErr } = await supabaseAdmin
          .from("client_members")
          .select("member_user_id")
          .eq("id", memberId)
          .eq("workspace_user_id", id)
          .single();
        if (fetchErr || !memberRow) throw new ApiError(404, "Member not found");

        const { error: passwordErr } = await supabaseAdmin.auth.admin.updateUserById(memberRow.member_user_id, {
          password: newPassword,
        });
        if (passwordErr) throw passwordErr;

        try {
          await supabaseAdmin.from("client_members")
            .update({ password_changed: false })
            .eq("id", memberId);
        } catch (e) {
          console.warn("[members reset-password] failed to set password_changed:", e);
        }

        return sendJson(res, 200, { success: true });
      }

      const patch = {};

      if (body.role !== undefined) {
        if (!STAFF_ROLES.has(body.role)) throw new ApiError(400, "Role must be manager or officer");
        patch.role = body.role;
      }
      if (body.status !== undefined) {
        if (!STATUSES.has(body.status)) throw new ApiError(400, "Invalid status");
        patch.status = body.status;
      }
      if (body.permissions !== undefined) {
        patch.permissions = normalizePermissions(body.permissions, { allowLegacy: true }) || {};
      }
      if (body.roleId !== undefined) {
        patch.custom_role_id = await validateWorkspaceRole(id, body.roleId);
      }
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Nothing to update");

      const { data: existing, error: existingErr } = await supabaseAdmin
        .from("client_members")
        .select("*")
        .eq("id", memberId)
        .eq("workspace_user_id", id)
        .single();
      if (existingErr) throw existingErr;
      if (!existing) throw new ApiError(404, "Member not found");

      if (existing.member_user_id === id && (patch.role || patch.status || patch.permissions !== undefined || patch.custom_role_id !== undefined)) {
        throw new ApiError(400, "Workspace owner row cannot be modified");
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("client_members")
        .update(patch)
        .eq("id", memberId)
        .eq("workspace_user_id", id)
        .select("*")
        .single();
      if (updateErr) throw updateErr;

      if (patch.status) {
        await supabaseAdmin.auth.admin.updateUserById(updated.member_user_id, {
          ban_duration: patch.status === "disabled" ? "876000h" : "none",
        });
      }

      const action = patch.role && patch.role !== existing.role
        ? "role.change"
        : patch.status && patch.status !== existing.status
          ? "status.update"
          : patch.custom_role_id !== undefined && patch.custom_role_id !== existing.custom_role_id
            ? "role.change"
            : "permissions.update";
      await writePermissionAudit(supabaseAdmin, {
        workspaceUserId: id,
        actorUserId: admin.id,
        targetMemberId: memberId,
        action,
        before: {
          role: existing.role,
          status: existing.status,
          permissions: existing.permissions,
          custom_role_id: existing.custom_role_id,
        },
        after: {
          role: updated.role,
          status: updated.status,
          permissions: updated.permissions,
          custom_role_id: updated.custom_role_id,
        },
      });

      const roleNames = await getWorkspaceRoleNames(id);
      return sendJson(res, 200, { member: await mapMember(updated, null, roleNames) });
    }

    if (req.method === "DELETE") {
      const body = readJsonBody(req);
      const memberId = body.memberId;
      if (!memberId) throw new ApiError(400, "Missing memberId");

      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from("client_members")
        .select("member_user_id, role")
        .eq("id", memberId)
        .eq("workspace_user_id", id)
        .single();
      if (fetchErr || !existing) throw new ApiError(404, "Member not found");
      if (existing.role === "owner") throw new ApiError(400, "Cannot delete workspace owner");

      await supabaseAdmin.from("client_members").delete().eq("id", memberId);
      await supabaseAdmin.from("profiles").delete().eq("id", existing.member_user_id);
      await supabaseAdmin.auth.admin.deleteUser(existing.member_user_id);

      await writePermissionAudit(supabaseAdmin, {
        workspaceUserId: id,
        actorUserId: admin.id,
        targetMemberId: memberId,
        action: "member.removed",
        before: { role: existing.role },
      });

      return sendJson(res, 200, { success: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("[members] Unhandled error:", error);
    return sendError(res, error);
  }
}
