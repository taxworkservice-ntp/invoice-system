import type { ClientMemberRole } from "../types";
import type { DocumentType } from "../types";

export type WorkspacePermissionKey =
  | "canManageSettings"
  | "canManageTeam"
  | "canViewReports"
  | "canManageCatalog"
  | "canManageCustomers"
  | "canCreateEditDocuments"
  | "canManageWht"
  | "canSendDocuments"
  | "canSendQuotations"
  | "canSendDeliveryNotes"
  | "canSendFinancialDocuments"
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
  canManageWht: boolean;
  canSendDocuments: boolean;
  canSendQuotations: boolean;
  canSendDeliveryNotes: boolean;
  canSendFinancialDocuments: boolean;
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
    key: "canManageWht",
    label: "ออกหนังสือหัก ณ ที่จ่าย",
    description: "จัดทำ แก้ไข และออกเอกสารหัก ณ ที่จ่าย",
  },
  {
    key: "canSendDocuments",
    label: "Send documents (legacy)",
    description: "Legacy permission for sending all document types. Use the specific permissions below for new staff access.",
  },
  {
    key: "canSendQuotations",
    label: "Send quotations",
    description: "Allow this user to send quotations to customers.",
  },
  {
    key: "canSendDeliveryNotes",
    label: "Confirm delivery notes",
    description: "Allow this user to confirm delivery and trigger stock deduction.",
  },
  {
    key: "canSendFinancialDocuments",
    label: "Send bills and tax documents",
    description: "Allow invoices, billing notes, tax invoices, receipts, and credit notes.",
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
  const officerWorkflow = owner || manager || officer;

  return {
    canManageSettings: owner,
    canManageTeam: owner,
    canViewReports: operational,
    canManageCatalog: operational,
    canManageCustomers: operational,
    canCreateEditDocuments: officerWorkflow,
    canManageWht: officerWorkflow,
    canSendDocuments: officerWorkflow,
    canSendQuotations: officerWorkflow,
    canSendDeliveryNotes: officerWorkflow,
    canSendFinancialDocuments: officerWorkflow,
    canRecordPayments: officerWorkflow,
    canVoidDocuments: officerWorkflow,
    canDeleteDocuments: owner,
  };
}

export function canSendDocumentType(permissions: WorkspacePermissions, documentType: DocumentType) {
  if (permissions.canSendDocuments) return true;
  if (documentType === "quotation") return permissions.canSendQuotations;
  if (documentType === "delivery_note") return permissions.canSendDeliveryNotes;
  return permissions.canSendFinancialDocuments;
}

export function getWorkspaceExperience(role: ClientMemberRole | null | undefined, permissions: WorkspacePermissions) {
  const isOfficer = role === "officer";
  return {
    isSimpleMode: isOfficer,
    canShowAdvancedDealOptions: !isOfficer || permissions.canSendFinancialDocuments,
    canShowFinancialFields: !isOfficer || permissions.canSendFinancialDocuments || permissions.canRecordPayments,
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
