import { apiFetch } from "./api";
import { supabase } from "./supabase";
import type { AdminNumberingDraft } from "./numberingDiff";
import type { DocNumberSequence, DocumentType } from "../types";

export type DocNumberPreviews = Partial<Record<DocumentType, string | null>>;

/**
 * Reads a client's numbering rows. Admin RLS is scoped to workspace members,
 * so the platform admin goes through the service-role endpoint instead.
 */
export async function fetchAdminClientNumbering(clientId: string): Promise<DocNumberSequence[]> {
  const result = await apiFetch<{ numbering?: DocNumberSequence[] }>(
    `/api/admin/clients/${clientId}`,
  );
  return result.numbering ?? [];
}

/**
 * Writes format/padding/reset for every type in one transaction. The RPC is
 * `is_admin()`-gated, so it must run with the admin's own JWT (not the
 * service role).
 */
export async function saveAdminDocNumberFormat(
  clientId: string,
  rows: AdminNumberingDraft[],
  reason: string,
): Promise<DocNumberSequence[]> {
  const { data, error } = await supabase.rpc("admin_save_doc_number_format", {
    p_workspace_user_id: clientId,
    p_rows: rows,
    p_reason: reason,
  });
  if (error) throw error;
  return (data ?? []) as DocNumberSequence[];
}

/** Read-only next-number preview for the draft formats (no sequence bump). */
export async function previewAdminDocNumbers(
  clientId: string,
  drafts: AdminNumberingDraft[],
): Promise<DocNumberPreviews> {
  const entries = await Promise.all(
    drafts.map(async (draft) => {
      const { data, error } = await supabase.rpc("preview_doc_number", {
        p_workspace_user_id: clientId,
        p_doc_type: draft.doc_type,
        p_format_preset: draft.format_preset,
        p_seq_padding: draft.seq_padding,
        p_reset_period: draft.reset_period,
      });
      if (error) throw error;
      return [draft.doc_type, (data as string | null) ?? null] as const;
    }),
  );

  return Object.fromEntries(entries) as DocNumberPreviews;
}
