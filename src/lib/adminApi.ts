import { apiFetch, apiFetchBlob } from "./api";
import type { MonitorActivity, MonitorDealLike } from "./monitoring";
import type { WorkspaceCustomRole, WorkspacePermissions } from "./permissions";

export interface AdminAuthUserSummary {
  id: string;
  email: string;
  isActive: boolean;
}

export interface AdminClientMember {
  id: string;
  workspaceUserId: string;
  memberUserId: string;
  email: string;
  role: "owner" | "manager" | "officer";
  status: "active" | "disabled";
  permissions: Partial<WorkspacePermissions> | null;
  customRoleId: string | null;
  customRoleName: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function listAdminClientUsers(): Promise<AdminAuthUserSummary[]> {
  const result = await apiFetch<{ users: AdminAuthUserSummary[] }>("/api/admin/clients");
  return result.users;
}

export async function getAdminClientUser(id: string): Promise<AdminAuthUserSummary> {
  const result = await apiFetch<{ user: AdminAuthUserSummary }>(`/api/admin/clients/${id}`);
  return result.user;
}

export async function createAdminClient(payload: {
  email: string;
  companyName: string;
  adminNote: string;
  password?: string;
}): Promise<{ userId: string; email: string; tempPassword?: string }> {
  return apiFetch("/api/admin/clients/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminClientPassword(id: string, password: string) {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "password", password }),
  });
}

export async function updateAdminClientStatus(id: string, active: boolean) {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "status", active }),
  });
}

export interface DestructiveConfirm {
  reason: string;
  confirmName: string;
}

export interface ResetWorkspaceSummary {
  deals_archived: number;
  customers_archived: number;
  items_archived: number;
  numbering_reset: string[];
  reason?: string | null;
}

export interface ResetWorkspacePreview {
  active_deals: number;
  active_customers: number;
  active_items: number;
  doc_sequences: number;
  deal_sequences: number;
}

export interface ResetAllPreview {
  documents: number;
  document_line_items: number;
  deals: number;
  stock_movements: number;
  wht_records: number;
  files: number;
  customers: number;
  items: number;
}

export async function previewResetWorkspace(
  id: string,
): Promise<{ success: boolean; preview: ResetWorkspacePreview }> {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-workspace-preview" }),
  });
}

export async function resetAdminClientWorkspace(
  id: string,
  confirm: DestructiveConfirm,
): Promise<{ success: boolean; summary: ResetWorkspaceSummary }> {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-workspace", ...confirm }),
  });
}

export async function previewResetAll(
  id: string,
): Promise<{ success: boolean; preview: ResetAllPreview }> {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-all-preview" }),
  });
}

export async function resetAllClientData(
  id: string,
  confirm: DestructiveConfirm,
): Promise<{ success: boolean; summary: ResetDocumentsSummary & { reason?: string | null } }> {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-all", ...confirm }),
  });
}

export interface ResetDocumentsSummary {
  documents_deleted: number;
  deals_deleted: number;
  line_items_deleted: number;
  stock_movements_deleted: number;
  wht_records_deleted: number;
  files_deleted?: number;
  items_stock_restored: number;
  doc_sequences_reset: number;
  deal_sequences_reset: number;
  r2_keys: string[];
  backup_id?: string;
  reason?: string | null;
}

export interface ResetDocumentItemPreview {
  id: string;
  name: string;
  stock_before: number;
  stock_after: number;
  avg_cost: number;
}

export interface ResetDocumentsPreview {
  documents: number;
  document_line_items: number;
  deals: number;
  stock_movements: number;
  wht_records: number;
  files: number;
  items: ResetDocumentItemPreview[];
  items_affected: number;
  customers_preserved: number;
  items_preserved: number;
}

export interface AdminResetBackup {
  id: string;
  action: string;
  reason: string | null;
  summary: ResetDocumentsSummary | null;
  created_at: string;
  downloaded_at: string | null;
}

export async function previewClientDocumentReset(
  id: string,
): Promise<{ success: boolean; preview: ResetDocumentsPreview }> {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-documents-preview" }),
  });
}

export async function resetClientDocuments(
  id: string,
  reason?: string,
): Promise<{ success: boolean; summary: ResetDocumentsSummary }> {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-documents", reason }),
  });
}

export async function listAdminResetBackups(id: string): Promise<AdminResetBackup[]> {
  const result = await apiFetch<{ backups: AdminResetBackup[] }>(
    `/api/admin/clients/${id}/reset-backups`,
  );
  return result.backups;
}

