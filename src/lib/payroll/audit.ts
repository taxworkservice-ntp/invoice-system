import { supabase } from "../supabase";

export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogInput {
  action: string;
  entity_type: string;
  entity_id: string;
  details?: Record<string, unknown>;
}

export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_audit_event", {
      p_action: input.action,
      p_entity_type: input.entity_type,
      p_entity_id: input.entity_id,
      p_details: input.details ?? {},
    });
    if (error) {
      await supabase.from("payroll_audit_log").insert({
        user_id:
          (await supabase.auth.getUser()).data.user?.id ?? "00000000-0000-0000-0000-000000000000",
        action: input.action,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        details: input.details ?? {},
      });
    }
  } catch {
    // Silently fail - audit logging should not break the app
  }
}

export async function getAuditLogForEntity(
  entityType: string,
  entityId: string,
): Promise<AuditLogEntry[]> {
  try {
    const { data, error } = await supabase.rpc("get_audit_log", {
      p_entity_type: entityType,
      p_entity_id: entityId,
    });
    if (!error && data) return data as AuditLogEntry[];
  } catch {
    // Fallback to direct query
  }

  const { data, error } = await supabase
    .from("payroll_audit_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as AuditLogEntry[];
}

export async function getAuditLogForUser(userId: string): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("payroll_audit_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return [];
  return (data ?? []) as AuditLogEntry[];
}

export const AUDIT_ACTIONS = {
  EMPLOYEE_CREATED: "employee_created",
  EMPLOYEE_UPDATED: "employee_updated",
  EMPLOYEE_ACTIVATED: "employee_activated",
  EMPLOYEE_TERMINATED: "employee_terminated",
  EMPLOYEE_DELETED: "employee_deleted",
  RESIGN_REASON_CHANGED: "resign_reason_changed",
  EMPLOYEE_DOCUMENT_ADDED: "employee_document_added",
  EMPLOYEE_DOCUMENT_REMOVED: "employee_document_removed",
  SALARY_CHANGED: "salary_changed",
  POSITION_CHANGED: "position_changed",
  PAYROLL_RUN_CREATED: "payroll_run_created",
  PAYROLL_INPUT_CHANGED: "payroll_input_changed",
  PAYROLL_RUN_FINALIZED: "payroll_run_finalized",
  PAYROLL_RUN_REOPENED: "payroll_run_reopened",
  PAYSLIP_PRINTED: "payslip_printed",
  PAYROLL_EXPORTED: "payroll_exported",
  PAYROLL_RUN_DELETED: "payroll_run_deleted",
  PAYROLL_RUN_UPDATED: "payroll_run_updated",
  PAYROLL_WHT_SYNCED: "payroll_wht_synced",
  ADMIN_VIEW_AS_ENTER: "admin_view_as_enter",
  ADMIN_VIEW_AS_EXIT: "admin_view_as_exit",
} as const;

export const AUDIT_ENTITY_TYPES = {
  EMPLOYEE: "employee",
  PAYROLL_RUN: "payroll_run",
  PAYSLIP: "payslip",
  CLIENT_PROFILE: "client_profile",
} as const;

export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    employee_created: "สร้างพนักงาน",
    employee_updated: "แก้ไขข้อมูลพนักงาน",
    employee_activated: "เปิดใช้งานพนักงาน",
    employee_terminated: "สิ้นสุดการจ้างงาน",
    employee_deleted: "ลบพนักงาน",
    resign_reason_changed: "เปลี่ยนเหตุผลการลาออก",
    employee_document_added: "เพิ่มเอกสารพนักงาน",
    employee_document_removed: "ลบเอกสารพนักงาน",
    salary_changed: "เปลี่ยนเงินเดือน",
    position_changed: "เปลี่ยนตำแหน่ง",
    payroll_run_created: "สร้างรอบเงินเดือน",
    payroll_input_changed: "แก้ไขข้อมูลเงินเดือน",
    payroll_run_finalized: "ปิดรอบเงินเดือน",
    payroll_run_reopened: "เปิดรอบใหม่",
    payslip_printed: "พิมพ์สลิปเงินเดือน",
    payroll_exported: "ส่งออกรายงานเงินเดือน",
    payroll_run_deleted: "ลบรอบเงินเดือน",
    payroll_run_updated: "แก้ไขข้อมูลรอบ",
    payroll_wht_synced: "ซิงก์ภาษีหัก ณ ที่จ่าย",
    admin_view_as_enter: "แอดมินเปิดดู workspace ลูกค้า",
    admin_view_as_exit: "แอดมินออกจากมุมมองลูกค้า",
  };
  return labels[action] ?? action;
}

export function getActionIcon(action: string): string {
  const icons: Record<string, string> = {
    employee_created: "➕",
    employee_updated: "✏️",
    employee_activated: "✅",
    employee_terminated: "🚪",
    employee_deleted: "🗑️",
    resign_reason_changed: "🚪",
    employee_document_added: "📎",
    employee_document_removed: "🗑️",
    salary_changed: "💰",
    position_changed: "📋",
    payroll_run_created: "📝",
    payroll_run_finalized: "🔒",
    payroll_run_reopened: "🔓",
    payslip_printed: "🖨️",
    payroll_exported: "📊",
    payroll_run_deleted: "🗑️",
    payroll_run_updated: "✏️",
    payroll_wht_synced: "🧾",
  };
  return icons[action] ?? "📌";
}
