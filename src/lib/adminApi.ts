import { apiFetch } from "./api";
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

export async function resetAdminClientWorkspace(id: string) {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-workspace" }),
  });
}

export async function resetAllClientData(id: string) {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-all" }),
  });
}

export async function resetClientDocuments(id: string) {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset-documents" }),
  });
}

export async function deleteAdminClient(id: string) {
  return apiFetch(`/api/admin/clients/${id}`, {
    method: "DELETE",
  });
}

export async function listAdminClientMembers(clientId: string): Promise<AdminClientMember[]> {
  const result = await apiFetch<{ members: AdminClientMember[] }>(`/api/admin/clients/${clientId}/members`);
  return result.members;
}

export async function listAdminClientRoles(clientId: string): Promise<WorkspaceCustomRole[]> {
  const result = await apiFetch<{ roles: WorkspaceCustomRole[] }>(`/api/admin/clients/${clientId}/roles`);
  return result.roles;
}

export async function createAdminClientRole(clientId: string, payload: { name: string; permissions?: Partial<WorkspacePermissions> }) {
  return apiFetch<{ role: WorkspaceCustomRole }>(`/api/admin/clients/${clientId}/roles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminClientRole(clientId: string, roleId: string, payload: {
  name?: string;
  permissions?: Partial<WorkspacePermissions> | null;
}) {
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
  const result = await apiFetch<{ entries: AdminAuditEntry[] }>(`/api/admin/clients/${clientId}/audit`);
  return result.entries;
}

export async function createAdminClientMember(clientId: string, payload: {
  email: string;
  role: "manager" | "officer";
  password?: string;
  roleId?: string | null;
}): Promise<{ member: AdminClientMember; tempPassword?: string }> {
  return apiFetch(`/api/admin/clients/${clientId}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminClientMember(clientId: string, memberId: string, payload: {
  role?: "manager" | "officer";
  status?: "active" | "disabled";
  permissions?: Partial<WorkspacePermissions> | null;
  roleId?: string | null;
}) {
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
