import { ApiError } from "./http.js";

const ALL_PERMISSION_KEYS = new Set([
  "canManageSettings",
  "canViewReports",
  "canExportReports",
  "canViewCustomers",
  "canManageCustomers",
  "canViewCatalog",
  "canManageCatalog",
  "canCreateEditDocuments",
  "canManageWht",
  "canSendDocuments",
  "canSendQuotations",
  "canSendDeliveryNotes",
  "canSendFinancialDocuments",
  "canRecordPayments",
  "canVoidDocuments",
  "canDeleteDocuments",
]);

export const EDITABLE_PERMISSION_KEYS = new Set([...ALL_PERMISSION_KEYS].filter((key) => key !== "canSendDocuments"));

const LEGACY_PERMISSION_ALIASES = {
  canManageCustomers: ["canViewCustomers"],
  canManageCatalog: ["canViewCatalog"],
  canViewReports: ["canExportReports"],
};

export function normalizePermissions(input, { allowLegacy = false } = {}) {
  if (input == null) return null;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "Invalid permissions");
  }
  const allowed = allowLegacy ? ALL_PERMISSION_KEYS : EDITABLE_PERMISSION_KEYS;
  const normalized = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (typeof value !== "boolean") throw new ApiError(400, "Invalid permission value");
    normalized[key] = value;
  }
  if (allowLegacy) {
    for (const [legacyKey, targets] of Object.entries(LEGACY_PERMISSION_ALIASES)) {
      if (input[legacyKey] === true) {
        for (const target of targets) normalized[target] = true;
      }
    }
  }
  return normalized;
}

export async function writePermissionAudit(
  supabaseAdmin,
  { workspaceUserId, actorUserId, targetMemberId = null, action, before = null, after = null },
) {
  const { error } = await supabaseAdmin.from("client_permission_audit").insert({
    workspace_user_id: workspaceUserId,
    actor_user_id: actorUserId,
    target_member_id: targetMemberId,
    action,
    before,
    after,
  });
  if (error) console.warn("[permission audit] insert failed:", error.message);
}
