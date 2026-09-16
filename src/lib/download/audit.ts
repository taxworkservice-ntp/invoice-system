import { supabase } from "../supabase";

export type DownloadAuditStatus = "success" | "partial" | "failed";

export interface DownloadAuditInput {
  /** Workspace owner id (the `user_id` used by every business table). */
  workspaceUserId: string;
  /** The profile that triggered the export (falls back to the workspace id). */
  actorUserId?: string;
  /** e.g. "documents", "report_financial", "backup". */
  kind: string;
  /** e.g. "pdf_zip", "xlsx", "csv". */
  format: string;
  params?: Record<string, unknown>;
  fileCount?: number;
  status?: DownloadAuditStatus;
  error?: string;
}

/**
 * Record a download/export in `download_audit` for the history surface.
 * Best-effort: an audit failure must never block the user's download.
 */
export async function logDownload(input: DownloadAuditInput): Promise<void> {
  try {
    const { error } = await supabase.from("download_audit").insert({
      user_id: input.workspaceUserId,
      actor_user_id: input.actorUserId ?? input.workspaceUserId,
      kind: input.kind,
      format: input.format,
      params: input.params ?? {},
      file_count: input.fileCount ?? 0,
      status: input.status ?? "success",
      error: input.error ?? null,
    });
    if (error) console.warn("[download-audit] insert failed", error.message);
  } catch (error) {
    console.warn("[download-audit] insert threw", error);
  }
}
