import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, Plus, Users, Wallet, Receipt, Banknote, Copy, Check, AlertCircle, CheckCircle2, Clock, Sparkles, X, Pencil } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Input";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Spinner } from "../../../components/ui/Spinner";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Modal";
import { TABLE } from "../../../lib/tableStyles";
import { formatCurrency } from "../../../lib/format";
import { supabase } from "../../../lib/supabase";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { calculateBreakdown, type PayrollSettings } from "../../../lib/payroll/calculations";
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../../lib/payroll/audit";
import type { Employee, PayrollRun, PayrollLineItem, OtEntry } from "../../../types";

const MONTHS = [
  { value: 1, label: "มกราคม" },
  { value: 2, label: "กุมภาพันธ์" },
  { value: 3, label: "มีนาคม" },
  { value: 4, label: "เมษายน" },
  { value: 5, label: "พฤษภาคม" },
  { value: 6, label: "มิถุนายน" },
  { value: 7, label: "กรกฎาคม" },
  { value: 8, label: "สิงหาคม" },
  { value: 9, label: "กันยายน" },
  { value: 10, label: "ตุลาคม" },
  { value: 11, label: "พฤศจิกายน" },
  { value: 12, label: "ธันวาคม" },
];

type RowStatus = "complete" | "warning" | "incomplete";

function createEmptyLineItem(runId: string, employeeId: string): PayrollLineItem {
  return {
    id: "",
    payroll_run_id: runId,
    employee_id: employeeId,
    days_worked: null,
    ot_entries: [],
    additions: [],
    deductions: [],
    gross_pay: null,
    sso_employee: null,
    sso_employer: null,
    withholding_tax: null,
    net_pay: null,
    employee_code_snapshot: null,
    full_name_snapshot: null,
    position_snapshot: null,
    salary_type_snapshot: null,
    base_salary_snapshot: null,
  };
}

function getPayrollPeriod(month: number, year: number) {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart, periodEnd };
}

function getRowStatus(employee: Employee, item: PayrollLineItem): RowStatus {
  const hasOT = item.ot_entries.length > 0;
  const hasData = item.days_worked !== null || hasOT || item.additions.length > 0 || item.deductions.length > 0;

  if (employee.salary_type === "daily" && !item.days_worked) return "incomplete";
  if (hasOT && item.ot_entries.some((entry) => Number(entry.hours) <= 0 || Number(entry.multiplier) <= 0)) return "warning";
  if (item.additions.some((entry) => !entry.label.trim() || Number(entry.amount) < 0)) return "warning";
  if (item.deductions.some((entry) => !entry.label.trim() || Number(entry.amount) < 0)) return "warning";
  if (!hasData && employee.salary_type === "daily") return "incomplete";
  return "complete";
}

