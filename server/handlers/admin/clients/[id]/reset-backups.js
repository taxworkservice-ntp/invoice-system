import { requireAdmin } from "../../../_lib/auth.js";
import { ApiError, sendError, sendJson } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";

/**
 * Admin reset-backup endpoint.
 *
 *   GET /api/admin/clients/:id/reset-backups
 *       → list backup metadata (no payload) newest first.
 *   GET /api/admin/clients/:id/reset-backups?backupId=...
 *       → download one backup as a JSON attachment and stamp downloaded_at.
 *
 * The backups are written by admin_reset_client_documents; this endpoint is the
 * only read path (service role, requireAdmin).
 */
export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    const id = req.query.id;
    if (!id) throw new ApiError(400, "Missing client id");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

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

    const { data, error } = await supabaseAdmin
      .from("admin_reset_backups")
      .select("id, action, reason, summary, payload, created_at")
      .eq("workspace_user_id", id)
      .eq("id", backupId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Backup not found");

    await supabaseAdmin
      .from("admin_reset_backups")
      .update({ downloaded_at: new Date().toISOString() })
      .eq("id", backupId)
      .eq("workspace_user_id", id);

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
    res.send(JSON.stringify(file, null, 2));
  } catch (error) {
    console.error("[admin reset-backups] Unhandled error:", error);
    return sendError(res, error);
  }
}
