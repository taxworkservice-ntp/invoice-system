import type { ClientMemberRole } from "../types";
import type { DocumentType } from "../types";

export type WorkspacePermissionKey =
  | "canManageSettings"
  | "canViewReports"
  | "canExportReports"
  | "canViewCustomers"
  | "canManageCustomers"
  | "canViewCatalog"
  | "canManageCatalog"
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
  canViewReports: boolean;
  canExportReports: boolean;
  canViewCustomers: boolean;
  canManageCustomers: boolean;
  canViewCatalog: boolean;
  canManageCatalog: boolean;
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

export const ALL_PERMISSION_KEYS: WorkspacePermissionKey[] = [
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
];

export function isWorkspacePermissionKey(key: string): key is WorkspacePermissionKey {
  return (ALL_PERMISSION_KEYS as string[]).includes(key);
}

export const EDITABLE_PERMISSION_KEYS: WorkspacePermissionKey[] = ALL_PERMISSION_KEYS.filter(
  (key) => key !== "canSendDocuments",
);

export const PERMISSION_GROUPS: { key: WorkspacePermissionKey; label: string; description: string }[] = [
  {
    key: "canViewCustomers",
    label: "ดูลูกค้า",
    description: "เข้าถึงรายการและข้อมูลลูกค้าแบบดูอย่างเดียว",
  },
  {
    key: "canManageCustomers",
    label: "จัดการลูกค้า",
    description: "สร้างและแก้ไขข้อมูลลูกค้า",
  },
  {
    key: "canViewCatalog",
    label: "ดูสินค้าและสต็อก",
    description: "เข้าถึงรายการสินค้า บริการ และสต็อกแบบดูอย่างเดียว",
  },
  {
    key: "canManageCatalog",
    label: "จัดการสินค้าและสต็อก",
    description: "เพิ่มสินค้า แก้ไขรายการ และจัดการสต็อก",
  },
  {
    key: "canCreateEditDocuments",
    label: "จัดทำและแก้ไขร่าง",
    description: "สร้างงานขายและแก้ไขเอกสารร่าง",
  },
  {
    key: "canSendQuotations",
    label: "ส่งใบเสนอราคา",
    description: "ส่งใบเสนอราคาให้ลูกค้า",
  },
  {
    key: "canSendDeliveryNotes",
    label: "ยืนยันใบส่งของ",
    description: "ยืนยันการส่งของและตัดสต็อก",
  },
  {
    key: "canSendFinancialDocuments",
    label: "ออกบิลและรับเอกสารการเงิน",
    description: "ส่งใบแจ้งหนี้ ใบวางบิล และเอกสารภาษี",
  },
  {
    key: "canRecordPayments",
    label: "บันทึกรับเงิน",
    description: "บันทึกรับชำระและออกใบเสร็จ",
  },
  {
    key: "canManageWht",
    label: "ออกหนังสือหัก ณ ที่จ่าย",
    description: "จัดทำ แก้ไข และออกเอกสารหัก ณ ที่จ่าย",
  },
  {
    key: "canVoidDocuments",
    label: "ยกเลิกเอกสาร",
    description: "ยกเลิกเอกสารที่ส่งแล้วหรือออกใหม่",
  },
  {
    key: "canDeleteDocuments",
    label: "ลบฉบับร่าง",
    description: "ลบเอกสารฉบับร่างถาวร",
  },
  {
    key: "canViewReports",
    label: "ดูรายงาน",
    description: "เปิดรายงานสรุปยอดขาย การเงิน และสต็อก",
  },
  {
    key: "canExportReports",
    label: "ดาวน์โหลดและส่งออก",
    description: "เปิดศูนย์ดาวน์โหลดและไฟล์ส่งออก",
  },
  {
    key: "canManageSettings",
    label: "ตั้งค่าบริษัท",
    description: "แก้ไขข้อมูลบริษัท ภาษี เทมเพลต และการตั้งค่าเอกสาร",
  },
];

export const PERMISSION_SECTIONS: { title: string; keys: WorkspacePermissionKey[] }[] = [
  {
    title: "เอกสารและการส่ง",
    keys: ["canCreateEditDocuments", "canSendQuotations", "canSendDeliveryNotes", "canSendFinancialDocuments"],
  },
  {
    title: "การเงิน",
    keys: ["canRecordPayments", "canManageWht", "canVoidDocuments", "canDeleteDocuments"],
  },
  {
    title: "ข้อมูลพื้นฐาน",
    keys: ["canViewCustomers", "canManageCustomers", "canViewCatalog", "canManageCatalog"],
  },
  {
    title: "รายงาน",
    keys: ["canViewReports", "canExportReports"],
  },
  {
    title: "ระบบ",
    keys: ["canManageSettings"],
  },
];

const LEGACY_PERMISSION_ALIASES: Record<string, WorkspacePermissionKey[]> = {
  canManageCustomers: ["canViewCustomers"],
  canManageCatalog: ["canViewCatalog"],
  canViewReports: ["canExportReports"],
};

export function getDefaultWorkspacePermissions(role: ClientMemberRole | null | undefined): WorkspacePermissions {
  const isOwner = role === "owner";
  return {
    canManageSettings: isOwner,
    canViewReports: isOwner,
    canExportReports: isOwner,
    canViewCustomers: isOwner,
    canManageCustomers: isOwner,
    canViewCatalog: isOwner,
    canManageCatalog: isOwner,
    canCreateEditDocuments: isOwner,
    canManageWht: isOwner,
    canSendDocuments: isOwner,
    canSendQuotations: isOwner,
    canSendDeliveryNotes: isOwner,
    canSendFinancialDocuments: isOwner,
    canRecordPayments: isOwner,
    canVoidDocuments: isOwner,
    canDeleteDocuments: isOwner,
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

  for (const [key, val] of Object.entries(record)) {
    if (typeof val !== "boolean") continue;
    if (isWorkspacePermissionKey(key)) {
      normalized[key] = val;
    }
  }

  for (const [legacyKey, targets] of Object.entries(LEGACY_PERMISSION_ALIASES)) {
    if (record[legacyKey] === true) {
      for (const target of targets) {
        normalized[target] = true;
      }
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
  };
}

export interface WorkspaceCustomRole {
  id: string;
  workspace_user_id: string;
  name: string;
  permissions: Partial<WorkspacePermissions> | null;
  member_count?: number;
  created_at?: string;
  updated_at?: string;
}