export default function PayrollPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { workspaceUserId } = useWorkspaceRole();
  const userId = workspaceUserId;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [payDate, setPayDate] = useState(now.toISOString().split("T")[0]);

  const [run, setRun] = useState<PayrollRun | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [excludedEmployeeCount, setExcludedEmployeeCount] = useState(0);
  const [lineItems, setLineItems] = useState<Map<string, PayrollLineItem>>(new Map());
  const [settings, setSettings] = useState<PayrollSettings>({ ot_divisor: 30, normal_ot_multiplier: 1.5, holiday_ot_multiplier: 3.0 });
  const [loading, setLoading] = useState(true);
  const [printEmployee, setPrintEmployee] = useState<Employee | null>(null);
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [copyingPrevious, setCopyingPrevious] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const { periodStart, periodEnd } = getPayrollPeriod(month, year);
    const [{ data: runData }, { data: empData }, { data: settingsData }] = await Promise.all([
      supabase.from("payroll_runs").select("*").eq("user_id", userId).eq("period_month", month).eq("period_year", year).maybeSingle(),
      supabase.from("employees").select("*").lte("start_date", periodEnd).or(`end_date.is.null,end_date.gte.${periodStart}`).order("employee_code"),
      supabase.from("client_payroll_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    if (settingsData) {
      setSettings({
        ot_divisor: settingsData.ot_divisor,
        normal_ot_multiplier: settingsData.normal_ot_multiplier,
        holiday_ot_multiplier: settingsData.holiday_ot_multiplier,
      });
    }

    const eligibleEmployees = (empData ?? []) as Employee[];
    setEmployees(eligibleEmployees);
    const { count } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    setExcludedEmployeeCount(Math.max(0, (count ?? 0) - eligibleEmployees.length));

    if (runData) {
      setRun(runData as PayrollRun);
      setPayDate((runData as PayrollRun).pay_date);

      const { data: itemsData } = await supabase
        .from("payroll_line_items")
        .select("*")
        .eq("payroll_run_id", runData.id);

      const itemMap = new Map<string, PayrollLineItem>();
      (itemsData ?? []).forEach((item) => {
        itemMap.set(item.employee_id, item as PayrollLineItem);
      });
      setLineItems(itemMap);
    } else {
      setRun(null);
      setLineItems(new Map());
    }

    setLoading(false);
  }, [userId, month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateRun() {
    if (!userId) return;
    const { data: existing } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle();

    if (existing) {
      setRun(existing as PayrollRun);
      fetchData();
      return;
    }

    const { data, error } = await supabase
      .from("payroll_runs")
      .insert({ user_id: userId, period_month: month, period_year: year, pay_date: payDate, status: "draft" })
      .select("*")
      .single();

    if (error) {
      toast.error("ไม่สามารถสร้างรอบเงินเดือนได้");
    } else {
      setRun(data as PayrollRun);
      toast.success("สร้างรอบเงินเดือนแล้ว");
      fetchData();
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_RUN_CREATED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: data.id,
        details: { period_month: month, period_year: year },
      });
    }
  }

  async function handleFinalize() {
    if (!run || !userId) return;

    const incompleteEmployees = employees.filter((employee) => getRowStatus(employee, getLineItem(employee.id)) !== "complete");
    if (incompleteEmployees.length > 0) {
      toast.error(`กรุณาตรวจสอบข้อมูลพนักงาน ${incompleteEmployees.length} คนก่อนปิดรอบ`);
      setShowFinalizeModal(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const updates: Record<string, unknown> = {
      status: "finalized",
      finalized_at: new Date().toISOString(),
      finalized_by: authData.user?.id ?? null,
    };
    const { error } = await supabase.from("payroll_runs").update(updates).eq("id", run.id).eq("user_id", userId);

    if (error) {
      toast.error("ไม่สามารถปิดรอบได้");
    } else {
      setRun((prev) => (prev ? { ...prev, status: "finalized" } : null));
      setShowFinalizeModal(false);
      toast.success("ปิดรอบเงินเดือนแล้ว");
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_RUN_FINALIZED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: run.id,
        details: { employee_count: employees.length, total_net: totals.net },
      });
    }
  }

  async function handleReopen() {
    if (!run || !userId) return;
    if (!confirm("ต้องการเปิดรอบใหม่? ข้อมูลเดิมจะถูกเก็บไว้และสามารถแก้ไขได้")) return;

    const { error } = await supabase.from("payroll_runs").update({ status: "draft" }).eq("id", run.id).eq("user_id", userId);
    if (error) {
      toast.error("ไม่สามารถเปิดรอบใหม่ได้");
    } else {
      setRun((prev) => (prev ? { ...prev, status: "draft", revision: (prev.revision ?? 1) + 1 } : null));
      toast.success("เปิดรอบใหม่แล้ว");
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_RUN_REOPENED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: run.id,
        details: {},
      });
    }
  }

  async function handleSaveLineItem(employeeId: string, item: PayrollLineItem): Promise<boolean> {
    if (!run || !userId) return false;

    const { data: existing } = await supabase
      .from("payroll_line_items")
      .select("*")
      .eq("payroll_run_id", run.id)
      .eq("employee_id", employeeId)
      .maybeSingle();

    const { id: _id, ...itemWithoutId } = item;
    const employee = employees.find((entry) => entry.id === employeeId);
    const calculated = employee ? calcLineItem(employee, item) : null;
    const payload = {
      ...itemWithoutId,
      payroll_run_id: run.id,
      employee_id: employeeId,
      employee_code_snapshot: employee?.employee_code ?? null,
      full_name_snapshot: employee?.full_name ?? null,
      position_snapshot: employee?.position ?? null,
      salary_type_snapshot: employee?.salary_type ?? null,
      base_salary_snapshot: employee?.base_salary ?? null,
      ...(calculated
        ? {
            gross_pay: calculated.gross_pay,
            sso_employee: calculated.sso_employee,
            sso_employer: calculated.sso_employer,
            withholding_tax: calculated.withholding_tax,
            net_pay: calculated.net_pay,
          }
        : {}),
    };

    const { error } = existing
      ? await supabase.from("payroll_line_items").update(payload).eq("id", existing.id)
      : await supabase.from("payroll_line_items").insert(payload);

    if (error) {
      toast.error("บันทึกไม่สำเร็จ");
      return false;
    } else {
      const savedItem = calculated
        ? { ...item, ...calculated }
        : item;
      setLineItems((prev) => {
        const next = new Map(prev);
        next.set(employeeId, savedItem);
        return next;
      });
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_INPUT_CHANGED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: run.id,
        details: {
          employee_id: employeeId,
          previous: existing ? {
            days_worked: existing.days_worked,
            ot_entries: existing.ot_entries,
            additions: existing.additions,
            deductions: existing.deductions,
          } : null,
          next: {
            days_worked: item.days_worked,
            ot_entries: item.ot_entries,
            additions: item.additions,
            deductions: item.deductions,
          },
        },
      });
      return true;
    }
  }

  async function handleCopyFromPrevious() {
    if (!run || !userId || !employees.length) return;
    setCopyingPrevious(true);

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const { data: prevRun } = await supabase
      .from("payroll_runs")
      .select("id")
      .eq("user_id", userId)
      .eq("period_month", prevMonth)
      .eq("period_year", prevYear)
      .maybeSingle();

    if (!prevRun) {
      toast.error("ไม่พบรอบเงินเดือนก่อนหน้า");
      setCopyingPrevious(false);
      return;
    }

    const { data: prevItems } = await supabase
      .from("payroll_line_items")
      .select("*")
      .eq("payroll_run_id", prevRun.id);

    if (!prevItems || prevItems.length === 0) {
      toast.error("ไม่มีข้อมูลในรอบก่อนหน้า");
      setCopyingPrevious(false);
      return;
    }

    let copied = 0;
    for (const emp of employees) {
      const prevItem = prevItems.find((pi) => pi.employee_id === emp.id);
      if (prevItem) {
        const { id: _id, payroll_run_id: _rid, ...rest } = prevItem;
        await handleSaveLineItem(emp.id, rest as PayrollLineItem);
        copied++;
      }
    }

    toast.success(`คัดลอกข้อมูล ${copied} คนจากรอบก่อนหน้า`);
    setCopyingPrevious(false);
    fetchData();
  }

  function getLineItem(employeeId: string): PayrollLineItem {
    const existing = lineItems.get(employeeId);
    if (existing) return existing;
    return createEmptyLineItem(run?.id ?? "", employeeId);
  }

  function calcLineItem(employee: Employee, item: PayrollLineItem) {
    return calculateBreakdown(
      {
        salary_type: employee.salary_type,
        base_salary: employee.base_salary,
        days_worked: item.days_worked,
        ot_entries: item.ot_entries,
        additions: item.additions,
        deductions: item.deductions,
      },
      settings,
      month
    );
  }

  const totals = employees.reduce(
    (acc, emp) => {
      const item = getLineItem(emp.id);
      const calc = calcLineItem(emp, item);
      return {
        base: acc.base + calc.base_pay,
        ot: acc.ot + calc.ot_pay,
        additions: acc.additions + calc.additions_total,
        deductions: acc.deductions + calc.deductions_total,
        gross: acc.gross + calc.gross_pay,
        sso: acc.sso + calc.sso_employee,
        ssoEmp: acc.ssoEmp + calc.sso_employer,
        wht: acc.wht + calc.withholding_tax,
        net: acc.net + calc.net_pay,
      };
    },
    { base: 0, ot: 0, additions: 0, deductions: 0, gross: 0, sso: 0, ssoEmp: 0, wht: 0, net: 0 }
  );

  const completedCount = employees.filter((emp) => {
    const item = getLineItem(emp.id);
    return getRowStatus(emp, item) === "complete";
  }).length;
  const incompleteEmployees = employees.filter((emp) => getRowStatus(emp, getLineItem(emp.id)) !== "complete");

  const progressPercent = employees.length > 0 ? Math.round((completedCount / employees.length) * 100) : 0;

  if (printEmployee) {
    return <PayslipView employee={printEmployee} run={run} lineItem={getLineItem(printEmployee.id)} settings={settings} onBack={() => setPrintEmployee(null)} onPrint={() => {
      logAuditEvent({
        action: AUDIT_ACTIONS.PAYSLIP_PRINTED,
        entity_type: AUDIT_ENTITY_TYPES.PAYSLIP,
        entity_id: printEmployee.id,
        details: { employee_name: printEmployee.full_name, run_id: run?.id },
      });
    }} />;
  }

  const detailItem = detailEmployee ? getLineItem(detailEmployee.id) : null;

  return (
    <AppShell
      title="เงินเดือน"
      breadcrumbs={[
        { label: "เงินเดือน", path: "/payroll" },
        { label: "พนักงาน", path: "/payroll/employees" },
      ]}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate("/payroll/employees")} className="!rounded-lg">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">พนักงาน</span>
          </Button>
          {run?.status === "draft" && (
            <Button size="sm" onClick={() => setShowFinalizeModal(true)} className="!rounded-lg" disabled={employees.length === 0 || incompleteEmployees.length > 0}>
              ปิดรอบ
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <Select label="เดือน" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-[140px]">
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
            <Select label="ปี" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-[100px]">
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y + 543}</option>
              ))}
            </Select>
            <Input label="วันจ่าย" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-[160px]" />
            <div className="flex-1" />
            {run && (
              <StatusBadge
                tone={run.status === "finalized" ? "green" : "amber"}
                label={run.status === "finalized" ? "ปิดรอบ" : "ร่าง"}
              />
            )}
          </div>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : !run ? (
          <div className="bg-white border border-card-border rounded-card p-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center mb-4">
              <Wallet className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-cool-900 mb-2">เริ่มต้นรอบเงินเดือน</h3>
            <p className="text-sm text-cool-500 mb-6 max-w-sm mx-auto">
              สร้างรอบเงินเดือนสำหรับ <strong>{MONTHS[month - 1].label} {year + 543}</strong> เพื่อเริ่มกรอกข้อมูลเงินเดือนพนักงาน
            </p>
            <Button onClick={handleCreateRun}>
              <Plus className="w-4 h-4" /> สร้างรอบเงินเดือน
            </Button>
          </div>
        ) : (
          <>
            {run.status === "finalized" && (
              <div className="bg-green-50 border border-green-200 rounded-card p-4 transition-all duration-300">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium">
                    ปิดรอบแล้ว — {MONTHS[run.period_month - 1].label} {run.period_year + 543} · วันจ่าย {run.pay_date}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-[11px] text-green-600 font-medium">ค่าแรงรวม</div>
                    <div className="text-sm font-semibold text-green-900 tabular-nums">฿{formatCurrency(totals.gross)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-green-600 font-medium">ประกันสังคม</div>
                    <div className="text-sm font-semibold text-green-900 tabular-nums">฿{formatCurrency(totals.sso)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-green-600 font-medium">ภาษีหัก ณ ที่จ่าย</div>
                    <div className="text-sm font-semibold text-green-900 tabular-nums">฿{formatCurrency(totals.wht)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-green-600 font-medium">เงินเดือนสุทธิ</div>
                    <div className="text-sm font-bold text-green-900 tabular-nums">฿{formatCurrency(totals.net)}</div>
                  </div>
                </div>
              </div>
            )}

            {run.status === "draft" && employees.length > 0 && (
              <div className="bg-white border border-card-border rounded-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cool-400" />
                    <span className="text-xs font-medium text-cool-600">ความคืบหน้า</span>
                  </div>
                  <span className="text-xs font-semibold text-cool-700">{completedCount} / {employees.length} คน</span>
                </div>
                <div className="w-full h-2 bg-cool-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary-deep rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {completedCount === employees.length && (
                  <div className="mt-2 flex items-center gap-1 text-green-600">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">กรอกครบทุกคนแล้ว — พร้อมปิดรอบ!</span>
                  </div>
                )}
              </div>
            )}

            {excludedEmployeeCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  ไม่รวมพนักงาน {excludedEmployeeCount} คน เนื่องจากวันที่เริ่มงานหรือวันที่สิ้นสุดการจ้างงานไม่อยู่ในรอบนี้
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <SummaryCard icon={<Users className="w-4 h-4" />} label="พนักงาน" value={`${employees.length} คน`} />
              <SummaryCard icon={<Wallet className="w-4 h-4" />} label="ค่าแรงรวม" value={`฿${formatCurrency(totals.gross)}`} />
              <SummaryCard icon={<Receipt className="w-4 h-4" />} label="หักรวม" value={`฿${formatCurrency(totals.sso + totals.wht)}`} />
              <SummaryCard icon={<Receipt className="w-4 h-4" />} label="ต้นทุนนายจ้าง" value={`฿${formatCurrency(totals.gross + totals.ssoEmp)}`} />
              <SummaryCard icon={<Banknote className="w-4 h-4" />} label="สุทธิ" value={`฿${formatCurrency(totals.net)}`} highlight />
            </div>

            {run.status === "draft" && employees.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={handleCopyFromPrevious} disabled={copyingPrevious} className="!text-xs">
                  <Copy className="w-3.5 h-3.5" />
                  {copyingPrevious ? "กำลังคัดลอก..." : "คัดลอกจากรอบก่อนหน้า"}
                </Button>
              </div>
            )}

            <div className="bg-white border border-card-border rounded-card overflow-hidden" ref={tableRef}>
              <div className="overflow-x-auto">
                <table className={TABLE.table}>
                  <thead>
                    <tr className={TABLE.theadTr}>
                      {run.status === "draft" && <th className={`${TABLE.thStatic} w-8`}></th>}
                      <th className={TABLE.thStatic}>พนักงาน</th>
                      {run.status === "draft" ? (
                        <>
                          <th className={`${TABLE.thStatic} text-right`}>ฐานเงินเดือน</th>
                          <th className={`${TABLE.thStatic} text-right`}>OT</th>
                          <th className={`${TABLE.thStatic} text-right`}>เงินเพิ่ม</th>
                          <th className={`${TABLE.thStatic} text-right`}>เงินหัก</th>
                        </>
                      ) : (
                        <>
                          <th className={`${TABLE.thStatic} text-right`}>ค่าแรงรวม</th>
                          <th className={`${TABLE.thStatic} text-right`}>SSO (พนักงาน)</th>
                          <th className={`${TABLE.thStatic} text-right`}>SSO (นายจ้าง)</th>
                          <th className={`${TABLE.thStatic} text-right`}>ภาษี</th>
                        </>
                      )}
                      <th className={`${TABLE.thStatic} text-right`}>สุทธิ</th>
                      <th className={`${TABLE.thStatic} w-20`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => {
                      const item = getLineItem(emp.id);
                      const calc = calcLineItem(emp, item);
                      const rowStatus = getRowStatus(emp, item);
                      return (
                        <PayrollRow
                          key={emp.id}
                          employee={emp}
                          calc={calc}
                          status={run.status}
                          rowStatus={rowStatus}
                          onOpenDetails={() => setDetailEmployee(emp)}
                          onPrint={() => setPrintEmployee(emp)}
                        />
                      );
                    })}
                  </tbody>
                  {run.status === "draft" ? (
                    <tfoot>
                      <tr className={TABLE.tfootTr}>
                        <td></td>
                        <td>รวมโดยประมาณ</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.base)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.ot)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.additions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.deductions)}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">฿{formatCurrency(totals.net)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  ) : (
                  run.status === "finalized" && (
                    <tfoot>
                      <tr className={TABLE.tfootTr}>
                        <td>รวม</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.gross)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.sso)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.ssoEmp)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">฿{formatCurrency(totals.wht)}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">฿{formatCurrency(totals.net)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  ))}
                </table>
              </div>
            </div>

            {run.status === "finalized" && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleReopen} className="flex-1">
                  เปิดรอบใหม่
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {detailEmployee && detailItem && (
        <PayrollDetailModal
          employee={detailEmployee}
          run={run}
          initialItem={detailItem}
          settings={settings}
          month={month}
          readOnly={run?.status === "finalized"}
          onSave={async (item) => {
            const ok = await handleSaveLineItem(detailEmployee.id, item);
            if (ok) {
              setDetailEmployee(null);
            }
            return ok;
          }}
          onPrint={() => setPrintEmployee(detailEmployee)}
          onClose={() => setDetailEmployee(null)}
        />
      )}

      <Modal open={showFinalizeModal} onClose={() => setShowFinalizeModal(false)} title="ยืนยันปิดรอบเงินเดือน">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              เมื่อปิดรอบแล้ว จะไม่สามารถแก้ไขข้อมูลได้อีก คุณต้องการดำเนินการต่อหรือไม่?
            </p>
          </div>
          {incompleteEmployees.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-800">
                <AlertCircle className="w-4 h-4" />
                ต้องตรวจสอบข้อมูล {incompleteEmployees.length} คนก่อนปิดรอบ
              </div>
              <div className="mt-2 text-xs text-red-700">
                {incompleteEmployees.slice(0, 5).map((employee) => employee.full_name || employee.employee_code).join(", ")}
                {incompleteEmployees.length > 5 ? " และรายการอื่นๆ" : ""}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-cool-25 rounded-lg p-3">
              <div className="text-[11px] text-cool-500">ค่าแรงรวม</div>
              <div className="text-sm font-bold text-cool-900 tabular-nums">฿{formatCurrency(totals.gross)}</div>
            </div>
            <div className="bg-cool-25 rounded-lg p-3">
              <div className="text-[11px] text-cool-500">หักรวม</div>
              <div className="text-sm font-bold text-cool-900 tabular-nums">฿{formatCurrency(totals.sso + totals.wht)}</div>
            </div>
            <div className="bg-cool-25 rounded-lg p-3">
              <div className="text-[11px] text-cool-500">จำนวนพนักงาน</div>
              <div className="text-sm font-bold text-cool-900 tabular-nums">{employees.length} คน</div>
            </div>
            <div className="bg-primary-soft rounded-lg p-3">
              <div className="text-[11px] text-primary-deep">เงินเดือนสุทธิ</div>
              <div className="text-sm font-bold text-primary-deep tabular-nums">฿{formatCurrency(totals.net)}</div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowFinalizeModal(false)} className="flex-1">
              ยกเลิก
            </Button>
            <Button onClick={handleFinalize} className="flex-1" disabled={incompleteEmployees.length > 0}>
              ยืนยันปิดรอบ
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}

