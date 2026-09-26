import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Plus,
  Trash2,
  History,
  Pencil,
  UserRoundX,
  AlertCircle,
  Repeat,
  Check,
  Circle,
  Paperclip,
  ExternalLink,
  Download,
} from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Spinner } from "../../../components/ui/Spinner";
import { Modal } from "../../../components/ui/Modal";
import { SummaryRow } from "../../../components/home/SummaryRow";
import { PayrollTabs } from "../../../components/payroll/PayrollTabs";
import { resolvePayrollTabsVisibility } from "../../../lib/payroll/visibility";
import { splitInsuredName } from "../../../lib/payroll/ssoExport";
import { currentAgeYears, wasSixtyAtHire } from "../../../lib/payroll/ssoEligibility";
import { TABLE } from "../../../lib/tableStyles";
import { formatCurrency } from "../../../lib/format";
import { formatNumericThaiDate, daysSinceDate } from "../../../lib/dates";
import { useTableSort } from "../../../components/ui/useTableSort";
import { SortableTh } from "../../../components/ui/SortableTh";
import { supabase } from "../../../lib/supabase";
import { deleteFromR2, getR2PresignedUrl } from "../../../lib/r2";
import { ImageUpload, type UploadedFileMeta } from "../../../components/ui/ImageUpload";
import { downloadBlob, datedFilename } from "../../../lib/download/download";
import { buildSsoRows, buildSsoRosterRows, buildSsoWorkbook } from "../../../lib/payroll/ssoExport";
import { workbookToBlob } from "../../../lib/payroll/reportXlsx";
import { useWorkspaceFeatures, useWorkspaceRole } from "../../../hooks/useAuth";
import { getWorkspacePermissions } from "../../../lib/permissions";
import { useToast } from "../../../hooks/useToast";
import {
  logAuditEvent,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  getAuditLogForEntity,
  getActionLabel,
  getActionIcon,
  type AuditLogEntry,
} from "../../../lib/payroll/audit";
import type { Employee, EmployeeDocument } from "../../../types";
import type { RecurringTemplate } from "../../../lib/payroll/recurring";

interface EmployeeForm {
  id: string;
  employee_code: string;
  full_name: string;
  tax_id: string;
  address: string;
  position: string;
  department: string;
  salary_type: "monthly" | "daily";
  base_salary: string;
  bank_name: string;
  bank_account: string;
  sso_registered: boolean;
  start_date: string;
  date_of_birth: string;
  status: "active" | "inactive";
  end_date: string;
  resign_reason: string;
  resign_note: string;
}

const RESIGN_REASONS: { value: string; label: string }[] = [
  { value: "resigned", label: "ลาออกเอง" },
  { value: "contract_ended", label: "สิ้นสุดสัญญาจ้าง" },
  { value: "terminated", label: "เลิกจ้าง" },
  { value: "retired", label: "เกษียณอายุ" },
  { value: "other", label: "อื่น ๆ" },
];

export function resignReasonLabel(reason: string | null | undefined): string {
  return RESIGN_REASONS.find((r) => r.value === reason)?.label || "—";
}

type ModalState = { mode: "create"; form: EmployeeForm } | { mode: "edit"; form: EmployeeForm };

type EmployeeFilter = "active" | "inactive" | "incomplete" | "all";

function isIncompleteProfile(emp: Employee): boolean {
  return (
    emp.status === "active" && (!(emp.tax_id ?? "").trim() || !(emp.bank_account ?? "").trim())
  );
}

function emptyForm(): EmployeeForm {
  return {
    id: "",
    employee_code: "",
    full_name: "",
    tax_id: "",
    address: "",
    position: "",
    department: "",
    salary_type: "monthly",
    base_salary: "0",
    bank_name: "",
    bank_account: "",
    sso_registered: true,
    start_date: new Date().toISOString().split("T")[0],
    date_of_birth: "",
    status: "active",
    end_date: "",
    resign_reason: "",
    resign_note: "",
  };
}

function employeeToForm(emp: Employee): EmployeeForm {
  return {
    id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    tax_id: emp.tax_id ?? "",
    address: emp.address ?? "",
    position: emp.position,
    department: emp.department ?? "",
    salary_type: emp.salary_type,
    base_salary: String(emp.base_salary),
    bank_name: emp.bank_name ?? "",
    bank_account: emp.bank_account ?? "",
    sso_registered: emp.sso_registered !== false,
    start_date: emp.start_date,
    date_of_birth: emp.date_of_birth ?? "",
    status: emp.status,
    end_date: emp.end_date ?? "",
    resign_reason: emp.resign_reason ?? "",
    resign_note: emp.resign_note ?? "",
  };
}

