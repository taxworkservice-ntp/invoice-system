import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, History, Pencil, UserRoundX, AlertCircle, Repeat, Check, Circle } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SearchInput } from "../../../components/ui/SearchInput";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Spinner } from "../../../components/ui/Spinner";
import { Modal } from "../../../components/ui/Modal";
import { TABLE } from "../../../lib/tableStyles";
import { formatCurrency } from "../../../lib/format";
import { supabase } from "../../../lib/supabase";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, getAuditLogForEntity, getActionLabel, getActionIcon, type AuditLogEntry } from "../../../lib/payroll/audit";
import type { Employee } from "../../../types";
import type { RecurringTemplate } from "../../../lib/payroll/recurring";

interface EmployeeForm {
  id: string;
  employee_code: string;
  full_name: string;
  tax_id: string;
  position: string;
  department: string;
  salary_type: "monthly" | "daily";
  base_salary: string;
  bank_account: string;
  start_date: string;
  status: "active" | "inactive";
  end_date: string;
}

type ModalState =
  | { mode: "create"; form: EmployeeForm }
  | { mode: "edit"; form: EmployeeForm };

type EmployeeFilter = "active" | "inactive" | "all";

function emptyForm(): EmployeeForm {
  return {
    id: "",
    employee_code: "",
    full_name: "",
    tax_id: "",
    position: "",
    department: "",
    salary_type: "monthly",
    base_salary: "0",
    bank_account: "",
    start_date: new Date().toISOString().split("T")[0],
    status: "active",
    end_date: "",
  };
}

function employeeToForm(emp: Employee): EmployeeForm {
  return {
    id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    tax_id: emp.tax_id ?? "",
    position: emp.position,
    department: emp.department ?? "",
    salary_type: emp.salary_type,
    base_salary: String(emp.base_salary),
    bank_account: emp.bank_account ?? "",
    start_date: emp.start_date,
    status: emp.status,
    end_date: emp.end_date ?? "",
  };
}

