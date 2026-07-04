import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

const STAFF_ROLES = new Set(["manager", "officer"]);

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

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("[members] Unhandled error:", error);
    return sendError(res, error);
  }
}
