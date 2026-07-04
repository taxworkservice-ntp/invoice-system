import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

const STAFF_ROLES = new Set(["manager", "officer"]);

const ROLES = new Set(["owner", "manager", "officer"]);
const STATUSES = new Set(["active", "disabled"]);
const PERMISSION_KEYS = new Set([
  "canManageSettings", "canManageTeam", "canViewReports", "canManageCatalog",
  "canManageCustomers", "canCreateEditDocuments", "canSendDocuments",
  "canRecordPayments", "canVoidDocuments", "canDeleteDocuments",
]);

function normalizePermissions(input) {
  if (input == null) return null;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "Invalid permissions");
  }
  var normalized = {};
  for (var key in input) {
    if (!PERMISSION_KEYS.has(key)) continue;
    if (typeof input[key] !== "boolean") throw new ApiError(400, "Invalid permission value");
    normalized[key] = input[key];
  }
  normalized.canManageTeam = false;
  return normalized;
}

const ROLE_PERMISSION_DEFAULTS = {
  owner: null,
  manager: {
    canManageSettings: false,
    canManageTeam: false,
    canViewReports: true,
    canManageCatalog: true,
    canManageCustomers: true,
    canCreateEditDocuments: true,
    canSendDocuments: true,
    canRecordPayments: true,
    canVoidDocuments: true,
    canDeleteDocuments: false,
  },
  officer: {
    canManageSettings: false,
    canManageTeam: false,
    canViewReports: false,
    canManageCatalog: false,
    canManageCustomers: true,
    canCreateEditDocuments: true,
    canSendDocuments: false,
    canRecordPayments: false,
    canVoidDocuments: false,
    canDeleteDocuments: false,
  },
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

function mapMember(row, authUser) {
  return {
    id: row.id,
    workspaceUserId: row.workspace_user_id,
    memberUserId: row.member_user_id,
    email: authUser?.email || "",
    role: row.role,
    status: row.status,
    permissions: row.permissions || ROLE_PERMISSION_DEFAULTS[row.role] || null,
    isActive: !authUser?.banned_until && row.status === "active",
    createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

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
      return sendJson(res, 200, {
        members: (members || []).map((member) => mapMember(member, userMap.get(member.member_user_id))),
      });
    }

    if (req.method === "POST") {
      const body = readJsonBody(req);
      const email = (body && body.email ? String(body.email).trim() : "");
      const role = (body && body.role ? String(body.role).trim() : "");
      const tempPassword = (body && body.password ? String(body.password).trim() : "");

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

      return sendJson(res, 200, {
        member: mapMember(member, authData.user),
        ...(tempPassword ? { tempPassword } : {}),
      });
    }

    if (req.method === "PATCH") {
      const body = readJsonBody(req);
      const memberId = body.memberId;
      if (!memberId) throw new ApiError(400, "Missing memberId");

      const patch = {};

      if (body.role !== undefined) {
        if (!ROLES.has(body.role)) throw new ApiError(400, "Invalid role");
        patch.role = body.role;
      }
      if (body.status !== undefined) {
        if (!STATUSES.has(body.status)) throw new ApiError(400, "Invalid status");
        patch.status = body.status;
      }
      if (body.permissions !== undefined) {
        patch.permissions = normalizePermissions(body.permissions);
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

      if (existing.member_user_id === id && patch.role && patch.role !== "owner") {
        throw new ApiError(400, "Workspace owner must keep owner role");
      }
      if (existing.member_user_id === id && patch.status === "disabled") {
        throw new ApiError(400, "Workspace owner cannot be disabled");
      }
      if (existing.member_user_id === id && patch.permissions !== undefined) {
        throw new ApiError(400, "Workspace owner permissions cannot be customized");
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

      return sendJson(res, 200, { member: updated });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("[members] Unhandled error:", error);
    return sendError(res, error);
  }
}