export default function EmployeesPage() {
  const toast = useToast();
  const { workspaceUserId, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const canManagePayroll = getWorkspacePermissions(
    workspaceRole,
    workspacePermissions,
  ).canManagePayroll;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<EmployeeFilter>("active");
  const [department, setDepartment] = useState("all");
  const [offboardingEmployee, setOffboardingEmployee] = useState<Employee | null>(null);
  const [offboardingDate, setOffboardingDate] = useState(new Date().toISOString().split("T")[0]);
  const [offboardingReason, setOffboardingReason] = useState("");
  const [offboardingNote, setOffboardingNote] = useState("");
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  const userId = workspaceUserId;
  const payrollTabs = resolvePayrollTabsVisibility(useWorkspaceFeatures(userId).features);

  const fetchEmployees = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("user_id", userId)
      .order("employee_code", { ascending: true });
    if (error) {
      toast.error("ไม่สามารถโหลดข้อมูลพนักงานได้");
    } else {
      setEmployees((data ?? []) as Employee[]);
    }
    setLoading(false);
  }, [userId, toast]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const departments = Array.from(
    new Set(employees.map((emp) => (emp.department ?? "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "th"));

  const filtered = employees.filter((emp) => {
    if (filter === "active" && emp.status !== "active") return false;
    if (filter === "inactive" && emp.status !== "inactive") return false;
    if (filter === "incomplete" && !isIncompleteProfile(emp)) return false;
    if (department !== "all" && (emp.department ?? "").trim() !== department) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      emp.full_name.toLowerCase().includes(q) ||
      emp.employee_code.toLowerCase().includes(q) ||
      emp.position.toLowerCase().includes(q) ||
      (emp.department ?? "").toLowerCase().includes(q)
    );
  });

  const activeCount = employees.filter((e) => e.status === "active").length;
  const inactiveCount = employees.filter((e) => e.status === "inactive").length;
  const incompleteCount = employees.filter(isIncompleteProfile).length;

  type EmployeeSortKey =
    | "employee_code"
    | "full_name"
    | "start_date"
    | "tenureDays"
    | "position"
    | "salary_type"
    | "base_salary"
    | "status";
  const rowsWithTenure = filtered.map((emp) => ({
    ...emp,
    tenureDays: daysSinceDate(emp.start_date),
  }));
  const empSort = useTableSort<(typeof rowsWithTenure)[number], EmployeeSortKey>(rowsWithTenure, {
    key: "employee_code",
    dir: "asc",
  });
  const sortedEmployees = empSort.sorted;

  const hasActiveFilters = filter !== "active" || department !== "all" || search.trim() !== "";

  function clearEmployeeFilters() {
    setFilter("active");
    setDepartment("all");
    setSearch("");
  }

  const title = modal
    ? modal.mode === "create"
      ? "เพิ่มพนักงาน"
      : `แก้ไขพนักงาน — ${modal.form.full_name || modal.form.employee_code}`
    : "";

  const [modalTab, setModalTab] = useState<"info" | "job" | "documents" | "recurring" | "history">(
    "info",
  );

  function openCreate() {
    const form = emptyForm();
    // Next code after the highest existing EMPnnn — never reuse a deleted code.
    let next = 1;
    for (const e of employees) {
      const m = /^EMP(\d+)$/.exec(e.employee_code.trim());
      if (m) next = Math.max(next, parseInt(m[1], 10) + 1);
    }
    form.employee_code = `EMP${String(next).padStart(3, "0")}`;
    setModalTab("info");
    setModal({ mode: "create", form });
  }

  function openEdit(emp: Employee) {
    setModalTab("info");
    setModal({ mode: "edit", form: employeeToForm(emp) });
  }

  function ssoAgeTag(emp: Employee): { text: string; warn: boolean } | null {
    if (wasSixtyAtHire(emp)) return { text: "ไม่นำส่งประกันสังคม", warn: true };
    const age = currentAgeYears(emp.date_of_birth);
    if (age !== null && age >= 60) return { text: `อายุ ${age}`, warn: false };
    return null;
  }

  function initialsOf(name: string): string {
    // Strip glued titles first (นายทดสอบ → ทดสอบ) so avatars never show them.
    const { firstName, lastName } = splitInsuredName(name);
    const parts = `${firstName} ${lastName}`.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      const fallback = name.trim().split(/\s+/).filter(Boolean);
      if (fallback.length === 0) return "–";
      if (fallback.length === 1) return fallback[0].slice(0, 2).toUpperCase();
      return (fallback[0][0] + fallback[fallback.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function closeModal() {
    if (!modal) return;
    if (saving) return;
    setModal(null);
  }

  function updateField<K extends keyof EmployeeForm>(field: K, value: EmployeeForm[K]) {
    if (!modal) return;
    setModal({ ...modal, form: { ...modal.form, [field]: value } });
  }

  function getValidationErrors(form: EmployeeForm): string[] {
    const errors: string[] = [];
    if (!form.employee_code.trim()) errors.push("กรุณากรอกรหัสพนักงาน");
    if (!form.full_name.trim()) errors.push("กรุณากรอกชื่อ-นามสกุล");
    if (!form.position.trim()) errors.push("กรุณากรอกตำแหน่ง");
    if (!form.start_date) errors.push("กรุณาเลือกวันที่เริ่มงาน");
    if (!form.id && !form.date_of_birth)
      errors.push("กรุณากรอกวันเกิด (ใช้ตรวจสิทธิประกันสังคมอายุ 60)");
    const salary = parseFloat(form.base_salary);
    if (Number.isNaN(salary) || salary < 0)
      errors.push("เงินเดือน/อัตรารายวันต้องเป็นตัวเลขที่ไม่ติดลบ");
    if (form.status === "inactive" && !form.end_date) errors.push("กรุณาเลือกวันที่ลาออก");
    if (form.status === "inactive" && form.end_date && form.end_date < form.start_date)
      errors.push("วันที่ลาออกต้องไม่ก่อนวันที่เริ่มงาน");
    if (form.status === "inactive" && !form.resign_reason) errors.push("กรุณาเลือกเหตุผลการลาออก");
    if (form.status === "inactive" && form.resign_reason === "other" && !form.resign_note.trim())
      errors.push("กรุณาระบุรายละเอียดเหตุผลการลาออก");
    return errors;
  }

  async function handleSave() {
    if (!modal || !userId) return;
    const form = modal.form;
    const errors = getValidationErrors(form);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setSaving(true);
    const payload = {
      user_id: userId,
      employee_code: form.employee_code.trim(),
      full_name: form.full_name.trim(),
      tax_id: form.tax_id.trim() || null,
      address: form.address.trim() || null,
      position: form.position.trim(),
      department: form.department.trim() || null,
      salary_type: form.salary_type,
      base_salary: parseFloat(form.base_salary) || 0,
      bank_name: form.bank_name.trim() || null,
      bank_account: form.bank_account.trim() || null,
      sso_registered: form.sso_registered,
      start_date: form.start_date,
      date_of_birth: form.date_of_birth || null,
      status: form.status,
      end_date: form.status === "inactive" ? form.end_date || null : null,
      resign_reason: form.status === "inactive" ? form.resign_reason || null : null,
      resign_note: form.status === "inactive" ? form.resign_note.trim() || null : null,
    };

    const prevEmployee = employees.find((e) => e.id === form.id);

    if (modal.mode === "create") {
      const { data, error } = await supabase.from("employees").insert(payload).select("*").single();
      if (error) {
        toast.error("ไม่สามารถเพิ่มพนักงานได้");
        setSaving(false);
        return;
      }
      setEmployees((prev) => [...prev, data as Employee]);
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: data.id,
        details: { employee_code: data.employee_code },
      });
      toast.success("เพิ่มพนักงานแล้ว");
    } else {
      const { error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", form.id)
        .eq("user_id", userId);
      if (error) {
        toast.error("บันทึกไม่สำเร็จ");
        setSaving(false);
        return;
      }
      const updated = employees.map((e) =>
        e.id === form.id ? ({ ...e, ...payload } as Employee) : e,
      );
      setEmployees(updated);

      if (prevEmployee) {
        await logDetailedChanges(prevEmployee, payload, form, prevEmployee.id);
      }
      toast.success("บันทึกแล้ว");
    }

    setSaving(false);
    setModal(null);
  }

  async function logDetailedChanges(
    prevEmployee: Employee,
    payload: Record<string, unknown>,
    form: EmployeeForm,
    employeeId: string,
  ) {
    if (prevEmployee.full_name !== form.full_name.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "full_name",
          old_value: prevEmployee.full_name,
          new_value: form.full_name.trim(),
        },
      });
    }
    if (prevEmployee.position !== form.position.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.POSITION_CHANGED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "position",
          old_value: prevEmployee.position,
          new_value: form.position.trim(),
        },
      });
    }
    if ((prevEmployee.department ?? "") !== form.department.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "department",
          old_value: prevEmployee.department ?? "",
          new_value: form.department.trim(),
        },
      });
    }
    if (prevEmployee.base_salary !== (parseFloat(form.base_salary) || 0)) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.SALARY_CHANGED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "base_salary",
          old_value: prevEmployee.base_salary,
          new_value: payload.base_salary,
        },
      });
    }
    if ((prevEmployee.address ?? "") !== form.address.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "address",
          old_value: prevEmployee.address ?? "",
          new_value: form.address.trim(),
        },
      });
    }
    if ((prevEmployee.bank_name ?? "") !== form.bank_name.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "bank_name",
          old_value: prevEmployee.bank_name ?? "",
          new_value: form.bank_name.trim(),
        },
      });
    }
    if ((prevEmployee.bank_account ?? "") !== form.bank_account.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "bank_account",
          old_value: maskAccount(prevEmployee.bank_account ?? ""),
          new_value: maskAccount(form.bank_account.trim()),
        },
      });
    }
    if ((prevEmployee.date_of_birth ?? "") !== form.date_of_birth) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "date_of_birth",
          old_value: prevEmployee.date_of_birth ?? "",
          new_value: form.date_of_birth,
        },
      });
    }
    if (prevEmployee.status !== form.status) {
      await logAuditEvent({
        action:
          form.status === "active"
            ? AUDIT_ACTIONS.EMPLOYEE_ACTIVATED
            : AUDIT_ACTIONS.EMPLOYEE_TERMINATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: { field: "status", old_value: prevEmployee.status, new_value: form.status },
      });
    }
    if (prevEmployee.end_date !== (form.status === "inactive" ? form.end_date || null : null)) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "end_date",
          old_value: prevEmployee.end_date ?? "",
          new_value: form.status === "inactive" ? form.end_date || "" : "",
        },
      });
    }
    if (
      (prevEmployee.resign_reason ?? "") !==
      (form.status === "inactive" ? form.resign_reason || "" : "")
    ) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.RESIGN_REASON_CHANGED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "resign_reason",
          old_value: resignReasonLabel(prevEmployee.resign_reason),
          new_value: resignReasonLabel(form.status === "inactive" ? form.resign_reason || "" : ""),
        },
      });
    }
    if (
      (prevEmployee.resign_note ?? "") !==
      (form.status === "inactive" ? form.resign_note.trim() : "")
    ) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: {
          field: "resign_note",
          old_value: prevEmployee.resign_note ?? "",
          new_value: form.status === "inactive" ? form.resign_note.trim() : "",
        },
      });
    }
  }

  async function handleOffboard() {
    if (!offboardingEmployee || !userId) return;
    if (offboardingDate < offboardingEmployee.start_date) {
      toast.error("วันที่ลาออกต้องไม่ก่อนวันที่เริ่มงาน");
      return;
    }
    if (!offboardingReason) {
      toast.error("กรุณาเลือกเหตุผลการลาออก");
      return;
    }
    if (offboardingReason === "other" && !offboardingNote.trim()) {
      toast.error("กรุณาระบุรายละเอียดเหตุผลการลาออก");
      return;
    }
    const reason = offboardingReason;
    const note = offboardingNote.trim() || null;
    const { error } = await supabase
      .from("employees")
      .update({
        status: "inactive",
        end_date: offboardingDate,
        resign_reason: reason,
        resign_note: note,
      })
      .eq("id", offboardingEmployee.id)
      .eq("user_id", userId);
    if (error) {
      toast.error("ไม่สามารถบันทึกได้");
    } else {
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === offboardingEmployee.id
            ? {
                ...e,
                status: "inactive",
                end_date: offboardingDate,
                resign_reason: reason,
                resign_note: note,
              }
            : e,
        ),
      );
      toast.success(`จบการจ้างงาน ${offboardingEmployee.full_name} แล้ว`);
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_TERMINATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: offboardingEmployee.id,
        details: {
          employee_code: offboardingEmployee.employee_code,
          end_date: offboardingDate,
          resign_reason: resignReasonLabel(reason),
          resign_note: note ?? "",
        },
      });
      setOffboardingEmployee(null);
      setOffboardingReason("");
      setOffboardingNote("");
    }
  }

  async function handleDelete() {
    if (!deletingEmployee || !userId) return;
    const emp = deletingEmployee;
    // History protection: staff with saved payroll lines cannot be deleted
    // (DB RESTRICTs it too) — offboard them so finalized runs stay intact.
    const { count: lineCount } = await supabase
      .from("payroll_line_items")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", emp.id);
    if ((lineCount ?? 0) > 0) {
      toast.error("พนักงานมีประวัติในรอบเงินเดือน — ใช้ จบการจ้างงาน แทนการลบ");
      return;
    }
    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("id", emp.id)
      .eq("user_id", userId);
    if (error) {
      toast.error("ไม่สามารถลบพนักงานได้");
    } else {
      // Best-effort R2 cleanup for personal documents (rows cascade).
      const { data: docs } = await supabase
        .from("employee_documents")
        .select("r2_key")
        .eq("employee_id", emp.id)
        .eq("user_id", userId);
      for (const doc of docs || []) {
        if (doc.r2_key) await deleteFromR2(doc.r2_key).catch(() => undefined);
      }
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
      toast.success("ลบพนักงานแล้ว");
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_DELETED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: emp.id,
        details: { employee_code: emp.employee_code, full_name: emp.full_name },
      });
    }
    setDeletingEmployee(null);
  }

  async function handleExportSsoRoster() {
    const roster = buildSsoRosterRows(employees);
    if (roster.skippedDaily.length > 0) {
      const names = roster.skippedDaily
        .slice(0, 3)
        .map((e) => `${e.employee_code} ${e.full_name}`.trim())
        .join(", ");
      const more =
        roster.skippedDaily.length > 3 ? ` และอีก ${roster.skippedDaily.length - 3} คน` : "";
      toast.error(
        `ส่งออกไม่ได้: พนักงานรายวัน ${names}${more} ต้องส่งออกจากรอบเงินเดือน (ค่าจ้างตามวันทำงานจริง)`,
      );
      return;
    }
    const built = buildSsoRows(roster.rows);
    if (built.errors.length > 0) {
      const names = built.errors
        .slice(0, 3)
        .map((e) => `${e.employeeCode} ${e.fullName}`.trim())
        .join(", ");
      const more = built.errors.length > 3 ? ` และอีก ${built.errors.length - 3} คน` : "";
      toast.error(`ส่งออกไม่ได้: ${names}${more} — ${built.errors[0].reason}`);
      return;
    }
    if (built.rows.length === 0) {
      toast.error("ไม่มีพนักงานประกันสังคม");
      return;
    }
    const wb = buildSsoWorkbook(built.rows);
    const blob = await workbookToBlob(wb);
    downloadBlob(blob, datedFilename("sso-employees", "xlsx"));
    const skippedParts: string[] = [];
    if (built.skippedInactive > 0) skippedParts.push(`ลาออก ${built.skippedInactive}`);
    if (built.skippedContract > 0) skippedParts.push(`ภ.ง.ด.3 ${built.skippedContract}`);
    if (built.skippedOver60 > 0) skippedParts.push(`เกิน 60 ตอนเข้างาน ${built.skippedOver60}`);
    const skipped = skippedParts.length > 0 ? ` (ข้าม: ${skippedParts.join(" · ")})` : "";
    toast.success(`ส่งออกประกันสังคม ${built.rows.length} คน${skipped}`);
  }

  function maskAccount(account: string): string {
    if (account.length <= 4) return account ? "•••" : "";
    return `•••-${account.slice(-4)}`;
  }

  const emptyCopy =
    employees.length === 0
      ? { title: "ยังไม่มีพนักงาน", description: "เริ่มต้นด้วยการเพิ่มพนักงานคนแรก" }
      : filter === "inactive"
        ? { title: "ยังไม่มีพนักงานลาออก", description: "ดีแล้ว — ทุกคนยังอยู่ครบ" }
        : filter === "incomplete"
          ? {
              title: "ข้อมูลครบทุกคน",
              description: "ดีแล้ว — ไม่มีพนักงานที่ขาดเลขภาษีหรือบัญชีธนาคาร",
            }
          : { title: "ไม่พบพนักงาน", description: "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง" };

  // Defense-in-depth: route guard in App.tsx is the first gate; this blocks
  // salary data even if the route check is ever bypassed.
  if (!canManagePayroll) {
    return (
      <AppShell title="พนักงาน">
        <EmptyState
          title="ไม่มีสิทธิ์เข้าถึง"
          description="หน้านี้สำหรับผู้ที่มีสิทธิ์จัดการเงินเดือนเท่านั้น กรุณาติดต่อเจ้าของกิจการ"
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="พนักงาน"
      action={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportSsoRoster}
            className="!rounded-control"
            aria-label="ส่งออกรายงานประกันสังคม"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">ประกันสังคม</span>
          </Button>
          <Button
            size="sm"
            onClick={openCreate}
            className="!rounded-control"
            aria-label="เพิ่มพนักงาน"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">เพิ่ม</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <PayrollTabs
          showRuns={payrollTabs.showRuns}
          showEmployees={payrollTabs.showEmployees}
          employeesCount={employees.length}
        />

        <SummaryRow
          activePreset={filter}
          items={[
            {
              label: "กำลังทำงาน",
              value: activeCount,
              count: activeCount,
              primary: "count",
              hint: "พนักงานปัจจุบัน",
              preset: "active",
            },
            {
              label: "ลาออกแล้ว",
              value: inactiveCount,
              count: inactiveCount,
              primary: "count",
              hint: "เก็บประวัติไว้",
              preset: "inactive",
            },
            {
              label: "ข้อมูลไม่ครบ",
              value: incompleteCount,
              count: incompleteCount,
              primary: "count",
              alert: incompleteCount > 0,
              hint: "ขาดเลขภาษี/บัญชี",
              preset: "incomplete",
            },
            {
              label: "ทั้งหมด",
              value: employees.length,
              count: employees.length,
              primary: "count",
              hint: "ทุกคนในระบบ",
              preset: "all",
            },
          ]}
          onCardTap={(preset) =>
            setFilter((current) => (current === preset ? "active" : (preset as EmployeeFilter)))
          }
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาพนักงาน..." />
          <Select
            aria-label="กรองตามแผนก"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="all">ทุกแผนก</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-label text-ink-500">{filtered.length} คน</div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearEmployeeFilters}
              className="text-label font-medium text-primary hover:underline"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={emptyCopy.title}
            description={emptyCopy.description}
            action={
              employees.length === 0 ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="w-4 h-4" /> เพิ่มพนักงาน
                </Button>
              ) : hasActiveFilters ? (
                <Button size="sm" variant="secondary" onClick={clearEmployeeFilters}>
                  ล้างตัวกรอง
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="space-y-2 sm:hidden">
              {sortedEmployees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => openEdit(emp)}
                  className={`w-full rounded-card border-[0.5px] border-card-border bg-white p-3 text-left transition-colors active:bg-paper-field ${emp.status === "inactive" ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label font-semibold ${emp.status === "inactive" ? "bg-ink-50 text-ink-400" : "bg-primary-soft text-primary-deep"}`}
                    >
                      {initialsOf(emp.full_name || emp.employee_code)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-medium text-ink-900">
                        {emp.full_name || "—"}
                      </div>
                      <div className="text-label tabular-nums text-ink-500">
                        {emp.employee_code}
                        {emp.department ? ` · ${emp.department}` : ""}
                        {emp.sso_registered === false ? " · ภ.ง.ด.3" : ""}
                        {(() => {
                          const tag = ssoAgeTag(emp);
                          return tag ? ` · ${tag.text}` : "";
                        })()}
                      </div>
                    </div>
                    <StatusBadge
                      tone={emp.status === "active" ? "green" : "gray"}
                      label={emp.status === "active" ? "ทำงาน" : "ลาออก"}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-label text-ink-500">
                      {emp.position || "—"} ·{" "}
                      {emp.salary_type === "monthly" ? "รายเดือน" : "รายวัน"}
                      {emp.start_date ? ` · เริ่ม ${formatNumericThaiDate(emp.start_date)}` : ""}
                      {emp.tenureDays !== null && emp.tenureDays !== undefined
                        ? ` · ${emp.tenureDays.toLocaleString("en-US")} วัน`
                        : ""}
                    </span>
                    <span className="text-body tabular-nums text-ink-900">
                      ฿{formatCurrency(emp.base_salary)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="hidden sm:block bg-white border border-card-border rounded-card">
              <table className={`${TABLE.table} min-w-[880px]`}>
                <thead>
                  <tr className={TABLE.theadTr}>
                    <th className={`${TABLE.thStatic} tabular-nums`}>#</th>
                    <SortableTh
                      label="รหัส"
                      align="left"
                      active={empSort.sort.key === "employee_code"}
                      dir={empSort.sort.dir}
                      onClick={() => empSort.handleSort("employee_code")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="ชื่อ-นามสกุล"
                      align="left"
                      active={empSort.sort.key === "full_name"}
                      dir={empSort.sort.dir}
                      onClick={() => empSort.handleSort("full_name")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="เริ่มงาน"
                      align="left"
                      active={empSort.sort.key === "start_date"}
                      dir={empSort.sort.dir}
                      onClick={() => empSort.handleSort("start_date")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="จำนวนวัน"
                      align="right"
                      active={empSort.sort.key === "tenureDays"}
                      dir={empSort.sort.dir}
                      onClick={() => empSort.handleSort("tenureDays")}
                      className={TABLE.thSortable}
                    />
                    <SortableTh
                      label="ตำแหน่ง"
                      align="left"
                      active={empSort.sort.key === "position"}
                      dir={empSort.sort.dir}
                      onClick={() => empSort.handleSort("position")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="ประเภท"
                      align="left"
                      active={empSort.sort.key === "salary_type"}
                      dir={empSort.sort.dir}
                      onClick={() => empSort.handleSort("salary_type")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <SortableTh
                      label="เงินเดือน"
                      align="right"
                      active={empSort.sort.key === "base_salary"}
                      dir={empSort.sort.dir}
                      onClick={() => empSort.handleSort("base_salary")}
                      className={TABLE.thSortable}
                    />
                    <SortableTh
                      label="สถานะ"
                      align="left"
                      active={empSort.sort.key === "status"}
                      dir={empSort.sort.dir}
                      onClick={() => empSort.handleSort("status")}
                      className={`${TABLE.thSortable} whitespace-nowrap`}
                    />
                    <th className={`${TABLE.thStatic} text-right`}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEmployees.map((emp, index) => (
                    <tr
                      key={emp.id}
                      onClick={() => openEdit(emp)}
                      onKeyDown={(event) => {
                        if (event.target instanceof HTMLElement && event.target.closest("button"))
                          return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openEdit(emp);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`แก้ไขพนักงาน ${emp.full_name || emp.employee_code}`}
                      className={`${TABLE.tbodyTr} cursor-pointer group hover:bg-paper-field/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${emp.status === "inactive" ? "opacity-60" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <span className="text-ink-400 tabular-nums text-label">{index + 1}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-ink-900 font-mono text-label">
                          {emp.employee_code}
                        </span>
                      </td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label font-semibold ${emp.status === "inactive" ? "bg-ink-50 text-ink-400" : "bg-primary-soft text-primary-deep"}`}
                          >
                            {initialsOf(emp.full_name || emp.employee_code)}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-ink-900 font-medium truncate">
                              {emp.full_name || "—"}
                            </span>
                            <span className="text-ink-400 text-label">
                              {(() => {
                                const tag = ssoAgeTag(emp);
                                const bits: ReactNode[] = [];
                                if (emp.department) bits.push(emp.department);
                                if (emp.sso_registered === false) {
                                  bits.push(
                                    <span key="pnd3" className="font-medium text-amber-700">
                                      ภ.ง.ด.3
                                    </span>,
                                  );
                                }
                                if (tag) {
                                  bits.push(
                                    <span
                                      key="age"
                                      className={
                                        tag.warn ? "font-medium text-amber-700" : undefined
                                      }
                                    >
                                      {tag.text}
                                    </span>,
                                  );
                                }
                                return bits.length > 0
                                  ? bits.map((bit, i) => (
                                      <Fragment key={i}>
                                        {i > 0 ? " · " : ""}
                                        {bit}
                                      </Fragment>
                                    ))
                                  : "";
                              })()}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-ink-700 tabular-nums">
                          {emp.start_date ? formatNumericThaiDate(emp.start_date) : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="text-ink-700 tabular-nums">
                          {emp.tenureDays === null
                            ? "—"
                            : `${emp.tenureDays.toLocaleString("en-US")} วัน`}
                        </span>
                      </td>
                      <td className="px-3 py-2 min-w-[120px]">
                        <span className="text-ink-500">{emp.position || "—"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-control text-label font-medium ${emp.salary_type === "monthly" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}
                        >
                          {emp.salary_type === "monthly" ? "รายเดือน" : "รายวัน"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-ink-900 tabular-nums font-medium">
                          {formatCurrency(emp.base_salary)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          tone={emp.status === "active" ? "green" : "gray"}
                          label={emp.status === "active" ? "ทำงาน" : "ลาออก"}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {emp.status === "active" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOffboardingEmployee(emp);
                                setOffboardingDate(new Date().toISOString().split("T")[0]);
                                setOffboardingReason("");
                                setOffboardingNote("");
                              }}
                              className="flex h-11 w-11 items-center justify-center rounded-control hover:bg-amber-50 text-ink-300 hover:text-amber-600 transition-colors md:h-7 md:w-7"
                              title="จบการจ้างงาน"
                              aria-label={`จบการจ้างงาน ${emp.full_name || emp.employee_code}`}
                            >
                              <UserRoundX className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(emp);
                            }}
                            className="flex h-11 w-11 items-center justify-center rounded-control hover:bg-paper-field text-ink-400 hover:text-ink-700 transition-colors md:h-7 md:w-7"
                            title="แก้ไข"
                            aria-label={`แก้ไข ${emp.full_name || emp.employee_code}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingEmployee(emp);
                            }}
                            className="flex h-11 w-11 items-center justify-center rounded-control hover:bg-red-50 text-ink-300 hover:text-red-500 transition-colors md:h-7 md:w-7"
                            title="ลบ"
                            aria-label={`ลบ ${emp.full_name || emp.employee_code}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Modal open={modal !== null} onClose={closeModal} title={title} size="xl">
        {modal && (
          <div className="space-y-4">
            <div className="inline-flex rounded-control border border-card-border bg-paper-field p-0.5 max-w-full overflow-x-auto">
              {(
                [
                  ["info", "ข้อมูลทั่วไป"],
                  ["job", "การจ้างงาน"],
                  ["documents", "เอกสาร"],
                  ["recurring", "รายการประจำ"],
                  ["history", "ประวัติ"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setModalTab(key)}
                  className={`whitespace-nowrap px-3 py-1.5 text-label font-medium rounded-control transition-colors ${modalTab === key ? "bg-white text-ink-900 " : "text-ink-500 hover:text-ink-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {modalTab === "info" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="รหัสพนักงาน"
                  value={modal.form.employee_code}
                  onChange={(e) => updateField("employee_code", e.target.value)}
                  placeholder="EMP001"
                />
                <Input
                  label="ชื่อ-นามสกุล"
                  value={modal.form.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  placeholder="ชื่อ นามสกุล"
                />
                <div>
                  <Input
                    label="เลขบัตรประชาชน / เลขผู้เสียภาษี"
                    value={modal.form.tax_id}
                    onChange={(e) => updateField("tax_id", e.target.value)}
                    placeholder="0000000000000"
                    maxLength={13}
                  />
                  <p className="mt-1 text-label text-ink-400">
                    เว้นว่างได้ — พนักงานที่ไม่มีเลขฯ จะถูกข้ามเมื่อซิงก์ภาษีหัก ณ ที่จ่าย
                  </p>
                </div>
                <div>
                  <Input
                    label="วันเกิด"
                    type="date"
                    value={modal.form.date_of_birth}
                    onChange={(e) => updateField("date_of_birth", e.target.value)}
                  />
                  <p className="mt-1 text-label text-ink-400">
                    ใช้ตรวจสิทธิประกันสังคม (เข้างานตอนอายุ 60 ขึ้นไปไม่ต้องนำส่ง)
                  </p>
                </div>
                <Input
                  label="ตำแหน่ง"
                  value={modal.form.position}
                  onChange={(e) => updateField("position", e.target.value)}
                  placeholder="เช่น พนักงานขาย"
                />
                <Input
                  label="แผนก"
                  value={modal.form.department}
                  onChange={(e) => updateField("department", e.target.value)}
                  placeholder="เช่น บัญชี, ขาย"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="ที่อยู่"
                    value={modal.form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
                  />
                  <p className="mt-1 text-label text-ink-400">
                    ใช้เป็นที่อยู่ผู้รับเงินบนใบรับรองหักภาษี ณ ที่จ่าย
                  </p>
                </div>
                <Input
                  label="ธนาคาร"
                  value={modal.form.bank_name}
                  onChange={(e) => updateField("bank_name", e.target.value)}
                  placeholder="เช่น กสิกรไทย"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="เลขบัญชีธนาคาร"
                    value={modal.form.bank_account}
                    onChange={(e) => updateField("bank_account", e.target.value)}
                    placeholder="000-0-00000-0"
                  />
                </div>
              </div>
            )}

            {modalTab === "job" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="ประเภทเงินเดือน"
                  value={modal.form.salary_type}
                  onChange={(e) =>
                    updateField("salary_type", e.target.value as "monthly" | "daily")
                  }
                >
                  <option value="monthly">รายเดือน</option>
                  <option value="daily">รายวัน</option>
                </Select>
                <Input
                  label={
                    modal.form.salary_type === "monthly" ? "เงินเดือน (บาท)" : "อัตรารายวัน (บาท)"
                  }
                  type="number"
                  value={modal.form.base_salary}
                  onChange={(e) => updateField("base_salary", e.target.value)}
                  placeholder="0"
                />
                <Input
                  label="วันที่เริ่มงาน"
                  type="date"
                  value={modal.form.start_date}
                  onChange={(e) => updateField("start_date", e.target.value)}
                />
                <Select
                  label="สถานะ"
                  value={modal.form.status}
                  onChange={(e) => updateField("status", e.target.value as "active" | "inactive")}
                >
                  <option value="active">ทำงาน</option>
                  <option value="inactive">ลาออก</option>
                </Select>
                <Select
                  label="ประกันสังคม"
                  value={modal.form.sso_registered ? "registered" : "unregistered"}
                  onChange={(e) => updateField("sso_registered", e.target.value === "registered")}
                >
                  <option value="registered">ลงทะเบียนแล้ว (ภ.ง.ด.1)</option>
                  <option value="unregistered">ไม่ลงทะเบียน (ภ.ง.ด.3 · ค่าจ้างทำของ 3%)</option>
                </Select>
                {modal.form.status === "inactive" && (
                  <Input
                    label="วันที่ลาออก"
                    type="date"
                    value={modal.form.end_date}
                    onChange={(e) => updateField("end_date", e.target.value)}
                  />
                )}
                {modal.form.status === "inactive" && (
                  <Select
                    label="เหตุผลการลาออก"
                    value={modal.form.resign_reason}
                    onChange={(e) => updateField("resign_reason", e.target.value)}
                  >
                    <option value="">เลือกเหตุผล</option>
                    {RESIGN_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </Select>
                )}
                {modal.form.status === "inactive" && (
                  <div className="sm:col-span-2">
                    <Input
                      label={
                        modal.form.resign_reason === "other"
                          ? "รายละเอียดเหตุผล (บังคับ)"
                          : "หมายเหตุการลาออก"
                      }
                      value={modal.form.resign_note}
                      onChange={(e) => updateField("resign_note", e.target.value)}
                      placeholder="รายละเอียดเพิ่มเติม"
                    />
                  </div>
                )}
              </div>
            )}

            {modalTab === "documents" &&
              (modal.mode === "edit" ? (
                <EmployeeDocumentsPanel userId={userId ?? ""} employeeId={modal.form.id} />
              ) : (
                <p className="text-label text-ink-400">
                  บันทึกพนักงานก่อน แล้วค่อยอัปโหลดเอกสาร (บัตรประชาชน, ทะเบียนบ้าน, สมุดบัญชี)
                  ในภายหลัง
                </p>
              ))}

            {modalTab === "recurring" &&
              (modal.mode === "edit" ? (
                <RecurringPanel employeeId={modal.form.id} />
              ) : (
                <p className="text-label text-ink-400">
                  บันทึกรายการพนักงานก่อน แล้วค่อยเพิ่มรายการประจำ (เช่น เงินกู้, ค่างวด) ในภายหลัง
                </p>
              ))}

            {modalTab === "history" &&
              (modal.mode === "edit" ? (
                <ActivityPanel entityType="employee" entityId={modal.form.id} />
              ) : (
                <p className="text-label text-ink-400">ประวัติจะแสดงหลังจากบันทึกพนักงานแล้ว</p>
              ))}

            <div className="sticky bottom-0 -mx-1 bg-white/95 backdrop-blur pt-2 pb-1">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={closeModal}
                  className="flex-1"
                  disabled={saving}
                >
                  ยกเลิก
                </Button>
                <Button onClick={handleSave} className="flex-1" disabled={saving}>
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={offboardingEmployee !== null}
        onClose={() => setOffboardingEmployee(null)}
        title="จบการจ้างงาน"
      >
        {offboardingEmployee && (
          <div className="space-y-4">
            <p className="text-body text-ink-600">
              ยืนยันการจบการจ้างงาน <strong>{offboardingEmployee.full_name}</strong> (รหัส{" "}
              {offboardingEmployee.employee_code})
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-control p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-label text-blue-800">
                ข้อมูลในรอบเงินเดือนก่อนหน้าและสลิปเงินเดือนจะถูกเก็บไว้ตามเดิม
                พนักงานจะไม่แสดงในรอบเงินเดือนถัดไป
              </p>
            </div>
            <Input
              label="วันที่ลาออก"
              type="date"
              value={offboardingDate}
              onChange={(e) => setOffboardingDate(e.target.value)}
            />
            <Select
              label="เหตุผลการลาออก"
              value={offboardingReason}
              onChange={(e) => setOffboardingReason(e.target.value)}
            >
              <option value="">เลือกเหตุผล</option>
              {RESIGN_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </Select>
            {offboardingReason === "other" && (
              <Input
                label="รายละเอียดเหตุผล (บังคับ)"
                value={offboardingNote}
                onChange={(e) => setOffboardingNote(e.target.value)}
                placeholder="รายละเอียดเพิ่มเติม"
              />
            )}
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={() => setOffboardingEmployee(null)}
                className="flex-1"
              >
                ยกเลิก
              </Button>
              <Button variant="danger" onClick={handleOffboard} className="flex-1">
                จบการจ้างงาน
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={deletingEmployee !== null}
        onClose={() => setDeletingEmployee(null)}
        title="ลบพนักงาน"
      >
        {deletingEmployee && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-control p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-body text-red-800">
                ต้องการลบพนักงาน <strong>{deletingEmployee.full_name}</strong> ทั้งหมด?
                การดำเนินการนี้ไม่สามารถย้อนกลับได้ ถ้าพนักงานเคยมีประวัติในรอบเงินเดือน จะลบไม่ได้
                — ให้ใช้ จบการจ้างงาน แทนเพื่อเก็บประวัติไว้
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={() => setDeletingEmployee(null)}
                className="flex-1"
              >
                ยกเลิก
              </Button>
              <Button variant="danger" onClick={handleDelete} className="flex-1">
                ลบพนักงาน
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}

interface ActivityPanelProps {
  entityType: string;
  entityId: string;
}

function ActivityPanel({ entityType, entityId }: ActivityPanelProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAuditLogForEntity(entityType, entityId).then((data) => {
      setLogs(data);
      setLoading(false);
    });
  }, [entityType, entityId]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-ink-500" />
        <span className="text-label font-semibold text-ink-700">ประวัติการเปลี่ยนแปลง</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-ink-400">
          <Spinner />
          <span className="text-label">กำลังโหลด...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex items-center gap-2 text-ink-400">
          <History className="w-4 h-4" />
          <span className="text-label">ไม่มีประวัติการเปลี่ยนแปลง</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 text-label">
              <span className="text-title leading-none">{getActionIcon(log.action)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink-700">{getActionLabel(log.action)}</span>
                  <span className="text-ink-400">{formatAuditDetail(log)}</span>
                </div>
                <div className="text-ink-400 text-label">{formatAuditTime(log.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatAuditDetail(log: AuditLogEntry): string {
  const d = log.details;
  if (log.action === "salary_changed") {
    return `${formatCurrency(Number(d.old_value) || 0)} → ${formatCurrency(Number(d.new_value) || 0)}`;
  }
  if (log.action === "employee_activated") return "เปิดใช้งานใหม่";
  if (log.action === "employee_terminated") return "สิ้นสุดการจ้างงาน";
  if (log.action === "employee_created") return d.employee_code ? `รหัส ${d.employee_code}` : "";
  if (log.action === "employee_deleted") return d.employee_code ? `รหัส ${d.employee_code}` : "";
  if (d.field) {
    const from = d.old_value ? String(d.old_value) : "";
    const to = d.new_value ? String(d.new_value) : "";
    if (from && to && from !== to) {
      return `${from} → ${to}`;
    }
    return `ฟิลด์ ${d.field}`;
  }
  return "";
}

function formatAuditTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

interface RecurringPanelProps {
  employeeId: string;
}

function RecurringPanel({ employeeId }: RecurringPanelProps) {
  const toast = useToast();
  const { workspaceUserId } = useWorkspaceRole();
  const [items, setItems] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("payroll_recurring_items")
      .select("*")
      .eq("employee_id", employeeId)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSchemaMissing(true);
          setItems([]);
        } else {
          setSchemaMissing(false);
          setItems((data ?? []) as RecurringTemplate[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  async function addItem() {
    if (!workspaceUserId || busy) return;
    setBusy(true);
    const nextSort = items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1;
    const { data, error } = await supabase
      .from("payroll_recurring_items")
      .insert({
        user_id: workspaceUserId,
        employee_id: employeeId,
        direction: "deduction",
        label: "",
        amount: 0,
        active: true,
        sort_order: nextSort,
      })
      .select("*")
      .single();
    if (error) {
      toast.error("ไม่สามารถเพิ่มรายการได้");
    } else {
      setItems((prev) => [...prev, data as RecurringTemplate]);
    }
    setBusy(false);
  }

  async function patchItem(id: string, patch: Partial<RecurringTemplate>) {
    if (!workspaceUserId || busy) return;
    setBusy(true);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("payroll_recurring_items").update(patch).eq("id", id);
    if (error) toast.error("บันทึกไม่สำเร็จ");
    setBusy(false);
  }

  async function removeItem(id: string) {
    if (!workspaceUserId || busy) return;
    setBusy(true);
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await supabase.from("payroll_recurring_items").delete().eq("id", id);
    if (error) toast.error("ลบไม่สำเร็จ");
    setBusy(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-ink-500" />
          <span className="text-label font-semibold text-ink-700">
            รายการประจำ (เติมอัตโนมัติในรอบใหม่)
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={addItem}
          disabled={busy}
          className="!px-2 !py-1 !h-7"
        >
          <Plus className="w-3 h-3" /> เพิ่ม
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-ink-400">
          <Spinner />
          <span className="text-label">กำลังโหลด...</span>
        </div>
      ) : schemaMissing ? (
        <p className="text-label text-amber-600 flex items-start gap-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          ฟีเจอร์นี้ต้องอัปเดตฐานข้อมูลก่อน (migration: payroll_recurring_items)
        </p>
      ) : items.length === 0 ? (
        <p className="text-label text-ink-400">
          เช่น ค่างวดรถ/บ้าน, เงินกู้สหกรณ์, ค่าอาหาร —
          รายการจะถูกเติมให้พนักงานคนนี้อัตโนมัติในทุกรอบใหม่
        </p>
      ) : (
        <div className="space-y-2 overflow-x-auto">
          <div className="grid min-w-max grid-cols-[92px_1fr_96px_46px_32px] gap-2 text-label text-ink-400 font-medium px-1">
            <span>ประเภท</span>
            <span>รายการ</span>
            <span className="text-right">จำนวน (฿)</span>
            <span>ใช้งาน</span>
            <span></span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="grid min-w-max grid-cols-[92px_1fr_96px_46px_32px] gap-2 items-center"
            >
              <Select
                value={item.direction}
                onChange={(e) =>
                  patchItem(item.id, { direction: e.target.value as "addition" | "deduction" })
                }
                className="!h-8 !text-label"
                disabled={busy}
              >
                <option value="addition">เงินเพิ่ม</option>
                <option value="deduction">เงินหัก</option>
              </Select>
              <Input
                value={item.label}
                onChange={(e) => patchItem(item.id, { label: e.target.value })}
                placeholder="เช่น เงินกู้ยืมสหกรณ์"
                className="!h-8 !text-label"
                disabled={busy}
              />
              <Input
                type="number"
                min="0"
                value={item.amount ?? ""}
                onChange={(e) => patchItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                placeholder="฿"
                className="!h-8 !text-label text-right"
                disabled={busy}
              />
              <button
                onClick={() => patchItem(item.id, { active: !item.active })}
                aria-label={item.active ? "ปิดการใช้งาน" : "เปิดการใช้งาน"}
                className={`flex h-11 w-11 items-center justify-center rounded-control transition-colors md:h-7 md:w-7 ${item.active ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-paper-field text-ink-300 hover:text-ink-500"}`}
                title={item.active ? "กำลังใช้งาน" : "ปิดไว้"}
              >
                {item.active ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Circle className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => removeItem(item.id)}
                disabled={busy}
                className="flex h-11 w-11 items-center justify-center rounded-control hover:bg-red-50 text-ink-400 hover:text-red-500 transition-colors md:h-7 md:w-7"
                aria-label="ลบรายการ"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DOC_SLOTS = [
  { type: "id_card", label: "บัตรประชาชน" },
  { type: "house_registration", label: "ทะเบียนบ้าน" },
  { type: "bank_book", label: "สมุดบัญชี" },
] as const;

type DocSlotType = (typeof DOC_SLOTS)[number]["type"] | "other";

function EmployeeDocumentsPanel({ userId, employeeId }: { userId: string; employeeId: string }) {
  const toast = useToast();
  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [otherLabel, setOtherLabel] = useState("");
  const [addCount, setAddCount] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("employee_documents")
      .select("*")
      .eq("employee_id", employeeId)
      .order("uploaded_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSchemaMissing(true);
          setDocs([]);
        } else {
          setSchemaMissing(false);
          setDocs((data ?? []) as EmployeeDocument[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  function slotKey(docType: string, ext: string): string {
    return `employees/${employeeId}/${docType}-${Date.now()}.${ext}`;
  }

  async function auditDoc(action: string, docType: string, label: string, fileName: string) {
    await logAuditEvent({
      action: action as typeof AUDIT_ACTIONS.EMPLOYEE_DOCUMENT_ADDED,
      entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
      entity_id: employeeId,
      details: { doc_type: docType, label, file_name: fileName },
    });
  }

  async function handleSlotChange(
    docType: DocSlotType,
    label: string,
    key: string | null,
    file?: UploadedFileMeta | null,
  ) {
    if (!userId) return;
    const previous = docs.filter((d) => d.doc_type === docType && (d.label ?? "") === label);
    if (key === null) {
      if (previous.length === 0) return;
      const { error } = await supabase
        .from("employee_documents")
        .delete()
        .in(
          "id",
          previous.map((d) => d.id),
        );
      if (error) {
        toast.error("ลบเอกสารไม่สำเร็จ");
        return;
      }
      setDocs((prev) => prev.filter((d) => !previous.some((p) => p.id === d.id)));
      await auditDoc(
        AUDIT_ACTIONS.EMPLOYEE_DOCUMENT_REMOVED,
        docType,
        label,
        previous[0].file_name ?? "",
      );
      return;
    }
    const { data, error } = await supabase
      .from("employee_documents")
      .insert({
        user_id: userId,
        employee_id: employeeId,
        doc_type: docType,
        label: label || null,
        r2_key: key,
        file_name: file?.name ?? null,
        mime_type: file?.type ?? null,
        file_size: file?.size ?? null,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("บันทึกเอกสารไม่สำเร็จ");
      return;
    }
    setDocs((prev) => [
      ...prev.filter((d) => !previous.some((p) => p.id === d.id)),
      data as EmployeeDocument,
    ]);
    // Fixed slots hold one row: drop the replaced predecessor row (its R2
    // object was already deleted by the uploader on replace).
    if (docType !== "other" && previous.length > 0) {
      await supabase
        .from("employee_documents")
        .delete()
        .in(
          "id",
          previous.map((d) => d.id),
        );
      setDocs((prev) => [
        ...prev.filter((d) => !previous.some((p) => p.id === d.id)),
        data as EmployeeDocument,
      ]);
    }
    await auditDoc(
      previous.length > 0 ? AUDIT_ACTIONS.EMPLOYEE_UPDATED : AUDIT_ACTIONS.EMPLOYEE_DOCUMENT_ADDED,
      docType,
      label,
      file?.name ?? "",
    );
    if (docType === "other") {
      setOtherLabel("");
      setAddCount((c) => c + 1);
    }
  }

  async function removeOtherDoc(doc: EmployeeDocument) {
    if (!userId) return;
    await deleteFromR2(doc.r2_key).catch(() => undefined);
    const { error } = await supabase.from("employee_documents").delete().eq("id", doc.id);
    if (error) {
      toast.error("ลบเอกสารไม่สำเร็จ");
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    await auditDoc(
      AUDIT_ACTIONS.EMPLOYEE_DOCUMENT_REMOVED,
      doc.doc_type,
      doc.label ?? "",
      doc.file_name ?? "",
    );
  }

  async function openDoc(doc: EmployeeDocument) {
    if (openingId) return;
    setOpeningId(doc.id);
    try {
      const url = await getR2PresignedUrl(doc.r2_key);
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("เปิดเอกสารไม่สำเร็จ");
    } finally {
      setOpeningId(null);
    }
  }

  const otherDocs = docs.filter((d) => d.doc_type === "other");

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="w-4 h-4 text-ink-500" />
        <span className="text-label font-semibold text-ink-700">
          เอกสารส่วนตัว (เก็บเป็นความลับ — แสดงเฉพาะในหน้านี้)
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-ink-400">
          <Spinner />
          <span className="text-label">กำลังโหลด...</span>
        </div>
      ) : schemaMissing ? (
        <p className="text-label text-amber-600 flex items-start gap-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          ฟีเจอร์นี้ต้องอัปเดตฐานข้อมูลก่อน (migration: employee_documents)
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DOC_SLOTS.map((slot) => {
              const existing = docs.find((d) => d.doc_type === slot.type);
              return (
                <ImageUpload
                  key={slot.type}
                  userId={userId}
                  storageKeyFn={(_uid, ext) => slotKey(slot.type, ext)}
                  currentKey={existing?.r2_key ?? null}
                  onKeyChange={(key, file) => handleSlotChange(slot.type, "", key, file)}
                  label={slot.label}
                  accept="image/*,.pdf"
                  loadPreview
                />
              );
            })}
          </div>

          <div>
            <div className="text-label font-semibold text-ink-700 mb-2">เอกสารอื่น ๆ</div>
            {otherDocs.length > 0 && (
              <div className="space-y-2 mb-3">
                {otherDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 rounded-control border border-card-border bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-medium text-ink-900">
                        {doc.label || doc.file_name || "เอกสาร"}
                      </div>
                      {doc.file_name && doc.label && (
                        <div className="truncate text-label text-ink-400">{doc.file_name}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openDoc(doc)}
                      disabled={openingId !== null}
                      className="flex items-center gap-1 text-label font-medium text-primary hover:underline disabled:text-ink-300"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      เปิดดู
                    </button>
                    <button
                      type="button"
                      onClick={() => removeOtherDoc(doc)}
                      aria-label="ลบเอกสาร"
                      className="flex h-7 w-7 items-center justify-center rounded-control hover:bg-red-50 text-ink-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="ชื่อเอกสาร"
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
                placeholder="เช่น สัญญาจ้าง, วุฒิการศึกษา"
              />
              <ImageUpload
                key={`other-${addCount}`}
                userId={userId}
                storageKeyFn={(_uid, ext) => slotKey("other", ext)}
                currentKey={null}
                onKeyChange={(key, file) => handleSlotChange("other", otherLabel.trim(), key, file)}
                label="ไฟล์เอกสาร"
                accept="image/*,.pdf"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