export default function EmployeesPage() {
  const toast = useToast();
  const { workspaceUserId } = useWorkspaceRole();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<EmployeeFilter>("active");
  const [offboardingEmployee, setOffboardingEmployee] = useState<Employee | null>(null);
  const [offboardingDate, setOffboardingDate] = useState(new Date().toISOString().split("T")[0]);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  const userId = workspaceUserId;

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

  const filtered = employees.filter((emp) => {
    if (filter === "active" && emp.status !== "active") return false;
    if (filter === "inactive" && emp.status !== "inactive") return false;
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

  const title = modal
    ? modal.mode === "create"
      ? "เพิ่มพนักงาน"
      : `แก้ไขพนักงาน — ${modal.form.full_name || modal.form.employee_code}`
    : "";

  function openCreate() {
    const form = emptyForm();
    form.employee_code = `EMP${String(employees.length + 1).padStart(3, "0")}`;
    setModal({ mode: "create", form });
  }

  function openEdit(emp: Employee) {
    setModal({ mode: "edit", form: employeeToForm(emp) });
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
    const salary = parseFloat(form.base_salary);
    if (Number.isNaN(salary) || salary < 0) errors.push("เงินเดือน/อัตรารายวันต้องเป็นตัวเลขที่ไม่ติดลบ");
    if (form.status === "inactive" && !form.end_date) errors.push("กรุณาเลือกวันที่ลาออก");
    if (form.status === "inactive" && form.end_date && form.end_date < form.start_date) errors.push("วันที่ลาออกต้องไม่ก่อนวันที่เริ่มงาน");
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
      position: form.position.trim(),
      department: form.department.trim() || null,
      salary_type: form.salary_type,
      base_salary: parseFloat(form.base_salary) || 0,
      bank_account: form.bank_account.trim() || null,
      start_date: form.start_date,
      status: form.status,
      end_date: form.status === "inactive" ? form.end_date || null : null,
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
      const { error } = await supabase.from("employees").update(payload).eq("id", form.id).eq("user_id", userId);
      if (error) {
        toast.error("บันทึกไม่สำเร็จ");
        setSaving(false);
        return;
      }
      const updated = employees.map((e) => (e.id === form.id ? { ...e, ...payload } as Employee : e));
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
        details: { field: "full_name", old_value: prevEmployee.full_name, new_value: form.full_name.trim() },
      });
    }
    if (prevEmployee.position !== form.position.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.POSITION_CHANGED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: { field: "position", old_value: prevEmployee.position, new_value: form.position.trim() },
      });
    }
    if ((prevEmployee.department ?? "") !== form.department.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: { field: "department", old_value: prevEmployee.department ?? "", new_value: form.department.trim() },
      });
    }
    if (prevEmployee.base_salary !== (parseFloat(form.base_salary) || 0)) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.SALARY_CHANGED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: { field: "base_salary", old_value: prevEmployee.base_salary, new_value: payload.base_salary },
      });
    }
    if ((prevEmployee.bank_account ?? "") !== form.bank_account.trim()) {
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: employeeId,
        details: { field: "bank_account", old_value: maskAccount(prevEmployee.bank_account ?? ""), new_value: maskAccount(form.bank_account.trim()) },
      });
    }
    if (prevEmployee.status !== form.status) {
      await logAuditEvent({
        action: form.status === "active" ? AUDIT_ACTIONS.EMPLOYEE_ACTIVATED : AUDIT_ACTIONS.EMPLOYEE_TERMINATED,
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
  }

  async function handleOffboard() {
    if (!offboardingEmployee || !userId) return;
    if (offboardingDate < offboardingEmployee.start_date) {
      toast.error("วันที่ลาออกต้องไม่ก่อนวันที่เริ่มงาน");
      return;
    }
    const { error } = await supabase
      .from("employees")
      .update({ status: "inactive", end_date: offboardingDate })
      .eq("id", offboardingEmployee.id)
      .eq("user_id", userId);
    if (error) {
      toast.error("ไม่สามารถบันทึกได้");
    } else {
      setEmployees((prev) => prev.map((e) => (e.id === offboardingEmployee.id ? { ...e, status: "inactive", end_date: offboardingDate } : e)));
      toast.success(`จบการจ้างงาน ${offboardingEmployee.full_name} แล้ว`);
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_TERMINATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: offboardingEmployee.id,
        details: { employee_code: offboardingEmployee.employee_code, end_date: offboardingDate },
      });
      setOffboardingEmployee(null);
    }
  }

  async function handleDelete() {
    if (!deletingEmployee) return;
    const emp = deletingEmployee;
    const { error } = await supabase.from("employees").delete().eq("id", emp.id);
    if (error) {
      toast.error("ไม่สามารถลบพนักงานได้");
    } else {
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
      toast.success("ลบพนักงานแล้ว");
      await logAuditEvent({
        action: AUDIT_ACTIONS.EMPLOYEE_TERMINATED,
        entity_type: AUDIT_ENTITY_TYPES.EMPLOYEE,
        entity_id: emp.id,
        details: { employee_code: emp.employee_code, full_name: emp.full_name },
      });
    }
    setDeletingEmployee(null);
  }

  function maskAccount(account: string): string {
    if (account.length <= 4) return account ? "•••" : "";
    return `•••-${account.slice(-4)}`;
  }

  return (
    <AppShell
      title="เงินเดือน > พนักงาน"
      breadcrumbs={[
        { label: "เงินเดือน", path: "/payroll" },
        { label: "พนักงาน" },
      ]}
      action={
        <Button size="sm" onClick={openCreate} className="!rounded-lg">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">เพิ่ม</span>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ค้นหาพนักงาน..."
            className="max-w-sm"
          />
          <div className="inline-flex rounded-lg border border-card-border bg-cool-25 p-0.5">
            {([["active", `ทำงาน (${activeCount})`], ["inactive", `ลาออก (${inactiveCount})`], ["all", "ทั้งหมด"]] as [EmployeeFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === key ? "bg-white text-cool-900 shadow-sm" : "text-cool-500 hover:text-cool-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="ยังไม่มีพนักงาน"
            description="เริ่มต้นด้วยการเพิ่มพนักงานคนแรก"
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4" /> เพิ่มพนักงาน
              </Button>
            }
          />
        ) : (
          <div className="bg-white border border-card-border rounded-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className={TABLE.table}>
                <thead>
                  <tr className={TABLE.theadTr}>
                    <th className={TABLE.thStatic}>รหัส</th>
                    <th className={TABLE.thStatic}>ชื่อ-นามสกุล</th>
                    <th className={TABLE.thStatic}>ตำแหน่ง</th>
                    <th className={TABLE.thStatic}>ประเภท</th>
                    <th className={`${TABLE.thStatic} text-right`}>เงินเดือน</th>
                    <th className={TABLE.thStatic}>สถานะ</th>
                    <th className={`${TABLE.thStatic} text-right`}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp) => (
                    <tr
                      key={emp.id}
                      onClick={() => openEdit(emp)}
                      className={`${TABLE.tbodyTr} cursor-pointer group hover:bg-cool-25/50 transition-colors ${emp.status === "inactive" ? "opacity-60" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <span className="text-cool-900 font-mono text-[11px]">{emp.employee_code}</span>
                      </td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <div className="flex flex-col">
                          <span className="text-cool-900 font-medium">{emp.full_name || "—"}</span>
                          {emp.department && <span className="text-cool-400 text-[10px]">{emp.department}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 min-w-[120px]">
                        <span className="text-cool-500">{emp.position || "—"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${
                            emp.salary_type === "monthly"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {emp.salary_type === "monthly" ? "รายเดือน" : "รายวัน"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-cool-900 tabular-nums font-medium">{formatCurrency(emp.base_salary)}</span>
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
                              onClick={(e) => { e.stopPropagation(); setOffboardingEmployee(emp); setOffboardingDate(new Date().toISOString().split("T")[0]); }}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-amber-50 text-cool-400 hover:text-amber-600 transition-colors opacity-0 group-hover:opacity-100"
                              title="จบการจ้างงาน"
                            >
                              <UserRoundX className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(emp); }}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-cool-25 text-cool-400 hover:text-cool-700 transition-colors"
                            title="แก้ไข"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingEmployee(emp); }}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 text-cool-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="ลบ"
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
          </div>
        )}
      </div>

      <Modal open={modal !== null} onClose={closeModal} title={title} size="xl">
        {modal && (
          <div className="space-y-5">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="เลขบัตรประชาชน / เลขผู้เสียภาษี"
                value={modal.form.tax_id}
                onChange={(e) => updateField("tax_id", e.target.value)}
                placeholder="0000000000000"
                maxLength={13}
              />
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
              <Input
                label="เลขบัญชีธนาคาร"
                value={modal.form.bank_account}
                onChange={(e) => updateField("bank_account", e.target.value)}
                placeholder="000-0-00000-0"
              />
            </div>

            <div className="border-t border-cool-100 pt-4">
              <div className="text-xs font-semibold text-cool-700 mb-3">ข้อมูลการจ้างงาน</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="ประเภทเงินเดือน"
                  value={modal.form.salary_type}
                  onChange={(e) => updateField("salary_type", e.target.value as "monthly" | "daily")}
                >
                  <option value="monthly">รายเดือน</option>
                  <option value="daily">รายวัน</option>
                </Select>
                <Input
                  label={modal.form.salary_type === "monthly" ? "เงินเดือน (บาท)" : "อัตรารายวัน (บาท)"}
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
                {modal.form.status === "inactive" && (
                  <Input
                    label="วันที่ลาออก"
                    type="date"
                    value={modal.form.end_date}
                    onChange={(e) => updateField("end_date", e.target.value)}
                  />
                )}
              </div>
            </div>

            {modal.mode === "edit" && (
              <div className="border-t border-cool-100 pt-4">
                <RecurringPanel employeeId={modal.form.id} />
              </div>
            )}

            {modal.mode === "edit" && (
              <div className="border-t border-cool-100 pt-4">
                <ActivityPanel entityType="employee" entityId={modal.form.id} />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={closeModal} className="flex-1" disabled={saving}>
                ยกเลิก
              </Button>
              <Button onClick={handleSave} className="flex-1" disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
         )}
      </Modal>

      <Modal open={offboardingEmployee !== null} onClose={() => setOffboardingEmployee(null)} title="จบการจ้างงาน">
        {offboardingEmployee && (
          <div className="space-y-4">
            <p className="text-sm text-cool-600">
              ยืนยันการจบการจ้างงาน <strong>{offboardingEmployee.full_name}</strong> (รหัส {offboardingEmployee.employee_code})
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                ข้อมูลในรอบเงินเดือนก่อนหน้าและสลิปเงินเดือนจะถูกเก็บไว้ตามเดิม พนักงานจะไม่แสดงในรอบเงินเดือนถัดไป
              </p>
            </div>
            <Input
              label="วันที่ลาออก"
              type="date"
              value={offboardingDate}
              onChange={(e) => setOffboardingDate(e.target.value)}
            />
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setOffboardingEmployee(null)} className="flex-1">
                ยกเลิก
              </Button>
              <Button variant="danger" onClick={handleOffboard} className="flex-1">
                จบการจ้างงาน
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={deletingEmployee !== null} onClose={() => setDeletingEmployee(null)} title="ลบพนักงาน">
        {deletingEmployee && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                ต้องการลบพนักงาน <strong>{deletingEmployee.full_name}</strong> ทั้งหมด? การดำเนินการนี้ไม่สามารถย้อนกลับได้
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setDeletingEmployee(null)} className="flex-1">
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
        <History className="w-4 h-4 text-cool-500" />
        <span className="text-xs font-semibold text-cool-700">ประวัติการเปลี่ยนแปลง</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-cool-400">
          <Spinner />
          <span className="text-xs">กำลังโหลด...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex items-center gap-2 text-cool-400">
          <History className="w-4 h-4" />
          <span className="text-xs">ไม่มีประวัติการเปลี่ยนแปลง</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 text-xs">
              <span className="text-base leading-none">{getActionIcon(log.action)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-cool-700">{getActionLabel(log.action)}</span>
                  <span className="text-cool-400">{formatAuditDetail(log)}</span>
                </div>
                <div className="text-cool-400 text-[10px]">{formatAuditTime(log.created_at)}</div>
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
    return () => { cancelled = true; };
  }, [employeeId]);

  async function addItem() {
    if (!workspaceUserId || busy) return;
    setBusy(true);
    const nextSort = items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1;
    const { data, error } = await supabase
      .from("payroll_recurring_items")
      .insert({ user_id: workspaceUserId, employee_id: employeeId, direction: "deduction", label: "", amount: 0, active: true, sort_order: nextSort })
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
          <Repeat className="w-4 h-4 text-cool-500" />
          <span className="text-xs font-semibold text-cool-700">รายการประจำ (เติมอัตโนมัติในรอบใหม่)</span>
        </div>
        <Button size="sm" variant="ghost" onClick={addItem} disabled={busy} className="!px-2 !py-1 !h-7">
          <Plus className="w-3 h-3" /> เพิ่ม
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-cool-400">
          <Spinner />
          <span className="text-xs">กำลังโหลด...</span>
        </div>
      ) : schemaMissing ? (
        <p className="text-xs text-amber-600 flex items-start gap-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          ฟีเจอร์นี้ต้องอัปเดตฐานข้อมูลก่อน (migration: payroll_recurring_items)
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-cool-400">
          เช่น ค่างวดรถ/บ้าน, เงินกู้สหกรณ์, ค่าอาหาร — รายการจะถูกเติมให้พนักงานคนนี้อัตโนมัติในทุกรอบใหม่
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[92px_1fr_96px_46px_32px] gap-2 text-[10px] text-cool-400 font-medium px-1">
            <span>ประเภท</span>
            <span>รายการ</span>
            <span className="text-right">จำนวน (฿)</span>
            <span>ใช้งาน</span>
            <span></span>
          </div>
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-[92px_1fr_96px_46px_32px] gap-2 items-center">
              <Select
                value={item.direction}
                onChange={(e) => patchItem(item.id, { direction: e.target.value as "addition" | "deduction" })}
                className="!h-8 !text-[11px]"
                disabled={busy}
              >
                <option value="addition">เงินเพิ่ม</option>
                <option value="deduction">เงินหัก</option>
              </Select>
              <Input
                value={item.label}
                onChange={(e) => patchItem(item.id, { label: e.target.value })}
                placeholder="เช่น เงินกู้ยืมสหกรณ์"
                className="!h-8 !text-[11px]"
                disabled={busy}
              />
              <Input
                type="number"
                min="0"
                value={item.amount ?? ""}
                onChange={(e) => patchItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                placeholder="฿"
                className="!h-8 !text-[11px] text-right"
                disabled={busy}
              />
              <button
                onClick={() => patchItem(item.id, { active: !item.active })}
                aria-label={item.active ? "ปิดการใช้งาน" : "เปิดการใช้งาน"}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${item.active ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-cool-25 text-cool-300 hover:text-cool-500"}`}
                title={item.active ? "กำลังใช้งาน" : "ปิดไว้"}
              >
                {item.active ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => removeItem(item.id)}
                disabled={busy}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 text-cool-400 hover:text-red-500 transition-colors"
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