function SummaryCard({ icon, label, value, highlight }: SummaryCardProps) {
  return (
    <div className={`rounded-card border p-3 transition-all duration-200 hover:shadow-sm ${highlight ? "bg-primary-soft border-primary/20" : "bg-white border-card-border"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={highlight ? "text-primary" : "text-cool-400"}>{icon}</span>
        <span className="text-[11px] font-medium text-cool-500">{label}</span>
      </div>
      <div className={`text-base font-bold tabular-nums ${highlight ? "text-primary-deep" : "text-cool-900"}`}>{value}</div>
    </div>
  );
}

interface PayrollRowProps {
  employee: Employee;
  calc: {
    base_pay: number;
    ot_pay: number;
    additions_total: number;
    deductions_total: number;
    gross_pay: number;
    sso_employee: number;
    sso_employer: number;
    withholding_tax: number;
    net_pay: number;
  };
  status: "draft" | "finalized";
  rowStatus: RowStatus;
  onOpenDetails: () => void;
  onPrint: () => void;
}

function PayrollRow({ employee, calc, status, rowStatus, onOpenDetails, onPrint }: PayrollRowProps) {
  const statusColors = {
    complete: "border-l-green-500",
    warning: "border-l-amber-400",
    incomplete: "border-l-cool-200",
  };

  return (
    <tr
      onClick={onOpenDetails}
      className={`${TABLE.tbodyTr} group hover:bg-cool-25/50 transition-colors duration-150 border-l-4 cursor-pointer ${statusColors[rowStatus]}`}
    >
      {status === "draft" && (
        <td className="px-2 py-2">
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-cool-25 text-cool-400 hover:text-cool-700 transition-colors"
            title="ดูรายละเอียด"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <span className="text-cool-900 font-medium">{employee.full_name}</span>
          <span className="text-cool-400 text-[10px]">{employee.employee_code} · {employee.position}</span>
        </div>
      </td>
      {status === "draft" ? (
        <>
          <td className="px-3 py-2 text-right">
            <span className="text-cool-700 tabular-nums">฿{formatCurrency(calc.base_pay)}</span>
          </td>
          <td className="px-3 py-2 text-right">
            <span className="text-cool-700 tabular-nums">฿{formatCurrency(calc.ot_pay)}</span>
          </td>
          <td className="px-3 py-2 text-right">
            <span className="text-green-600 tabular-nums">฿{formatCurrency(calc.additions_total)}</span>
          </td>
          <td className="px-3 py-2 text-right">
            <span className="text-red-500 tabular-nums">฿{formatCurrency(calc.deductions_total)}</span>
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2 text-right">
            <span className="text-cool-900 tabular-nums font-medium">฿{formatCurrency(calc.gross_pay)}</span>
          </td>
          <td className="px-3 py-2 text-right">
            <span className="text-cool-400 tabular-nums">฿{formatCurrency(calc.sso_employee)}</span>
          </td>
          <td className="px-3 py-2 text-right">
            <span className="text-cool-400 tabular-nums">฿{formatCurrency(calc.sso_employer)}</span>
          </td>
          <td className="px-3 py-2 text-right">
            <span className="text-cool-400 tabular-nums">฿{formatCurrency(calc.withholding_tax)}</span>
          </td>
        </>
      )}
      <td className="px-3 py-2 text-right">
        <span className="text-cool-900 font-bold tabular-nums">฿{formatCurrency(calc.net_pay)}</span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1 justify-end">
          {status === "finalized" && (
            <button
              onClick={(e) => { e.stopPropagation(); onPrint(); }}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-cool-25 text-cool-400 hover:text-cool-700 transition-colors"
              title="พิมพ์สลิป"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

interface PayrollDetailModalProps {
  employee: Employee;
  run: PayrollRun | null;
  initialItem: PayrollLineItem;
  settings: PayrollSettings;
  month: number;
  readOnly: boolean;
  onSave: (item: PayrollLineItem) => Promise<boolean>;
  onPrint: () => void;
  onClose: () => void;
}

function PayrollDetailModal({ employee, run, initialItem, settings, month, readOnly, onSave, onPrint, onClose }: PayrollDetailModalProps) {
  const [localItem, setLocalItem] = useState<PayrollLineItem>(initialItem);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateLocal(updated: Partial<PayrollLineItem>) {
    setLocalItem((prev) => ({ ...prev, ...updated }));
    setDirty(true);
  }

  function addOT() {
    const newOt: OtEntry = { hours: 0, type: "normal", multiplier: settings.normal_ot_multiplier };
    updateLocal({ ot_entries: [...localItem.ot_entries, newOt] });
  }

  function removeOT(index: number) {
    const ot = [...localItem.ot_entries];
    ot.splice(index, 1);
    updateLocal({ ot_entries: ot });
  }

  function updateOT(index: number, field: keyof OtEntry, value: string | number) {
    const ot = [...localItem.ot_entries];
    ot[index] = { ...ot[index], [field]: value };
    updateLocal({ ot_entries: ot });
  }

  function addAddition() {
    updateLocal({ additions: [...localItem.additions, { label: "", amount: 0 }] });
  }

  function removeAddition(index: number) {
    const add = [...localItem.additions];
    add.splice(index, 1);
    updateLocal({ additions: add });
  }

  function updateAddition(index: number, field: "label" | "amount", value: string | number) {
    const add = [...localItem.additions];
    add[index] = { ...add[index], [field]: value };
    updateLocal({ additions: add });
  }

  function addDeduction() {
    updateLocal({ deductions: [...localItem.deductions, { label: "", amount: 0 }] });
  }

  function removeDeduction(index: number) {
    const ded = [...localItem.deductions];
    ded.splice(index, 1);
    updateLocal({ deductions: ded });
  }

  function updateDeduction(index: number, field: "label" | "amount", value: string | number) {
    const ded = [...localItem.deductions];
    ded[index] = { ...ded[index], [field]: value };
    updateLocal({ deductions: ded });
  }

  function requestClose() {
    if (dirty && !readOnly) {
      if (!confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการยกเลิกหรือไม่?")) return;
    }
    onClose();
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(localItem);
    setSaving(false);
    if (ok) setDirty(false);
  }

  const hourlyRate = employee.base_salary / settings.ot_divisor / 8;

  return (
    <Modal open={true} onClose={requestClose} size="xl" title={`รายละเอียดเงินเดือน — ${employee.full_name}`}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-card-border bg-cool-25/40 p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="text-cool-400 text-xs block">รหัสพนักงาน</span>
              <span className="text-cool-700 font-mono text-[11px]">{employee.employee_code}</span>
            </div>
            <div>
              <span className="text-cool-400 text-xs block">ตำแหน่ง</span>
              <span className="text-cool-700">{employee.position || "—"}</span>
            </div>
            <div>
              <span className="text-cool-400 text-xs block">ประเภท</span>
              <span className="text-cool-700">{employee.salary_type === "monthly" ? "รายเดือน" : "รายวัน"}</span>
            </div>
            <div>
              <span className="text-cool-400 text-xs block">ฐานเงินเดือน</span>
              <span className="text-cool-700 tabular-nums">฿{formatCurrency(employee.base_salary)}</span>
            </div>
          </div>
          <StatusBadge
            tone={readOnly ? "green" : "amber"}
            label={readOnly ? "ปิดรอบ" : "ร่าง"}
          />
        </div>

        {employee.salary_type === "daily" && (
          <div className="max-w-[220px]">
            <Input
              label="วันทำงาน"
              type="number"
              value={localItem.days_worked ?? ""}
              onChange={(e) => updateLocal({ days_worked: parseFloat(e.target.value) || 0 })}
              placeholder="0"
              disabled={readOnly}
            />
          </div>
        )}

        <PayrollEditableSections
          localItem={localItem}
          hourlyRate={hourlyRate}
          readOnly={readOnly}
          employee={employee}
          onUpdateLocal={updateLocal}
          addOT={addOT}
          removeOT={removeOT}
          updateOT={updateOT}
          addAddition={addAddition}
          removeAddition={removeAddition}
          updateAddition={updateAddition}
          addDeduction={addDeduction}
          removeDeduction={removeDeduction}
          updateDeduction={updateDeduction}
        />

        <CalculationBreakdown employee={employee} lineItem={localItem} settings={settings} month={month} />

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {readOnly ? (
            <>
              <Button variant="secondary" onClick={requestClose} className="flex-1">ปิด</Button>
              <Button onClick={onPrint} className="flex-1">
                <Printer className="w-4 h-4" /> พิมพ์สลิป
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={requestClose} className="flex-1" disabled={saving}>ยกเลิก</Button>
              <Button onClick={handleSave} className="flex-1" disabled={saving}>
                {saving ? (
                  <span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> กำลังบันทึก...</span>
                ) : (
                  <span className="flex items-center gap-1"><Check className="w-4 h-4" /> บันทึก</span>
                )}
              </Button>
            </>
          )}
        </div>

        {dirty && !readOnly && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> ยังไม่ได้บันทึกการเปลี่ยนแปลง
          </p>
        )}
      </div>
    </Modal>
  );
}

interface EditableSectionsProps {
  localItem: PayrollLineItem;
  hourlyRate: number;
  readOnly: boolean;
  employee: Employee;
  onUpdateLocal: (updated: Partial<PayrollLineItem>) => void;
  addOT: () => void;
  removeOT: (index: number) => void;
  updateOT: (index: number, field: keyof OtEntry, value: string | number) => void;
  addAddition: () => void;
  removeAddition: (index: number) => void;
  updateAddition: (index: number, field: "label" | "amount", value: string | number) => void;
  addDeduction: () => void;
  removeDeduction: (index: number) => void;
  updateDeduction: (index: number, field: "label" | "amount", value: string | number) => void;
}

function PayrollEditableSections({
  localItem,
  hourlyRate,
  readOnly,
  addOT,
  removeOT,
  updateOT,
  addAddition,
  removeAddition,
  updateAddition,
  addDeduction,
  removeDeduction,
  updateDeduction,
}: EditableSectionsProps) {
  const hasOT = localItem.ot_entries.length > 0;
  const hasAdditions = localItem.additions.length > 0;
  const hasDeductions = localItem.deductions.length > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-card-border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-cool-700">OT (ล่วงเวลา)</span>
            {hasOT && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-medium">{localItem.ot_entries.length} รายการ</span>}
          </div>
          {!readOnly && (
            <Button size="sm" variant="ghost" onClick={addOT} className="!px-2 !py-1 !h-7">
              <Plus className="w-3 h-3" /> เพิ่ม
            </Button>
          )}
        </div>
        {hasOT && (
          <div className="space-y-2">
            <div className="grid grid-cols-[80px_100px_70px_80px_auto] gap-2 text-[10px] text-cool-400 font-medium px-1">
              <span>ชั่วโมง</span>
              <span>ประเภท</span>
              <span>อัตราคูณ</span>
              <span className="text-right">เงิน</span>
              {!readOnly && <span></span>}
            </div>
            {localItem.ot_entries.map((ot, i) => {
              const otPay = Number(ot.hours) * hourlyRate * Number(ot.multiplier);
              return (
                <div key={i} className="grid grid-cols-[80px_100px_70px_80px_auto] gap-2 items-center">
                  <Input
                    type="number"
                    value={ot.hours ?? ""}
                    onChange={(e) => updateOT(i, "hours", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="!h-8 !text-[11px]"
                    disabled={readOnly}
                  />
                  <Select
                    value={ot.type}
                    onChange={(e) => updateOT(i, "type", e.target.value)}
                    className="!h-8 !text-[11px]"
                    disabled={readOnly}
                  >
                    <option value="normal">ปกติ (1.5×)</option>
                    <option value="holiday">วันหยุด (3×)</option>
                  </Select>
                  <Input
                    type="number"
                    value={ot.multiplier ?? ""}
                    onChange={(e) => updateOT(i, "multiplier", parseFloat(e.target.value) || 0)}
                    placeholder="×"
                    className="!h-8 !text-[11px]"
                    disabled={readOnly}
                  />
                  <span className="text-right text-[11px] font-medium text-cool-700 tabular-nums">฿{formatCurrency(otPay)}</span>
                  {!readOnly && (
                    <button
                      onClick={() => removeOT(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-red-50 text-cool-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!hasOT && (
          <p className="text-xs text-cool-400">ยังไม่มีรายการ OT</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-card-border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-cool-700">เงินเพิ่ม</span>
              {hasAdditions && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md font-medium">{localItem.additions.length} รายการ</span>}
            </div>
            {!readOnly && (
              <Button size="sm" variant="ghost" onClick={addAddition} className="!px-2 !py-1 !h-7">
                <Plus className="w-3 h-3" />
              </Button>
            )}
          </div>
          {hasAdditions ? (
            <div className="space-y-2">
              {localItem.additions.map((add, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={add.label}
                    onChange={(e) => updateAddition(i, "label", e.target.value)}
                    placeholder="เช่น ค่ากะ, ค่าเบี้ยเลี้ยง"
                    className="flex-1 !h-8 !text-[11px]"
                    disabled={readOnly}
                  />
                  <Input
                    type="number"
                    value={add.amount ?? ""}
                    onChange={(e) => updateAddition(i, "amount", parseFloat(e.target.value) || 0)}
                    placeholder="฿"
                    className="w-[100px] !h-8 !text-[11px]"
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <button
                      onClick={() => removeAddition(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-red-50 text-cool-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-cool-400">ยังไม่มีเงินเพิ่ม</p>
          )}
        </div>

        <div className="rounded-lg border border-card-border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-cool-700">เงินหัก</span>
              {hasDeductions && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-medium">{localItem.deductions.length} รายการ</span>}
            </div>
            {!readOnly && (
              <Button size="sm" variant="ghost" onClick={addDeduction} className="!px-2 !py-1 !h-7">
                <Plus className="w-3 h-3" />
              </Button>
            )}
          </div>
          {hasDeductions ? (
            <div className="space-y-2">
              {localItem.deductions.map((ded, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={ded.label}
                    onChange={(e) => updateDeduction(i, "label", e.target.value)}
                    placeholder="เช่น เบิกล่วงหน้า"
                    className="flex-1 !h-8 !text-[11px]"
                    disabled={readOnly}
                  />
                  <Input
                    type="number"
                    value={ded.amount ?? ""}
                    onChange={(e) => updateDeduction(i, "amount", parseFloat(e.target.value) || 0)}
                    placeholder="฿"
                    className="w-[100px] !h-8 !text-[11px]"
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <button
                      onClick={() => removeDeduction(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-red-50 text-cool-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-cool-400">ยังไม่มีเงินหัก</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface CalculationBreakdownProps {
  employee: Employee;
  lineItem: PayrollLineItem;
  settings: PayrollSettings;
  month: number;
}

function CalculationBreakdown({ employee, lineItem, settings, month }: CalculationBreakdownProps) {
  const hourlyRate = employee.base_salary / settings.ot_divisor / 8;
  const basePay = employee.salary_type === "daily"
    ? employee.base_salary * (lineItem.days_worked ?? 0)
    : employee.base_salary;

  const totalOT = lineItem.ot_entries.reduce((sum, ot) => sum + (Number(ot.hours) * hourlyRate * Number(ot.multiplier)), 0);
  const totalAdditions = lineItem.additions.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const totalDeductions = lineItem.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const gross = basePay + totalOT + totalAdditions;

  const calc = calculateBreakdown(
    { salary_type: employee.salary_type, base_salary: employee.base_salary, days_worked: lineItem.days_worked, ot_entries: lineItem.ot_entries, additions: lineItem.additions, deductions: lineItem.deductions },
    settings,
    month
  );

  return (
    <div className="rounded-lg border border-primary/20 bg-primary-soft/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Receipt className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-primary-deep">สรุปการคำนวณ</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-cool-500">เงินเดือนฐาน</span>
            <span className="text-cool-700 tabular-nums font-medium">฿{formatCurrency(basePay)}</span>
          </div>
          {lineItem.ot_entries.length > 0 && (
            <div className="flex justify-between">
              <span className="text-cool-500">OT ({lineItem.ot_entries.length} รายการ)</span>
              <span className="text-cool-700 tabular-nums font-medium">+฿{formatCurrency(totalOT)}</span>
            </div>
          )}
          {lineItem.additions.length > 0 && (
            <div className="flex justify-between">
              <span className="text-cool-500">เงินเพิ่ม ({lineItem.additions.length} รายการ)</span>
              <span className="text-green-600 tabular-nums font-medium">+฿{formatCurrency(totalAdditions)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-primary/20 pt-1.5">
            <span className="text-cool-700 font-semibold">ค่าแรงรวม</span>
            <span className="text-cool-900 tabular-nums font-bold">฿{formatCurrency(gross)}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-cool-500">ประกันสังคม (พนักงาน)</span>
            <span className="text-red-500 tabular-nums font-medium">-฿{formatCurrency(calc.sso_employee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cool-500">ประกันสังคม (นายจ้าง)</span>
            <span className="text-cool-500 tabular-nums font-medium">฿{formatCurrency(calc.sso_employer)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-cool-500">ภาษีหัก ณ ที่จ่าย</span>
            <span className="text-red-500 tabular-nums font-medium">-฿{formatCurrency(calc.withholding_tax)}</span>
          </div>
          {lineItem.deductions.length > 0 && (
            <div className="flex justify-between">
              <span className="text-cool-500">เงินหัก ({lineItem.deductions.length} รายการ)</span>
              <span className="text-red-500 tabular-nums font-medium">-฿{formatCurrency(totalDeductions)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-primary/20 pt-1.5">
            <span className="text-cool-700 font-semibold">เงินเดือนสุทธิ</span>
            <span className="text-primary-deep tabular-nums font-bold">฿{formatCurrency(calc.net_pay)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PayslipViewProps {
  employee: Employee;
  run: PayrollRun | null;
  lineItem: PayrollLineItem;
  settings: PayrollSettings;
  onBack: () => void;
  onPrint?: () => void;
}

function PayslipView({ employee, run, lineItem, settings, onBack, onPrint }: PayslipViewProps) {
  const calc = calculateBreakdown(
    {
      salary_type: employee.salary_type,
      base_salary: employee.base_salary,
      days_worked: lineItem.days_worked,
      ot_entries: lineItem.ot_entries,
      additions: lineItem.additions,
      deductions: lineItem.deductions,
    },
    settings,
    run?.period_month ?? 1
  );

  function handlePrint() {
    onPrint?.();
    window.print();
  }

  const basePay = employee.salary_type === "daily"
    ? employee.base_salary * (lineItem.days_worked ?? 0)
    : employee.base_salary;

  const totalDeductions = lineItem.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  return (
    <div className="min-h-screen bg-page-bg print:bg-white">
      <div className="print:hidden sticky top-0 z-30 bg-white border-b border-card-border px-4 py-3 flex items-center justify-between shadow-sm">
        <Button variant="secondary" size="sm" onClick={onBack}>
          กลับ
        </Button>
        <Button size="sm" onClick={handlePrint}>
          <Printer className="w-4 h-4" /> พิมพ์
        </Button>
      </div>

      <div className="max-w-[210mm] mx-auto p-4 print:p-0">
        <div className="bg-white border border-card-border rounded-card print:border-none print:rounded-none print:p-0">
          <div className="p-8 print:p-6">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-xl font-bold text-ink-900">สลิปเงินเดือน</h1>
                <p className="text-sm text-ink-500 mt-1">Pay Slip</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-400">รอบการจ่าย</div>
                <div className="text-sm font-medium text-ink-700">{run?.pay_date}</div>
                <div className="text-xs text-ink-400 mt-1">{MONTHS[(run?.period_month ?? 1) - 1]?.label} {(run?.period_year ?? 2025) + 543}</div>
              </div>
            </div>

            <div className="border border-card-border rounded-lg p-4 mb-6 bg-cool-25/30">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-ink-400 text-xs">รหัสพนักงาน</span>
                  <div className="text-ink-700 font-medium">{employee.employee_code}</div>
                </div>
                <div>
                  <span className="text-ink-400 text-xs">ชื่อ-นามสกุล</span>
                  <div className="text-ink-700 font-medium">{employee.full_name}</div>
                </div>
                <div>
                  <span className="text-ink-400 text-xs">ตำแหน่ง</span>
                  <div className="text-ink-700 font-medium">{employee.position}</div>
                </div>
                <div>
                  <span className="text-ink-400 text-xs">แผนก</span>
                  <div className="text-ink-700 font-medium">{employee.department || "—"}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-3 pb-2 border-b border-card-border">รายได้</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-500">เงินเดือน{employee.salary_type === "daily" ? ` (${lineItem.days_worked} วัน)` : ""}</span>
                    <span className="text-ink-700 tabular-nums font-medium">฿{formatCurrency(basePay)}</span>
                  </div>
                  {lineItem.ot_entries.map((ot, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-ink-500">OT {ot.type === "holiday" ? "วันหยุด" : "ปกติ"} {ot.hours}ชม. ×{ot.multiplier}</span>
                      <span className="text-ink-700 tabular-nums font-medium">฿{formatCurrency(Number(ot.hours) * hourlyRateFor(employee, settings) * Number(ot.multiplier))}</span>
                    </div>
                  ))}
                  {lineItem.additions.map((add, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-ink-500">{add.label}</span>
                      <span className="text-ink-700 tabular-nums font-medium">฿{formatCurrency(Number(add.amount) || 0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-card-border pt-2 mt-2">
                    <span className="text-ink-700 font-semibold">รวมรายได้</span>
                    <span className="text-ink-900 tabular-nums font-bold">฿{formatCurrency(calc.gross_pay)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-3 pb-2 border-b border-card-border">รายการหัก</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-500">ประกันสังคม (พนักงาน)</span>
                    <span className="text-ink-700 tabular-nums font-medium">-฿{formatCurrency(calc.sso_employee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">ภาษีหัก ณ ที่จ่าย</span>
                    <span className="text-ink-700 tabular-nums font-medium">-฿{formatCurrency(calc.withholding_tax)}</span>
                  </div>
                  {lineItem.deductions.map((ded, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-ink-500">{ded.label}</span>
                      <span className="text-ink-700 tabular-nums font-medium">-฿{formatCurrency(Number(ded.amount) || 0)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-card-border pt-2 mt-2">
                    <span className="text-ink-700 font-semibold">รวมหัก</span>
                    <span className="text-ink-900 tabular-nums font-bold">-฿{formatCurrency(calc.sso_employee + calc.withholding_tax + totalDeductions)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t-[2px] border-ink-900 pt-4">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-bold text-ink-700">เงินเดือนสุทธิ</span>
                  <span className="text-xs text-ink-400 ml-2">Net Pay</span>
                </div>
                <span className="text-2xl font-bold text-ink-900 tabular-nums">฿{formatCurrency(calc.net_pay)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hourlyRateFor(employee: Employee, settings: PayrollSettings) {
  return (employee.base_salary / settings.ot_divisor) / 8;
}