import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, readJsonBody, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

/**
 * Admin reset-backup endpoint.
 *
 *   GET  /api/admin/clients/:id/reset-backups
 *        → list backup metadata (no payload) newest first.
 *   GET  /api/admin/clients/:id/reset-backups?backupId=...
 *        → download one backup as a JSON attachment, stamp downloaded_at,
 *          and write a backup.downloaded audit row (fail-closed: if the
 *          audit insert fails, no bytes are served).
 *   POST /api/admin/clients/:id/reset-backups
 *        { backupId, dryRun = true, acknowledgeDataLoss = false }
 *        → dry-run returns the restore reconciliation report without
 *          touching data; execute mode runs admin_restore_backup (which
 *          audits backup.restored itself) and prunes old backups.
 *
 * Backup rows survive workspace deletes (no FK), so a deleted client's
 * backups stay reachable here: the target check accepts a workspace that
 * has backups even when its profile row is gone. Admin targets are still
 * rejected. (Service role, requireAdmin.)
 */
async function requireClientOrBackupTarget(id) {
  const { data, error } = await supabaseAdmin.from("profiles").select("role").eq("id", id).single();
  if (!error && data) {
    if (data.role !== "client") throw new ApiError(400, "Action applies to client workspaces only");
    return;
  }
  const { data: backups, error: backupError } = await supabaseAdmin
    .from("admin_reset_backups")
    .select("id")
    .eq("workspace_user_id", id)
    .limit(1);
  if (backupError) throw backupError;
  if (!backups || backups.length === 0) throw new ApiError(404, "Client not found");
}

async function handleDownloadBackup(id, backupId, actorId) {
  const { data, error } = await supabaseAdmin
    .from("admin_reset_backups")
    .select("id, action, reason, summary, payload, created_at")
    .eq("workspace_user_id", id)
    .eq("id", backupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Backup not found");

  // Audit the exfiltration BEFORE serving bytes — fail-closed.
  const { error: auditError } = await supabaseAdmin.from("client_permission_audit").insert({
    workspace_user_id: id,
    actor_user_id: actorId,
    target_member_id: null,
    action: "backup.downloaded",
    before: null,
    after: { backup_id: backupId, action: data.action },
  });
  if (auditError) throw auditError;

  await supabaseAdmin
    .from("admin_reset_backups")
    .update({ downloaded_at: new Date().toISOString() })
    .eq("id", backupId)
    .eq("workspace_user_id", id);

  return data;
}

async function handleRestoreBackup(id, actorId, body) {
  const backupId = typeof body?.backupId === "string" ? body.backupId.trim() : "";
  if (!backupId) throw new ApiError(400, "backupId is required");
  const dryRun = body?.dryRun !== false;
  const acknowledgeDataLoss = body?.acknowledgeDataLoss === true;

  const { data, error } = await supabaseAdmin.rpc("admin_restore_backup", {
    p_backup_id: backupId,
    p_actor_user_id: actorId,
    p_dry_run: dryRun,
    p_acknowledge_data_loss: acknowledgeDataLoss,
  });
  if (error) {
    if (error.code === "42501") throw new ApiError(403, "Admin access required");
    throw error;
  }

  if (!dryRun) {
    // Retention: keep newest 20 per workspace. Best-effort — a prune
    // failure must never fail a completed restore.
    await supabaseAdmin
      .rpc("admin_prune_reset_backups", { p_workspace_user_id: id, p_keep: 20 })
      .then(
        () => {},
        (pruneError) =>
          console.warn("[admin restore] prune failed:", pruneError?.message || pruneError),
      );
  }

  return { success: true, restore: data };
}

export default async function handler(req, res) {
  try {
    const { user } = await requireAdmin(req);
    const actorId = user.id;

    const id = req.query.id;
    if (!id) throw new ApiError(400, "Missing client id");

    await requireClientOrBackupTarget(id);

    if (req.method === "GET") {
      const backupId = req.query.backupId;

      if (!backupId) {
        const { data, error } = await supabaseAdmin
          .from("admin_reset_backups")
          .select("id, action, reason, summary, created_at, downloaded_at")
          .eq("workspace_user_id", id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return sendJson(res, 200, { backups: data || [] });
      }

      const data = await handleDownloadBackup(id, backupId, actorId);
      const file = {
        backup: {
          id: data.id,
          action: data.action,
          reason: data.reason,
          summary: data.summary,
          created_at: data.created_at,
        },
        payload: data.payload,
      };
      const filename = `reset-backup-${data.id}.json`;

      res.status(200);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(file, null, 2));
    }

    if (req.method === "POST") {
      const body = readJsonBody(req);
      return sendJson(res, 200, await handleRestoreBackup(id, actorId, body));
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("[admin reset-backups] Unhandled error:", error);
    return sendError(res, error);
  }
}