export async function fetchAdminResetBackupBlob(id: string, backupId: string): Promise<Blob> {
  return apiFetchBlob(
    `/api/admin/clients/${id}/reset-backups?backupId=${encodeURIComponent(backupId)}`,
  );
}

export interface RestoreTableReport {
  table: string;
  payload: number;
  current: number;
}

export interface RestoreDryRun {
  dry_run: boolean;
  backup_id: string;
  action: string;
  backup_created_at: string;
  reason: string | null;
  tables: RestoreTableReport[];
  newer_data_warning: boolean;
  files_without_bytes: number;
  skipped: string[];
}

export async function restoreAdminBackup(
  id: string,
  payload: { backupId: string; dryRun?: boolean; acknowledgeDataLoss?: boolean },
): Promise<{ success: boolean; restore: RestoreDryRun & Record<string, unknown> }> {
  return apiFetch(`/api/admin/clients/${id}/reset-backups`, {
    method: "POST",
    body: JSON.stringify({ dryRun: true, acknowledgeDataLoss: false, ...payload }),
  });
}

export async function deleteAdminClient(id: string, confirm: DestructiveConfirm) {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "DELETE",
    body: JSON.stringify(confirm),
  });
}

export async function listAdminClientActivities(
  clientId: string,
  limit = 100,
): Promise<{ activities: MonitorActivity[]; deals: MonitorDealLike[] }> {
  const result = await apiFetch<{ activities: MonitorActivity[]; deals: MonitorDealLike[] }>(
    `/api/admin/clients/${clientId}/activities?limit=${limit}`,
  );
  return { activities: result.activities || [], deals: result.deals || [] };
}

export async function listAdminClientMembers(clientId: string): Promise<AdminClientMember[]> {
  const result = await apiFetch<{ members: AdminClientMember[] }>(
    `/api/admin/clients/${clientId}/members`,
  );
  return result.members;
}

export async function listAdminClientRoles(clientId: string): Promise<WorkspaceCustomRole[]> {
  const result = await apiFetch<{ roles: WorkspaceCustomRole[] }>(
    `/api/admin/clients/${clientId}/roles`,
  );
  return result.roles;
}

export async function createAdminClientRole(
  clientId: string,
  payload: { name: string; permissions?: Partial<WorkspacePermissions> },
) {
  return apiFetch<{ role: WorkspaceCustomRole }>(`/api/admin/clients/${clientId}/roles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminClientRole(
  clientId: string,
  roleId: string,
  payload: {
    name?: string;
    permissions?: Partial<WorkspacePermissions> | null;
  },
) {
  return apiFetch<{ role: WorkspaceCustomRole }>(`/api/admin/clients/${clientId}/roles`, {
    method: "PATCH",
    body: JSON.stringify({ roleId, ...payload }),
  });
}

export async function deleteAdminClientRole(clientId: string, roleId: string) {
  return apiFetch(`/api/admin/clients/${clientId}/roles`, {
    method: "DELETE",
    body: JSON.stringify({ roleId }),
  });
}

export interface AdminAuditEntry {
  id: string;
  actor_user_id: string;
  target_member_id: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  actor_email: string;
  target_email: string;
}

export async function listAdminClientAudit(clientId: string): Promise<AdminAuditEntry[]> {
  const result = await apiFetch<{ entries: AdminAuditEntry[] }>(
    `/api/admin/clients/${clientId}/audit`,
  );
  return result.entries;
}

export async function createAdminClientMember(
  clientId: string,
  payload: {
    email: string;
    role: "manager" | "officer";
    password?: string;
    roleId?: string | null;
  },
): Promise<{ member: AdminClientMember; tempPassword?: string }> {
  return apiFetch(`/api/admin/clients/${clientId}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminClientMember(
  clientId: string,
  memberId: string,
  payload: {
    role?: "manager" | "officer";
    status?: "active" | "disabled";
    permissions?: Partial<WorkspacePermissions> | null;
    roleId?: string | null;
  },
) {
  return apiFetch(`/api/admin/clients/${clientId}/members`, {
    method: "PATCH",
    body: JSON.stringify({ memberId, ...payload }),
  });
}

export async function resetMemberPassword(clientId: string, memberId: string, password: string) {
  return apiFetch(`/api/admin/clients/${clientId}/members`, {
    method: "PATCH",
    body: JSON.stringify({ memberId, action: "reset-password", password }),
  });
}

export async function deleteAdminClientMember(clientId: string, memberId: string) {
  return apiFetch(`/api/admin/clients/${clientId}/members`, {
    method: "DELETE",
    body: JSON.stringify({ memberId }),
  });
}
