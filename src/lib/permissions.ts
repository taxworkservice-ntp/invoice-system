import type { ClientMemberRole } from "../types";

export type WorkspacePermissionKey =
  | "canManageSettings"
  | "canManageTeam"
  | "canViewReports"
  | "canManageCatalog"
  | "canManageCustomers"
  | "canCreateEditDocuments"
  | "canSendDocuments"
  | "canRecordPayments"
  | "canVoidDocuments"
  | "canDeleteDocuments";

export interface WorkspacePermissions {
  canManageSettings: boolean;
  canManageTeam: boolean;
  canViewReports: boolean;
  canManageCatalog: boolean;
  canManageCustomers: boolean;
  canCreateEditDocuments: boolean;
  canSendDocuments: boolean;
  canRecordPayments: boolean;
  canVoidDocuments: boolean;
  canDeleteDocuments: boolean;
}

export const PERMISSION_GROUPS: { key: WorkspacePermissionKey; label: string; description: string }[] = [
  {
    key: "canCreateEditDocuments",
    label: "Create/edit drafts",
    description: "Prepare quotations, invoices, delivery notes, and other draft documents.",
  },
  {
    key: "canSendDocuments",
    label: "Send/finalize documents",
    description: "Mark documents as sent, issue credit notes, convert quotations, and create invoices from delivery notes.",
  },
  {
    key: "canRecordPayments",
    label: "Record payments",
    description: "Mark invoices or billing notes as paid and generate receipts.",
  },
  {
    key: "canVoidDocuments",
    label: "Void documents",
    description: "Cancel sent/issued documents and optionally create replacement drafts.",
  },
  {
    key: "canDeleteDocuments",
    label: "Delete drafts",
    description: "Permanently delete draft documents.",
  },
  {
    key: "canManageCustomers",
    label: "Manage customers",
    description: "Create and edit customer records.",
  },
  {
    key: "canManageCatalog",
    label: "Manage catalog and stock",
    description: "Add/edit products and services, receive stock, and adjust stock history.",
  },
  {
    key: "canViewReports",
    label: "View reports",
    description: "Open financial and stock reports.",
  },
  {
    key: "canManageSettings",
    label: "Company settings",
    description: "Edit company profile, tax, document numbering, templates, and stock settings.",
  },
  {
    key: "canManageTeam",
    label: "Team management",
    description: "Reserved for owner-level team administration.",
  },
];

export function getDefaultWorkspacePermissions(role: ClientMemberRole | null | undefined): WorkspacePermissions {
  const owner = role === "owner";
  const manager = role === "manager";
  const officer = role === "officer";
  const operational = owner || manager;

  return {
    canManageSettings: owner,
    canManageTeam: owner,
    canViewReports: operational,
    canManageCatalog: operational,
    canManageCustomers: owner || manager || officer,
    canCreateEditDocuments: owner || manager || officer,
    canSendDocuments: operational,
    canRecordPayments: operational,
    canVoidDocuments: operational,
    canDeleteDocuments: owner,
  };
}

export function normalizeWorkspacePermissionOverrides(value: unknown): Partial<WorkspacePermissions> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const normalized: Partial<WorkspacePermissions> = {};

  for (const permission of PERMISSION_GROUPS) {
    if (typeof record[permission.key] === "boolean") {
      normalized[permission.key] = record[permission.key] as boolean;
    }
  }

  return normalized;
}

export function getWorkspacePermissions(
  role: ClientMemberRole | null | undefined,
  overrides?: Partial<WorkspacePermissions> | null,
): WorkspacePermissions {
  const defaults = getDefaultWorkspacePermissions(role);
  if (role === "owner") return defaults;
  const normalizedOverrides = normalizeWorkspacePermissionOverrides(overrides);

  return {
    ...defaults,
    ...normalizedOverrides,
    canManageTeam: false,
    canManageSettings: Boolean(normalizedOverrides.canManageSettings),
  };
}
