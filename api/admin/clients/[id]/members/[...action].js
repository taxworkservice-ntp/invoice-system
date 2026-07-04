import { requireAdmin } from "../../../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../../../_lib/http.js";
import { supabaseAdmin } from "../../../../_lib/supabase.js";

const ROLES = new Set(["owner", "manager", "officer"]);
const STATUSES = new Set(["active", "disabled"]);
const PERMISSION_KEYS = new Set([
  "canManageSettings",
  "canManageTeam",
  "canViewReports",
  "canManageCatalog",
  "canManageCustomers",
  "canCreateEditDocuments",
  "canSendDocuments",
  "canRecordPayments",
  "canVoidDocuments",
  "canDeleteDocuments",
]);

function normalizePermissions(input) {
  if (input == null) return null;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "Invalid permissions");
  }
  const normalized = {};
  for (const [key, value] of Object.entries(input)) {
    if (!PERMISSION_KEYS.has(key)) continue;
    if (typeof value !== "boolean") throw new ApiError(400, "Invalid permission value");
    normalized[key] = value;
  }
  normalized.canManageTeam = false;
  return normalized;
}

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    const method = (req.method || "").toUpperCase();
    if (method !== "PATCH") {
      res.setHeader("Allow", "PATCH");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const workspaceId = req.query.id;
    const memberId = (req.query.action || [])[0];
    if (!workspaceId || !memberId) throw new ApiError(400, "Missing id or memberId");

    const body = readJsonBody(req);
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

    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, "Nothing to update");
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("client_members")
      .select("*")
      .eq("id", memberId)
      .eq("workspace_user_id", workspaceId)
      .single();
    if (existingErr) {
      console.error("[members/action PATCH] fetch failed:", JSON.stringify(existingErr));
      throw existingErr;
    }
    if (!existing) throw new ApiError(404, "Member not found");

    if (existing.member_user_id === workspaceId && (patch.role && patch.role !== "owner")) {
      throw new ApiError(400, "Workspace owner must keep owner role");
    }
    if (existing.member_user_id === workspaceId && patch.status === "disabled") {
      throw new ApiError(400, "Workspace owner cannot be disabled");
    }
    if (existing.member_user_id === workspaceId && patch.permissions !== undefined) {
      throw new ApiError(400, "Workspace owner permissions cannot be customized");
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("client_members")
      .update(patch)
      .eq("id", memberId)
      .eq("workspace_user_id", workspaceId)
      .select("*")
      .single();
    if (updateErr) {
      console.error("[members/action PATCH] update failed:", JSON.stringify(updateErr));
      throw updateErr;
    }

    if (patch.status) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(updated.member_user_id, {
          ban_duration: patch.status === "disabled" ? "876000h" : "none",
        });
      } catch (banErr) {
        console.error("[members/action PATCH] ban failed:", JSON.stringify(banErr));
        throw banErr;
      }
    }

    return sendJson(res, 200, { member: updated });
  } catch (error) {
    console.error("[members/action] Unhandled error:", error);
    return sendError(res, error);
  }
}
