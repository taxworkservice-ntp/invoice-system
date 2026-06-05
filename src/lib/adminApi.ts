import { apiFetch } from "./api";

export interface AdminAuthUserSummary {
  id: string;
  email: string;
  isActive: boolean;
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
}): Promise<{ userId: string; email: string }> {
  return apiFetch("/api/admin/clients/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminClientPassword(id: string, password: string) {
  return apiFetch(`/api/admin/clients/${id}/password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function updateAdminClientStatus(id: string, active: boolean) {
  return apiFetch(`/api/admin/clients/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ active }),
  });
}

export async function resetAdminClientWorkspace(id: string) {
  return apiFetch(`/api/admin/clients/${id}/reset-workspace`, {
    method: "POST",
  });
}

export async function deleteAdminClient(id: string) {
  return apiFetch(`/api/admin/clients/${id}/delete`, {
    method: "DELETE",
  });
}
