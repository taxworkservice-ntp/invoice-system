import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Printer, Plus, Users, Wallet, Receipt, Banknote, Copy, Check, AlertCircle, CheckCircle2, Clock, Sparkles, X, Pencil, Circle, UserRoundX, TrendingUp, TrendingDown, Download, FileSpreadsheet, FileArchive, CalendarRange, Layers, Trash2, Loader2, RefreshCw } from "lucide-react";
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
import { useWorkspaceRole, useClientProfile } from "../../../hooks/useAuth";
import { getProxiedImageUrl } from "../../../lib/r2";
import { thaiNumberToWords } from "../../../lib/thaiNumberToWords";
import { useToast } from "../../../hooks/useToast";
import { calculateBreakdown, calculateAbsenceDeduction, getEffectiveHourlyRate, getMonthDays, resolveDivisorDays, suggestLeaveProrate, type PayrollSettings } from "../../../lib/payroll/calculations";
import { logAuditEvent, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../../lib/payroll/audit";
import { buildRunSummaryWorkbook, buildBankPaymentWorkbook, buildWhtWorkbook, workbookToBlob, type PayrollCalcRow } from "../../../lib/payroll/reportXlsx";
import { buildPayslipSlipNode, type PayslipCompany } from "../../../lib/payroll/payslipPdf";
import { slipNodeToPdfBlob, sanitizePdfFilename } from "../../../lib/payroll/payslipPdfRender";
import { formatPayRangeLabel, suggestNextWindow } from "../../../lib/payroll/schedule";
import { applyRecurringTemplates, type RecurringTemplate } from "../../../lib/payroll/recurring";
import { syncRunToWht, cleanupRunWht, type WhtSyncResult } from "../../../lib/payroll/whtSync";
import type { Employee, PayrollRun, PayrollLineItem, OtEntry } from "../../../types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Sticky cell layers inside the table's own scroll viewport
const TH_STICKY = "sticky top-0 z-10 bg-cool-50";
const TF_STICKY = "sticky bottom-0 z-10 bg-cool-25";

// Remember the last working period per user so back-dated payroll work survives navigation/reload
function periodStorageKey(userId: string | null): string {
  return `taxwork:payroll-period:${userId ?? "anon"}`;
}

function readStoredPeriod(userId: string | null): { month: number; year: number } | null {
  try {
    const raw = localStorage.getItem(periodStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { month?: unknown; year?: unknown };
    const m = Number(parsed.month);
    const y = Number(parsed.year);
    if (!Number.isInteger(m) || m < 1 || m > 12) return null;
    if (!Number.isInteger(y) || y < 2000 || y > new Date().getFullYear() + 2) return null;
    return { month: m, year: y };
  } catch {
    return null;
  }
}

function writeStoredPeriod(userId: string | null, month: number, year: number) {
  try {
    localStorage.setItem(periodStorageKey(userId), JSON.stringify({ month, year }));
  } catch {
    // storage unavailable (private mode etc.) — silently skip
  }
}

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

type RowStatus = "complete" | "warning" | "incomplete" | "untouched";

function createEmptyLineItem(runId: string, employeeId: string): PayrollLineItem {
  return {
    id: "",
    payroll_run_id: runId,
    employee_id: employeeId,
    days_worked: null,
    ot_entries: [],
    additions: [],
    deductions: [],
    absent_days: null,
    absence_daily_rate: null,
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

function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function getPayrollPeriod(month: number, year: number) {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart, periodEnd };
}

function getRowStatus(employee: Employee, item: PayrollLineItem): RowStatus {
  const hasOT = item.ot_entries.length > 0;
  const hasDaysWorked = item.days_worked !== null && item.days_worked > 0;
  const hasAbsences = (item.absent_days ?? 0) > 0;
  const hasAdditions = item.additions.length > 0;
  const hasDeductions = item.deductions.length > 0;
  const hasData = hasDaysWorked || hasAbsences || hasOT || hasAdditions || hasDeductions;

  if (!hasData) return "untouched";
  if (employee.salary_type === "daily" && !hasDaysWorked) return "incomplete";
  if (hasOT && item.ot_entries.some((entry) => Number(entry.hours) <= 0 || Number(entry.multiplier) <= 0)) return "warning";
  if (hasAdditions && item.additions.some((entry) => !entry.label.trim() || Number(entry.amount) < 0)) return "warning";
  if (hasDeductions && item.deductions.some((entry) => !entry.label.trim() || Number(entry.amount) < 0)) return "warning";
  return "complete";
}

export default function PayrollPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { workspaceUserId, profile } = useWorkspaceRole();
  const userId = workspaceUserId;
  const { clientProfile } = useClientProfile(profile?.id);
  const companyInfo: PayslipCompany | null = useMemo(() => {
    if (!clientProfile) return null;
    const logo = clientProfile.logo_url ? getProxiedImageUrl(clientProfile.logo_url) : null;
    return {
      name: clientProfile.company_name_th || null,
      address: clientProfile.address,
      taxId: clientProfile.tax_id,
      phone: clientProfile.phone,
      logoUrl: logo,
    };
  }, [clientProfile]);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [payDate, setPayDate] = useState(getPayrollPeriod(now.getMonth() + 1, now.getFullYear()).periodEnd);

  // Restore last selected period once auth resolves (covers the late-userId race)
  const didRestorePeriod = useRef(false);
  useEffect(() => {
    if (!userId || didRestorePeriod.current) return;
    didRestorePeriod.current = true;
    const stored = readStoredPeriod(userId);
    if (stored && (stored.month !== month || stored.year !== year)) {
      setMonth(stored.month);
      setYear(stored.year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Honor ?run=<id> deep links (e.g. from the WHT page): jump to that run's month and select it.
  useEffect(() => {
    if (!userId || didHonorRunParam.current) return;
    const runId = searchParams.get("run");
    if (!runId) return;
    didHonorRunParam.current = true;
    supabase
      .from("payroll_runs")
      .select("id, period_end")
      .eq("user_id", userId)
      .eq("id", runId)
      .maybeSingle()
      .then(({ data }) => {
        const target = data as { id: string; period_end: string } | null;
        if (!target?.period_end) return; // unknown id — ignore silently
        deepLinkRunId.current = target.id;
        setMonth(Number(target.period_end.slice(5, 7)));
        setYear(Number(target.period_end.slice(0, 4)));
        setDeepLinkScrollId(target.id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Persist period on every change
  useEffect(() => {
    if (!userId) return;
    writeStoredPeriod(userId, month, year);
  }, [userId, month, year]);

  // The default pay date follows the selected period (period end) — never today,
  // which would block finalizing the current month (pay_date >= period_end).
  useEffect(() => {
    setPayDate(getPayrollPeriod(month, year).periodEnd);
  }, [month, year]);

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const run = useMemo(() => runs.find((r) => r.id === selectedRunId) ?? null, [runs, selectedRunId]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [excludedEmployeeCount, setExcludedEmployeeCount] = useState(0);
  const [lineItems, setLineItems] = useState<Map<string, PayrollLineItem>>(new Map());
  const [settings, setSettings] = useState<PayrollSettings>({ ot_divisor: 30, normal_ot_multiplier: 1.5, holiday_ot_multiplier: 3.0 });
  const [loading, setLoading] = useState(true);
  const [printEmployee, setPrintEmployee] = useState<Employee | null>(null);
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [copyingPrevious, setCopyingPrevious] = useState(false);
  const [copyPreview, setCopyPreview] = useState<{ copyable: number; overwrite: number } | null>(null);
  const [search, setSearch] = useState("");
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<string | null>(null);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [previousRunEmployees, setPreviousRunEmployees] = useState<Employee[] | null>(null);
  const [prevNearestRunId, setPrevNearestRunId] = useState<string | null>(null);
  const [recurringByEmployee, setRecurringByEmployee] = useState<Map<string, RecurringTemplate[]>>(new Map());
  const [historyRuns, setHistoryRuns] = useState<PayrollRun[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ start: "", end: "", label: "", pay_date: "" });
  const [creating, setCreating] = useState(false);
  const [showDeleteRunModal, setShowDeleteRunModal] = useState(false);
  const [deletingRun, setDeletingRun] = useState(false);
  const [showEditRunModal, setShowEditRunModal] = useState(false);
  const [editForm, setEditForm] = useState({ start: "", end: "", label: "", pay_date: "" });
  const [editingRun, setEditingRun] = useState(false);
  const [schemaOutdated, setSchemaOutdated] = useState(false);
  const [whtSync, setWhtSync] = useState<WhtSyncResult | null>(null);
  const [syncingWht, setSyncingWht] = useState(false);
  const [payDateSaved, setPayDateSaved] = useState(false);
  const [payDateInvalid, setPayDateInvalid] = useState(false);
  const payDateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payDateTouched = useRef(false);
  const tableRef = useRef<HTMLDivElement>(null);
  // Deep link from WHT (?run=<payroll_run_id>): jump to that run's month and select it.
  const deepLinkRunId = useRef<string | null>(null);
  const didHonorRunParam = useRef(false);
  const [deepLinkScrollId, setDeepLinkScrollId] = useState<string | null>(null);

  // After the deep-linked run loads, bring its table into view.
  useEffect(() => {
    if (!deepLinkScrollId || run?.id !== deepLinkScrollId || loading) return;
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setDeepLinkScrollId(null);
  }, [deepLinkScrollId, run?.id, loading]);

  // One-time schema capability check: new period columns must exist before this page can query.
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("payroll_runs")
      .select("period_end", { count: "exact", head: true })
      .then(({ error }) => {
        if (error && (error.code === "42703" || /does not exist/i.test(error.message))) {
          setSchemaOutdated(true);
        }
      });
  }, [userId]);

  // Fetch runs for the displayed statutory month + settings + history
  const fetchData = useCallback(async () => {
    if (!userId) return;
    if (schemaOutdated) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { periodStart, periodEnd } = getPayrollPeriod(month, year);
    const [{ data: runsData }, { data: settingsData }] = await Promise.all([
      supabase.from("payroll_runs").select("*")
        .eq("user_id", userId)
        .gte("period_end", periodStart)
        .lte("period_end", periodEnd)
        .order("period_start"),
      supabase.from("client_payroll_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    if (settingsData) {
      setSettings({
        ot_divisor: settingsData.ot_divisor,
        normal_ot_multiplier: settingsData.normal_ot_multiplier,
        holiday_ot_multiplier: settingsData.holiday_ot_multiplier,
        prorate_mode: settingsData.prorate_mode,
        absence_deduction: settingsData.absence_deduction,
        rounding_rule: settingsData.rounding_rule,
        sso_ceiling_override: settingsData.sso_ceiling_override,
        pay_frequency: settingsData.pay_frequency,
        pay_anchor_day: settingsData.pay_anchor_day,
        pay_cycle_len_days: settingsData.pay_cycle_len_days,
      });
    }

    const list = (runsData ?? []) as PayrollRun[];
    setRuns(list);
    setSelectedRunId((prev) => {
      if (deepLinkRunId.current && list.some((r) => r.id === deepLinkRunId.current)) {
        return deepLinkRunId.current;
      }
      return prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null;
    });

    const { data: historyData } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("user_id", userId)
      .order("period_end", { ascending: false })
      .limit(12);
    setHistoryRuns((historyData ?? []) as PayrollRun[]);

    setLoading(false);
  }, [userId, month, year, schemaOutdated]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch employee/line-item data scoped to the SELECTED RUN's exact range
  const fetchRunDetails = useCallback(async () => {
    if (!userId || !run?.id) {
      setEmployees([]);
      setLineItems(new Map());
      setExcludedEmployeeCount(0);
      setPreviousRunEmployees(null);
      setPrevNearestRunId(null);
      return;
    }
    setLoading(true);

    // Heal runs created before pay_date defaulted to the period end: a draft run
    // whose stored pay_date precedes period_end can never be finalized as-is.
    let effectivePayDate = run.pay_date;
    if (run.status === "draft" && run.pay_date < run.period_end) {
      effectivePayDate = run.period_end;
      void supabase
        .from("payroll_runs")
        .update({ pay_date: effectivePayDate })
        .eq("id", run.id)
        .eq("user_id", userId)
        .then(({ error }) => {
          if (!error) {
            setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, pay_date: effectivePayDate } : r)));
          }
        });
    }
    setPayDate(effectivePayDate);

    const [{ data: empData }, { count }] = await Promise.all([
      supabase.from("employees").select("*")
        .lte("start_date", run.period_end)
        .or(`end_date.is.null,end_date.gte.${run.period_start}`)
        .order("employee_code"),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    const eligibleEmployees = (empData ?? []) as Employee[];
    setEmployees(eligibleEmployees);
    setExcludedEmployeeCount(Math.max(0, (count ?? 0) - eligibleEmployees.length));

    // Active recurring templates for every employee (drives draft auto-population)
    const { data: recData, error: recError } = await supabase
      .from("payroll_recurring_items")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true);
    const recMap = new Map<string, RecurringTemplate[]>();
    if (!recError) {
      ((recData ?? []) as RecurringTemplate[]).forEach((t) => {
        const list = recMap.get(t.employee_id) ?? [];
        list.push(t);
        recMap.set(t.employee_id, list);
      });
    }
    setRecurringByEmployee(recMap);

    const { data: itemsData } = await supabase
      .from("payroll_line_items")
      .select("*")
      .eq("payroll_run_id", run.id);
    const itemMap = new Map<string, PayrollLineItem>();
    (itemsData ?? []).forEach((item) => itemMap.set(item.employee_id, item as PayrollLineItem));
    setLineItems(itemMap);

    // Nearest preceding period (any month) — powers copy-from-previous and headcount diff
    const { data: prevRun } = await supabase
      .from("payroll_runs")
      .select("id")
      .eq("user_id", userId)
      .lt("period_end", run.period_start)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevRun) {
      setPrevNearestRunId(prevRun.id);
      const { data: prevItems } = await supabase
        .from("payroll_line_items")
        .select("employee_id")
        .eq("payroll_run_id", prevRun.id);
      const prevIds = (prevItems ?? []).map((i) => i.employee_id);
      setPreviousRunEmployees(eligibleEmployees.filter((e) => prevIds.includes(e.id)));
    } else {
      setPrevNearestRunId(null);
      setPreviousRunEmployees(null);
    }

    setLoading(false);
  }, [userId, run?.id]);

  useEffect(() => {
    fetchRunDetails();
  }, [fetchRunDetails]);

  useEffect(() => {
    payDateTouched.current = false;
    return () => {
      if (payDateSaveTimer.current) clearTimeout(payDateSaveTimer.current);
    };
  }, [run?.id]);

  async function handleAutosavePayDate(value: string) {
    if (!run || !userId) return;
    if (value < run.period_end) {
      setPayDate(run.pay_date);
      toast.error(`วันจ่ายต้องไม่ก่อนวันสิ้นสุดรอบ (${run.period_end})`);
      return;
    }
    const { error } = await supabase
      .from("payroll_runs")
      .update({ pay_date: value })
      .eq("id", run.id)
      .eq("user_id", userId);
    if (error) {
      setPayDate(run.pay_date);
      toast.error("บันทึกวันจ่ายไม่สำเร็จ");
      return;
    }
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, pay_date: value } : r)));
    setPayDateSaved(true);
    setTimeout(() => setPayDateSaved(false), 1500);
    await logAuditEvent({
      action: AUDIT_ACTIONS.PAYROLL_RUN_UPDATED,
      entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
      entity_id: run.id,
      details: { field: "pay_date", old_value: run.pay_date, new_value: value },
    });
  }

  function handlePayDateChange(value: string) {
    setPayDate(value);
    if (!run || run.status !== "draft") return;
    payDateTouched.current = true;
    if (payDateSaveTimer.current) clearTimeout(payDateSaveTimer.current);
    payDateSaveTimer.current = setTimeout(() => {
      if (payDateTouched.current) {
        payDateTouched.current = false;
        void handleAutosavePayDate(value);
      }
    }, 800);
  }

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
      setSelectedRunId((existing as PayrollRun).id);
      fetchData();
      return;
    }

    const { periodStart, periodEnd } = getPayrollPeriod(month, year);
    const { data, error } = await supabase
      .from("payroll_runs")
      .insert({ user_id: userId, period_month: month, period_year: year, period_start: periodStart, period_end: periodEnd, pay_date: payDate, status: "draft" })
      .select("*")
      .single();

    if (error) {
      toast.error("ไม่สามารถสร้างรอบเงินเดือนได้");
    } else {
      setSelectedRunId((data as PayrollRun).id);
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

  function openCreateCustomModal() {
    const freq = settings.pay_frequency ?? "monthly";
    const anchor = settings.pay_anchor_day ?? 1;
    const cycleOpts = { anchorDay: anchor, cycleLenDays: settings.pay_cycle_len_days ?? undefined };
    // With runs in the viewed month: chain after the latest one; fresh month: first window of that month
    const latestEnd = runs.length > 0 ? runs.reduce<string | null>((acc, r) => (!acc || r.period_end > acc ? r.period_end : acc), null) : null;
    const win = suggestNextWindow(freq, cycleOpts, latestEnd, latestEnd ? null : { year, month });
    setCreateForm({
      start: win.start,
      end: win.end,
      label: formatPayRangeLabel(win),
      pay_date: win.end,
    });
    setShowCreateModal(true);
  }

  async function handleCreateCustomRun() {
    if (!userId || creating) return;
    const start = createForm.start;
    const end = createForm.end;
    if (!start || !end) {
      toast.error("กรุณาเลือกช่วงวันที่");
      return;
    }
    if (start > end) {
      toast.error("วันเริ่มต้องไม่หลังวันสิ้นสุด");
      return;
    }
    if (createForm.pay_date < end) {
      toast.error("วันจ่ายต้องไม่ก่อนวันสิ้นสุดรอบ");
      return;
    }
    const endMonth = Number(end.slice(5, 7));
    const endYear = Number(end.slice(0, 4));

    setCreating(true);
    const { data, error } = await supabase
      .from("payroll_runs")
      .insert({
        user_id: userId,
        period_month: endMonth,
        period_year: endYear,
        period_start: start,
        period_end: end,
        label: createForm.label.trim() || formatPayRangeLabel({ start, end }),
        pay_date: createForm.pay_date,
        status: "draft",
      })
      .select("*")
      .single();

    if (error) {
      // 23P01 = exclusion_violation from payroll_runs_no_overlap
      toast.error(error.code === "23P01" ? "ช่วงรอบนี้ทับซ้อนกับรอบอื่นแล้ว" : "ไม่สามารถสร้างรอบได้");
    } else {
      setShowCreateModal(false);
      setSelectedRunId((data as PayrollRun).id);
      toast.success("สร้างช่วงรอบแล้ว");
      await fetchData();
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_RUN_CREATED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: data.id,
        details: { period_start: start, period_end: end, label: createForm.label },
      });
    }
    setCreating(false);
  }

  function openEditRunModal() {
    if (!run || run.status !== "draft") return;
    setEditForm({
      start: run.period_start,
      end: run.period_end,
      label: run.label ?? formatPayRangeLabel({ start: run.period_start, end: run.period_end }),
      pay_date: run.pay_date,
    });
    setShowEditRunModal(true);
  }

  async function handleUpdateRun() {
    if (!run || !userId || editingRun) return;
    const start = editForm.start;
    const end = editForm.end;
    if (!start || !end || start > end) {
      toast.error("ช่วงวันที่ไม่ถูกต้อง");
      return;
    }
    if (editForm.pay_date < end) {
      toast.error("วันจ่ายต้องไม่ก่อนวันสิ้นสุดรอบ");
      return;
    }
    // Client-side overlap check against sibling runs (constraint 23P01 is the backstop)
    const overlaps = runs.some((r) => r.id !== run.id && start <= r.period_end && end >= r.period_start);

    setEditingRun(true);
    const canChangeRange = lineItems.size === 0;
    const payload: Record<string, unknown> = {
      label: editForm.label.trim() || formatPayRangeLabel({ start, end }),
      pay_date: editForm.pay_date,
      ...(canChangeRange ? { period_start: start, period_end: end } : {}),
    };
    const { error } = await supabase.from("payroll_runs").update(payload).eq("id", run.id).eq("user_id", userId);

    if (error) {
      toast.error(error.code === "23P01" ? "ช่วงรอบนี้ทับซ้อนกับรอบอื่นแล้ว" : "บันทึกไม่สำเร็จ");
    } else {
      setShowEditRunModal(false);
      toast.success("บันทึกแล้ว");
      await fetchData();
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_RUN_UPDATED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: run.id,
        details: {
          label: payload.label,
          pay_date: payload.pay_date,
          ...(canChangeRange ? { period_start: start, period_end: end } : {}),
        },
      });
    }
    setEditingRun(false);
  }

  async function handleDeleteRun() {
    if (!run || !userId || deletingRun) return;
    const snapshot = {
      label: run.label,
      period_start: run.period_start,
      period_end: run.period_end,
      total_net: run.total_net,
      employee_count: run.employee_count,
    };
    setDeletingRun(true);
    const { error } = await supabase.from("payroll_runs").delete().eq("id", run.id).eq("user_id", userId);
    if (error) {
      toast.error("ไม่สามารถลบรอบได้");
    } else {
      setShowDeleteRunModal(false);
      setSelectedRunId(null);
      toast.success("ลบรอบเงินเดือนแล้ว");
      await fetchData();
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_RUN_DELETED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: run.id,
        details: snapshot,
      });
    }
    setDeletingRun(false);
  }

  async function runWhtSync(): Promise<WhtSyncResult | null> {
    if (!run || !userId) return null;
    setSyncingWht(true);
    try {
      const syncResult = await syncRunToWht(userId, run);
      setWhtSync(syncResult);
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_WHT_SYNCED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: run.id,
        details: {
          created: syncResult.created,
          updated: syncResult.updated,
          deleted: syncResult.deleted,
          kept_done: syncResult.keptDone,
          skipped: syncResult.skipped.length,
        },
      });
      return syncResult;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ซิงก์ภาษีหัก ณ ที่จ่ายไม่สำเร็จ");
      return null;
    } finally {
      setSyncingWht(false);
    }
  }

  async function handleSyncWht() {
    const syncResult = await runWhtSync();
    if (syncResult) {
      const skippedNote = syncResult.skipped.length > 0 ? ` · ข้าม ${syncResult.skipped.length} คน` : "";
      toast.success(`ซิงกรายการภาษีหัก ณ ที่จ่ายแล้ว · สร้าง ${syncResult.created} · อัปเดต ${syncResult.updated}${skippedNote}`);
    }
  }

  async function handleFinalize() {
    if (!run || !userId) return;

    const incompleteEmployees = employees.filter((employee) => getRowStatus(employee, getEffectiveItem(employee.id)) !== "complete");
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
      pay_date: payDate,
    };
    const { error } = await supabase.from("payroll_runs").update(updates).eq("id", run.id).eq("user_id", userId);

    if (error) {
      toast.error("ไม่สามารถปิดรอบได้");
    } else {
      setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, status: "finalized", pay_date: payDate } : r)));
      setShowFinalizeModal(false);
      toast.success("ปิดรอบเงินเดือนแล้ว");
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_RUN_FINALIZED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: run.id,
        details: { employee_count: employees.length, total_net: totals.net },
      });
      const syncResult = await runWhtSync();
      if (syncResult) {
        const skippedNote = syncResult.skipped.length > 0 ? ` · ข้าม ${syncResult.skipped.length} คน (ไม่มีเลขผู้เสียภาษี/ยังไม่บันทึก)` : "";
        toast.success(`สร้างรายการภาษีหัก ณ ที่จ่าย ${syncResult.created + syncResult.updated} รายการ${skippedNote}`);
      }
    }
  }

  function handleRequestReopen() {
    if (!run || !userId) return;
    setShowReopenModal(true);
  }

  async function handleReopen() {
    if (!run || !userId) return;
    setShowReopenModal(false);

    const { error } = await supabase.from("payroll_runs").update({ status: "draft" }).eq("id", run.id).eq("user_id", userId);
    if (error) {
      toast.error("ไม่สามารถเปิดรอบใหม่ได้");
    } else {
      setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, status: "draft", revision: (r.revision ?? 1) + 1 } : r)));
      setWhtSync(null);
      try {
        const cleanup = await cleanupRunWht(run.id);
        if (cleanup.deleted > 0) {
          toast.info(`ลบรายการภาษีหัก ณ ที่จ่ายที่ยังไม่ยืนยัน ${cleanup.deleted} รายการ`);
        }
        if (cleanup.keptDone > 0) {
          toast.error(`มีรายการภาษีหัก ณ ที่จ่ายที่ยืนยันแล้ว ${cleanup.keptDone} รายการ — ต้องยกเลิกที่หน้าภาษีหัก ณ ที่จ่ายก่อน`);
        }
      } catch {
        toast.error("ล้างรายการภาษีหัก ณ ที่จ่ายไม่สำเร็จ");
      }
      toast.success("เปิดรอบใหม่แล้ว");
      await logAuditEvent({
        action: AUDIT_ACTIONS.PAYROLL_RUN_REOPENED,
        entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN,
        entity_id: run.id,
        details: {},
      });
    }
  }

  function buildCalcRows(): PayrollCalcRow[] {
    return employees.map((emp) => {
      const item = getEffectiveItem(emp.id);
      const calc = calcLineItem(emp, item);
      return { employee: emp, lineItem: lineItems.get(emp.id) ?? null, ...calc };
    });
  }

  async function handleExportSummary() {
    if (!run) return;
    const rows = buildCalcRows();
    const wb = buildRunSummaryWorkbook(run, rows);
    const blob = await workbookToBlob(wb);
    downloadBlob(blob, `payroll-summary-${run.period_year}-${String(run.period_month).padStart(2, "0")}.xlsx`);
    await logAuditEvent({ action: AUDIT_ACTIONS.PAYROLL_EXPORTED, entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN, entity_id: run.id, details: { report: "summary", count: rows.length } });
  }

  async function handleExportBankPayment() {
    if (!run) return;
    const rows = buildCalcRows().filter((r) => r.employee.bank_account);
    if (rows.length === 0) { toast.error("ไม่มีพนักงานที่มีเลขบัญชีธนาคาร"); return; }
    const wb = buildBankPaymentWorkbook(run, rows);
    const blob = await workbookToBlob(wb);
    downloadBlob(blob, `bank-payment-${run.period_year}-${String(run.period_month).padStart(2, "0")}.xlsx`);
    await logAuditEvent({ action: AUDIT_ACTIONS.PAYROLL_EXPORTED, entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN, entity_id: run.id, details: { report: "bank_payment", count: rows.length } });
  }

  async function handleExportWht() {
    if (!run) return;
    const rows = buildCalcRows();
    const wb = buildWhtWorkbook(run, rows);
    const blob = await workbookToBlob(wb);
    downloadBlob(blob, `wht-${run.period_year}-${String(run.period_month).padStart(2, "0")}.xlsx`);
    await logAuditEvent({ action: AUDIT_ACTIONS.PAYROLL_EXPORTED, entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN, entity_id: run.id, details: { report: "wht", count: rows.length } });
  }

  async function handleExportBulkPayslips() {
    if (!run) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const statutoryMonth = Number(run.period_end.slice(5, 7));
    const statutoryYear = Number(run.period_end.slice(0, 4));
    let okCount = 0;
    let failCount = 0;

    for (const emp of employees) {
      try {
        const item = getEffectiveItem(emp.id);
        const calc = calcLineItem(emp, item);
        const hourlyRate = getEffectiveHourlyRate(emp.salary_type, emp.base_salary, resolveDivisorDays(settings, statutoryMonth, statutoryYear));
        const totalDeductions = item.deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        const blob = await slipNodeToPdfBlob(buildPayslipSlipNode(emp, run, item, { ...calc, totalDeductions }, hourlyRate, companyInfo));
        zip.file(`${sanitizePdfFilename(`${emp.employee_code}-${emp.full_name}`)}.pdf`, blob);
        okCount++;
      } catch (e) {
        console.warn("payslip pdf failed", emp.employee_code, e);
        failCount++;
      }
    }

    if (okCount === 0) {
      toast.error("สร้างสลิปไม่สำเร็จ");
      return;
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `payslips-${run.period_year}-${String(run.period_month).padStart(2, "0")}.pdf.zip`);
    toast.success(failCount > 0 ? `สร้าง PDF สำเร็จ ${okCount} คน · ล้มเหลว ${failCount} คน` : `สร้าง PDF ${okCount} ใบแล้ว`);
    await logAuditEvent({ action: AUDIT_ACTIONS.PAYROLL_EXPORTED, entity_type: AUDIT_ENTITY_TYPES.PAYROLL_RUN, entity_id: run.id, details: { report: "bulk_payslips_pdf", count: okCount } });
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
            absent_days: existing.absent_days,
            absence_daily_rate: existing.absence_daily_rate,
            ot_entries: existing.ot_entries,
            additions: existing.additions,
            deductions: existing.deductions,
          } : null,
          next: {
            days_worked: item.days_worked,
            absent_days: item.absent_days,
            absence_daily_rate: item.absence_daily_rate,
            ot_entries: item.ot_entries,
            additions: item.additions,
            deductions: item.deductions,
          },
        },
      });
      return true;
    }
  }

  async function handlePreviewCopyFromPrevious() {
    if (!run || !userId || !employees.length) return;
    setCopyingPrevious(true);

    if (!prevNearestRunId) {
      toast.error("ไม่พบรอบเงินเดือนก่อนหน้า");
      setCopyingPrevious(false);
      return;
    }

    const { data: prevItems } = await supabase
      .from("payroll_line_items")
      .select("*")
      .eq("payroll_run_id", prevNearestRunId);

    if (!prevItems || prevItems.length === 0) {
      toast.error("ไม่มีข้อมูลในรอบก่อนหน้า");
      setCopyingPrevious(false);
      return;
    }

    let copyable = 0;
    let overwrite = 0;
    for (const emp of employees) {
      const prevItem = prevItems.find((pi) => pi.employee_id === emp.id);
      if (prevItem) {
        copyable++;
        if (lineItems.has(emp.id)) overwrite++;
      }
    }

    setCopyPreview({ copyable, overwrite });
    setCopyingPrevious(false);
  }

  async function handleConfirmCopyFromPrevious() {
    if (!run || !userId || !copyPreview) return;
    setCopyingPrevious(true);

    if (!prevNearestRunId) {
      setCopyPreview(null);
      setCopyingPrevious(false);
      return;
    }

    const { data: prevItems } = await supabase
      .from("payroll_line_items")
      .select("*")
      .eq("payroll_run_id", prevNearestRunId);

    if (!prevItems || prevItems.length === 0) {
      setCopyPreview(null);
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
    setCopyPreview(null);
    setCopyingPrevious(false);
    fetchData();
  }

  function getLineItem(employeeId: string): PayrollLineItem {
    const existing = lineItems.get(employeeId);
    if (existing) return existing;
    return createEmptyLineItem(run?.id ?? "", employeeId);
  }

  /** Raw stored item with active recurring templates merged in (view/save layer). */
  function getEffectiveItem(employeeId: string): PayrollLineItem {
    const raw = getLineItem(employeeId);
    const templates = recurringByEmployee.get(employeeId) ?? [];
    if (templates.length === 0) return raw;
    const merged = applyRecurringTemplates(raw, templates);
    return { ...raw, additions: merged.additions, deductions: merged.deductions };
  }

  function calcLineItem(employee: Employee, item: PayrollLineItem) {
    return calculateBreakdown(
      {
        salary_type: employee.salary_type,
        base_salary: employee.base_salary,
        days_worked: item.days_worked,
        absent_days: item.absent_days,
        absence_daily_rate: item.absence_daily_rate,
        ot_entries: item.ot_entries,
        additions: item.additions,
        deductions: item.deductions,
        sso_registered: employee.sso_registered !== false,
      },
      settings,
      month
    );
  }

  const totals = employees.reduce(
    (acc, emp) => {
      const item = getEffectiveItem(emp.id);
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
    const item = getEffectiveItem(emp.id);
    return getRowStatus(emp, item) === "complete";
  }).length;
  const incompleteEmployees = employees.filter((emp) => getRowStatus(emp, getEffectiveItem(emp.id)) !== "complete");

  const progressPercent = employees.length > 0 ? Math.round((completedCount / employees.length) * 100) : 0;

  const filteredEmployees = search.trim()
    ? employees.filter((emp) => {
        const q = search.toLowerCase();
        return (
          emp.full_name.toLowerCase().includes(q) ||
          emp.employee_code.toLowerCase().includes(q) ||
          emp.position.toLowerCase().includes(q) ||
          (emp.department ?? "").toLowerCase().includes(q)
        );
      })
    : employees;

  useEffect(() => {
    if (!highlightedEmployeeId) return;
    const t = setTimeout(() => setHighlightedEmployeeId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightedEmployeeId]);

  const prevEmployeeIds = previousRunEmployees ? previousRunEmployees.map((e) => e.id) : [];
  const currentEmployeeIds = employees.map((e) => e.id);
  const runDiff = previousRunEmployees !== null ? {
    added: currentEmployeeIds.filter((id) => !prevEmployeeIds.includes(id)).length,
    left: prevEmployeeIds.filter((id) => !currentEmployeeIds.includes(id)).length,
  } : null;

  if (printEmployee) {
    return <PayslipView employee={printEmployee} run={run} lineItem={getEffectiveItem(printEmployee.id)} settings={settings} company={companyInfo} onBack={() => setPrintEmployee(null)} onPrint={() => {
      logAuditEvent({
        action: AUDIT_ACTIONS.PAYSLIP_PRINTED,
        entity_type: AUDIT_ENTITY_TYPES.PAYSLIP,
        entity_id: printEmployee.id,
        details: { employee_name: printEmployee.full_name, run_id: run?.id },
      });
    }} />;
  }

  const detailItem = detailEmployee ? getEffectiveItem(detailEmployee.id) : null;

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
          {run && (
            <PayrollExportMenu
              status={run.status}
              onExportSummary={handleExportSummary}
              onExportBank={handleExportBankPayment}
              onExportWht={handleExportWht}
              onExportPayslips={handleExportBulkPayslips}
              onSyncWht={handleSyncWht}
              syncingWht={syncingWht}
            />
          )}
          {run?.status === "draft" && (
            <Button size="sm" onClick={() => {
              if (payDate < run.period_end) {
                setPayDateInvalid(true);
                setTimeout(() => setPayDateInvalid(false), 3000);
                toast.error(`วันจ่ายตอนนี้คือ ${payDate} — ต้องเป็น ${run.period_end} ขึ้นไป แก้ไขได้ที่ช่อง "วันจ่าย" ด้านบน`);
                return;
              }
              setShowFinalizeModal(true);
            }} className="!rounded-lg" disabled={employees.length === 0 || incompleteEmployees.length > 0}>
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
            <div className={`relative ${payDateInvalid ? "[&_input]:border-red-400 [&_input]:ring-2 [&_input]:ring-red-200" : ""}`}>
              <Input
                label="วันจ่าย"
                type="date"
                value={payDate}
                onChange={(e) => handlePayDateChange(e.target.value)}
                disabled={run?.status === "finalized"}
                title={run?.status === "finalized" ? "รอบปิดแล้ว — เปิดรอบใหม่เพื่อแก้ไข" : "วันที่จ่ายเงินพนักงาน (ต้องไม่ก่อนวันสิ้นสุดรอบ)"}
                className="w-[160px]"
              />
              {payDateSaved && (
                <span className="absolute right-2 top-[2px] flex items-center gap-0.5 text-[10px] text-green-600 pointer-events-none">
                  <Check className="w-3 h-3" /> บันทึกแล้ว
                </span>
              )}
            </div>
            <div className="flex-1" />
            {run && (
              <div className="flex items-center gap-2">
                <StatusBadge
                  tone={run.status === "finalized" ? "green" : "amber"}
                  label={run.status === "finalized" ? "ปิดรอบ" : "ร่าง"}
                />
                {run.status === "draft" && (
                  <>
                    <button
                      onClick={openEditRunModal}
                      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-cool-25 text-cool-400 hover:text-cool-700 transition-colors"
                      title="แก้ไขข้อมูลรอบ"
                      aria-label="แก้ไขข้อมูลรอบ"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setShowDeleteRunModal(true)}
                      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 text-cool-300 hover:text-red-500 transition-colors"
                      title="ลบรอบ"
                      aria-label="ลบรอบ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {runs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-card-border flex flex-wrap gap-2 items-center">
              {runs.map((r) => {
                const isCurrent = r.id === selectedRunId;
                const rangeLabel = r.label || formatPayRangeLabel({ start: r.period_start, end: r.period_end });
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    disabled={isCurrent}
                    title={`${r.period_start} → ${r.period_end}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${isCurrent ? "bg-primary-soft border-primary/30 text-primary-deep cursor-default" : "bg-white border-card-border text-cool-600 hover:border-primary/30 hover:text-primary"}`}
                  >
                    <span>{rangeLabel}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.status === "finalized" ? "bg-green-500" : "bg-amber-400"}`} aria-label={r.status === "finalized" ? "ปิดรอบ" : "ร่าง"} />
                  </button>
                );
              })}
              <button
                onClick={openCreateCustomModal}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-cool-300 text-cool-500 hover:text-primary hover:border-primary/40 text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> ช่วงรอบ
              </button>
            </div>
          )}
        </Card>

        {runs.length > 1 && (() => {
          const finalized = runs.filter((r) => r.status === "finalized");
          const draftCount = runs.filter((r) => r.status === "draft").length;
          const sumGross = finalized.reduce((s, r) => s + (Number(r.total_gross) || 0), 0);
          const sumNet = finalized.reduce((s, r) => s + (Number(r.total_net) || 0), 0);
          const empMax = finalized.reduce((s, r) => s + (r.employee_count || 0), 0);
          return (
            <details className="bg-white border border-card-border rounded-card px-4 py-3">
              <summary className="flex items-center gap-2 text-cool-700 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <Layers className="w-4 h-4 text-cool-400" />
                <span className="text-sm font-medium">
                  สรุปทั้งเดือน ({MONTHS[month - 1].label} {year + 543}) — {finalized.length} รอบที่ปิดแล้ว
                </span>
                <span className="ml-auto text-[11px] text-cool-400">สุทธิ ฿{formatCurrency(sumNet)}</span>
              </summary>
              <div className="pt-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] text-green-600 font-medium">ค่าแรงรวม</div>
                  <div className="text-sm font-semibold text-green-900 tabular-nums">฿{formatCurrency(sumGross)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-green-600 font-medium">สุทธิ</div>
                  <div className="text-sm font-semibold text-green-900 tabular-nums">฿{formatCurrency(sumNet)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-green-600 font-medium">จำนวนคน (รวมช่วง)</div>
                  <div className="text-sm font-semibold text-green-900 tabular-nums">{empMax} คน</div>
                </div>
              </div>
              {draftCount > 0 && (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5" /> มีรอบ {draftCount} ช่วงยังเป็นร่าง — SSO/PND.1 ยื่นรายเดือน ต้องปิดทุกช่วงก่อนนับรวม
                </p>
              )}
              </div>
            </details>
          );
        })()}


        {schemaOutdated ? (
          <div className="bg-amber-50 border border-amber-300 rounded-card p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-cool-900 mb-2">ระบบต้องอัปเดตฐานข้อมูลก่อนใช้งาน</h3>
            <p className="text-sm text-cool-600 max-w-md mx-auto">
              ฟีเจอร์รอบจ่ายแบบยืดหยุ่นต้องการโครงสร้างฐานข้อมูลใหม่ กรุณาให้ผู้ดูแลระบบรันไฟล์ migration ล่าสุดใน Supabase ก่อน
            </p>
            <code className="mt-3 inline-block text-[11px] font-mono text-cool-600 bg-white border border-card-border rounded px-3 py-1.5">
              supabase/migrations/20260827*_payroll_*.sql
            </code>
          </div>
        ) : loading ? (
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
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button onClick={handleCreateRun}>
                <Plus className="w-4 h-4" /> สร้างรอบทั้งเดือน
              </Button>
              <Button variant="secondary" onClick={openCreateCustomModal}>
                <CalendarRange className="w-4 h-4" /> สร้างช่วงรอบกำหนดเอง
              </Button>
            </div>
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
                <div className="mt-3 pt-3 border-t border-green-200 flex flex-wrap items-center gap-2">
                  {syncingWht ? (
                    <span className="flex items-center gap-1.5 text-xs text-green-700">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังซิงกรายการภาษีหัก ณ ที่จ่าย...
                    </span>
                  ) : whtSync ? (
                    <span className="text-xs text-green-700">
                      รายการภาษีหัก ณ ที่จ่าย: สร้าง {whtSync.created} · อัปเดต {whtSync.updated} · ยืนยันแล้ว {whtSync.keptDone}
                      {whtSync.skipped.length > 0 ? ` · ข้าม ${whtSync.skipped.length}` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-green-700">รายการภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1/ภ.ง.ด.3) ถูกสร้างอัตโนมัติเมื่อปิดรอบ</span>
                  )}
                  <button
                    onClick={() => navigate(`/wht?source=payroll&month=${run.pay_date.slice(0, 7)}`)}
                    className="ml-auto text-xs font-medium text-green-700 hover:text-green-900 underline underline-offset-2"
                  >
                    ดูที่หน้าภาษีหัก ณ ที่จ่าย →
                  </button>
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
                {runDiff && (runDiff.added > 0 || runDiff.left > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    {runDiff.added > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-green-700">
                        <TrendingUp className="w-3 h-3" />+{runDiff.added} ใหม่
                      </span>
                    )}
                    {runDiff.left > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-cool-500">
                        <TrendingDown className="w-3 h-3" />-{runDiff.left} ลาออก
                      </span>
                    )}
                    <span className="text-cool-400">เทียบเดือนก่อน</span>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard icon={<Users className="w-4 h-4" />} label="พนักงาน" value={`${employees.length} คน`} />
              <SummaryCard icon={<Wallet className="w-4 h-4" />} label="ค่าแรงรวม" value={`฿${formatCurrency(totals.gross)}`} />
              <SummaryCard icon={<Receipt className="w-4 h-4" />} label="หักรวม" value={`฿${formatCurrency(totals.sso + totals.wht)}`} sub={`นายจ้างสมทบ ฿${formatCurrency(totals.ssoEmp)}`} />
              <SummaryCard icon={<Banknote className="w-4 h-4" />} label="สุทธิ" value={`฿${formatCurrency(totals.net)}`} highlight />
            </div>

            {historyRuns.length > 1 && (
              <div className="bg-white border border-card-border rounded-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-cool-400" />
                  <span className="text-xs font-medium text-cool-600">รอบเงินนี้ย้อนหลัง</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {historyRuns.map((hRun) => {
                    const isCurrent = hRun.id === selectedRunId;
                    const fallbackLabel = formatPayRangeLabel({
                      start: hRun.period_start ?? getPayrollPeriod(hRun.period_month ?? 1, hRun.period_year ?? now.getFullYear()).periodStart,
                      end: hRun.period_end ?? `${hRun.period_year}-${String(hRun.period_month).padStart(2, "0")}-28`,
                    });
                    return (
                      <button
                        key={hRun.id}
                        disabled={isCurrent}
                        onClick={() => {
                          setMonth(Number(hRun.period_end.slice(5, 7)));
                          setYear(Number(hRun.period_end.slice(0, 4)));
                          setSelectedRunId(hRun.id);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${isCurrent ? "bg-primary-soft border-primary/30 text-primary-deep" : "bg-white border-card-border text-cool-600 hover:border-primary/30 hover:text-primary"}`}
                      >
                        <span>{hRun.label || fallbackLabel}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${hRun.status === "finalized" ? "bg-green-500" : "bg-amber-400"}`} />
                        {!isCurrent && <span className="tabular-nums text-cool-400">฿{formatCurrency(hRun.total_net)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {run.status === "draft" && employees.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={handlePreviewCopyFromPrevious} disabled={copyingPrevious} className="!text-xs !rounded-lg">
                  <Copy className="w-3.5 h-3.5" />
                  {copyingPrevious ? "กำลังตรวจสอบ..." : "คัดลอกจากรอบก่อนหน้า"}
                </Button>
              </div>
            )}

            {employees.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาพนักงาน..."
                    aria-label="ค้นหาพนักงาน"
                    className="w-full h-9 pl-3 pr-8 text-sm rounded-lg border border-card-border bg-white placeholder:text-cool-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-cool-400 hover:text-cool-600"
                      aria-label="ล้างการค้นหา"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {search && (
                  <span className="text-xs text-cool-500">
                    พบ {filteredEmployees.length} จาก {employees.length} คน
                  </span>
                )}
              </div>
            )}

            <div className="bg-white border border-card-border rounded-card overflow-hidden" ref={tableRef}>
              <div className="max-h-[70vh] overflow-auto">
                <table className={TABLE.table}>
                  <thead>
                    <tr className={TABLE.theadTr}>
                      {run.status === "draft" && <th className={`${TABLE.thStatic} ${TH_STICKY} w-8`}></th>}
                      <th className={`${TABLE.thStatic} ${TH_STICKY}`}>พนักงาน</th>
                      {run.status === "draft" ? (
                        <>
                          {employees.some((e) => e.salary_type === "daily") && (
                            <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>วันทำงาน</th>
                          )}
                          <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>ฐานเงินเดือน</th>
                          <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>OT</th>
                          <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>เงินเพิ่ม</th>
                          <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>เงินหัก</th>
                        </>
                      ) : (
                        <>
                          <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>ค่าแรงรวม</th>
                          <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>SSO (พนักงาน)</th>
                          <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>SSO (นายจ้าง)</th>
                          <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>ภาษี</th>
                        </>
                      )}
                      <th className={`${TABLE.thStatic} ${TH_STICKY} text-right`}>สุทธิ</th>
                      <th className={`${TABLE.thStatic} ${TH_STICKY} w-20`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => {
                      const item = getEffectiveItem(emp.id);
                      const calc = calcLineItem(emp, item);
                      const rowStatus = getRowStatus(emp, item);
                       return (
                         <PayrollRow
                           key={emp.id}
                           employee={emp}
                           calc={calc}
                           status={run.status}
                           rowStatus={rowStatus}
                           highlighted={highlightedEmployeeId === emp.id}
                           daysColumn={run.status === "draft" && employees.some((e) => e.salary_type === "daily")}
                           daysWorked={item.days_worked}
                           inlineEditing={inlineEditingId === emp.id}
                          onToggleInlineEdit={() => setInlineEditingId(inlineEditingId === emp.id ? null : emp.id)}
                          onSaveDaysWorked={async (days) => {
                            const updated = { ...getEffectiveItem(emp.id), days_worked: days };
                            const ok = await handleSaveLineItem(emp.id, updated);
                            if (ok) setInlineEditingId(null);
                            return ok;
                          }}
                          onOpenDetails={() => setDetailEmployee(emp)}
                          onPrint={() => setPrintEmployee(emp)}
                        />
                      );
                    })}
                    {filteredEmployees.length === 0 && search.trim() && (
                      <tr>
                        <td
                          colSpan={run.status === "draft" ? (employees.some((e) => e.salary_type === "daily") ? 9 : 8) : 8}
                          className="py-10 text-center text-xs text-cool-400"
                        >
                          ไม่พบพนักงานที่ตรงกับ "{search.trim()}"
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {run.status === "draft" ? (
                    <tfoot>
                      <tr className={TABLE.tfootTr}>
                        <td className={TF_STICKY}></td>
                        <td className={TF_STICKY}>รวมโดยประมาณ</td>
                        {employees.some((e) => e.salary_type === "daily") && <td className={TF_STICKY}></td>}
                        <td className={`px-3 py-2 text-right tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.base)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.ot)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.additions)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.deductions)}</td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.net)}</td>
                        <td className={TF_STICKY}></td>
                      </tr>
                    </tfoot>
                  ) : (
                  run.status === "finalized" && (
                    <tfoot>
                      <tr className={TABLE.tfootTr}>
                        <td className={TF_STICKY}>รวม</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.gross)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.sso)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.ssoEmp)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.wht)}</td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${TF_STICKY}`}>฿{formatCurrency(totals.net)}</td>
                        <td className={TF_STICKY}></td>
                      </tr>
                    </tfoot>
                  ))}
                </table>
              </div>
            </div>

            {run.status === "finalized" && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleRequestReopen} className="flex-1">
                  เปิดรอบใหม่
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {detailEmployee && detailItem && (() => {
        const rawDetail = getLineItem(detailEmployee.id);
        const tplAdds = detailItem.additions.length - rawDetail.additions.length;
        const tplDeds = detailItem.deductions.length - rawDetail.deductions.length;
        const templateNote = (tplAdds > 0 || tplDeds > 0) && !detailItem.id
          ? `รวมรายการประจำอัตโนมัติแล้ว ${tplAdds + tplDeds} รายการ${tplAdds > 0 ? ` · เงินเพิ่ม ${tplAdds}` : ""}${tplDeds > 0 ? ` · เงินหัก ${tplDeds}` : ""} — กดบันทึกเพื่อยืนยัน`
          : null;
        return (
          <PayrollDetailModal
            employee={detailEmployee}
            run={run}
            initialItem={detailItem}
            settings={settings}
            month={month}
            year={year}
            readOnly={run?.status === "finalized"}
            templateNote={templateNote}
            onSave={async (item) => {
              const ok = await handleSaveLineItem(detailEmployee.id, item);
              if (ok) {
                setDetailEmployee(null);
                await fetchRunDetails();
              }
              return ok;
            }}
            onPrint={() => setPrintEmployee(detailEmployee)}
            onClose={() => setDetailEmployee(null)}
          />
        );
      })()}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="สร้างช่วงรอบเงินเดือน">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="วันเริ่มรอบ"
              type="date"
              value={createForm.start}
              onChange={(e) => setCreateForm((f) => ({ ...f, start: e.target.value }))}
            />
            <Input
              label="วันสิ้นสุดรอบ"
              type="date"
              value={createForm.end}
              onChange={(e) => setCreateForm((f) => ({ ...f, end: e.target.value }))}
            />
          </div>
          <Input
            label="ชื่อรอบ (ถ้าต้องการ)"
            value={createForm.label}
            onChange={(e) => setCreateForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="เช่น รอบที่ 1 · 1–10 ส.ค."
          />
          <Input
            label="วันจ่าย"
            type="date"
            value={createForm.pay_date}
            onChange={(e) => setCreateForm((f) => ({ ...f, pay_date: e.target.value }))}
          />
          <p className="text-xs text-cool-500 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cool-400" />
            ช่วงรอบต้องไม่ทับซ้อนกับรอบอื่น และจะถูกนับยอดภาษี/ประกันสังคมใน "เดือนของวันสิ้นสุดรอบ"
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)} className="flex-1" disabled={creating}>
              ยกเลิก
            </Button>
            <Button onClick={handleCreateCustomRun} className="flex-1" disabled={creating}>
              {creating ? "กำลังสร้าง..." : "สร้างช่วงรอบ"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showDeleteRunModal && run !== null} onClose={() => setShowDeleteRunModal(false)} title="ลบรอบเงินเดือน?">
        {run && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                ต้องการลบรอบ <strong>{run.label || formatPayRangeLabel({ start: run.period_start, end: run.period_end })}</strong>?
                ข้อมูล {run.employee_count} คน (สุทธิ ฿{formatCurrency(run.total_net)}) จะถูกลบถาวรและไม่สามารถย้อนกลับได้
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setShowDeleteRunModal(false)} className="flex-1" disabled={deletingRun}>
                ยกเลิก
              </Button>
              <Button variant="danger" onClick={handleDeleteRun} className="flex-1" disabled={deletingRun}>
                {deletingRun ? "กำลังลบ..." : "ลบรอบ"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showEditRunModal} onClose={() => setShowEditRunModal(false)} title="แก้ไขข้อมูลรอบ">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="วันเริ่มรอบ"
              type="date"
              value={editForm.start}
              onChange={(e) => setEditForm((f) => ({ ...f, start: e.target.value }))}
              disabled={lineItems.size > 0}
            />
            <Input
              label="วันสิ้นสุดรอบ"
              type="date"
              value={editForm.end}
              onChange={(e) => setEditForm((f) => ({ ...f, end: e.target.value }))}
              disabled={lineItems.size > 0}
            />
          </div>
          {lineItems.size > 0 ? (
            <p className="text-xs text-cool-500 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cool-400" />
              รอบนี้มีข้อมูลพนักงานแล้ว — เปลี่ยนช่วงวันที่ได้โดยลบรอบแล้วสร้างใหม่
            </p>
          ) : null}
          <Input
            label="ชื่อรอบ"
            value={editForm.label}
            onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="เช่น รอบที่ 1 · 1–10 ส.ค."
          />
          <Input
            label="วันจ่าย"
            type="date"
            value={editForm.pay_date}
            onChange={(e) => setEditForm((f) => ({ ...f, pay_date: e.target.value }))}
          />
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowEditRunModal(false)} className="flex-1" disabled={editingRun}>
              ยกเลิก
            </Button>
            <Button onClick={handleUpdateRun} className="flex-1" disabled={editingRun}>
              {editingRun ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={copyPreview !== null} onClose={() => setCopyPreview(null)} title="คัดลอกข้อมูลจากรอบก่อนหน้า">
        {copyPreview && (
          <div className="space-y-4">
            <p className="text-sm text-cool-600">
              จะคัดลอกข้อมูลเงินเดือนของพนักงาน <strong>{copyPreview.copyable} คน</strong> จากรอบก่อนหน้า
            </p>
            {copyPreview.overwrite > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  มีพนักงาน <strong>{copyPreview.overwrite} คน</strong> ที่กรอกข้อมูลไว้แล้ว การคัดลอกจะ <strong>แทนที่</strong> ข้อมูลเดิม
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setCopyPreview(null)} className="flex-1">
                ยกเลิก
              </Button>
              <Button onClick={handleConfirmCopyFromPrevious} className="flex-1" disabled={copyPreview.copyable === 0}>
                คัดลอก {copyPreview.copyable} คน
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showFinalizeModal} onClose={() => setShowFinalizeModal(false)} title="ยืนยันปิดรอบเงินเดือน">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              เมื่อปิดรอบแล้ว จะไม่สามารถแก้ไขข้อมูลได้อีก และระบบจะสร้างรายการภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1 / ภ.ง.ด.3) ให้อัตโนมัติ คุณต้องการดำเนินการต่อหรือไม่?
            </p>
          </div>
          {incompleteEmployees.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-800">
                <AlertCircle className="w-4 h-4" />
                ต้องตรวจสอบข้อมูล {incompleteEmployees.length} คนก่อนปิดรอบ
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {incompleteEmployees.map((employee) => (
                  <button
                    key={employee.id}
                    onClick={() => { setHighlightedEmployeeId(employee.id); setShowFinalizeModal(false); }}
                    className="text-xs px-2 py-0.5 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                  >
                    {employee.full_name || employee.employee_code}
                  </button>
                ))}
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

      <Modal open={showReopenModal} onClose={() => setShowReopenModal(false)} title="เปิดรอบใหม่?">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              ข้อมูลเดิมจะถูกเก็บไว้และสามารถแก้ไขได้อีกครั้ง รอบจะถูกนับเป็น revision ใหม่
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowReopenModal(false)} className="flex-1">
              ยกเลิก
            </Button>
            <Button onClick={handleReopen} className="flex-1">
              เปิดรอบใหม่
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
  sub?: string;
  highlight?: boolean;
}

function SummaryCard({ icon, label, value, sub, highlight }: SummaryCardProps) {
  return (
    <div className={`rounded-card border p-3 transition-all duration-200 hover:shadow-sm ${highlight ? "bg-primary-soft border-primary/20" : "bg-white border-card-border"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={highlight ? "text-primary" : "text-cool-400"}>{icon}</span>
        <span className="text-[11px] font-medium text-cool-500">{label}</span>
      </div>
      <div className={`text-base font-bold tabular-nums ${highlight ? "text-primary-deep" : "text-cool-900"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-cool-400 tabular-nums">{sub}</div>}
    </div>
  );
}

interface PayrollExportMenuProps {
  status: "draft" | "finalized";
  onExportSummary: () => void | Promise<void>;
  onExportBank: () => void | Promise<void>;
  onExportWht: () => void | Promise<void>;
  onExportPayslips: () => void | Promise<void>;
  onSyncWht: () => void | Promise<void>;
  syncingWht?: boolean;
}

function PayrollExportMenu({ status, onExportSummary, onExportBank, onExportWht, onExportPayslips, onSyncWht, syncingWht }: PayrollExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function run(key: string, fn: () => void | Promise<void>) {
    if (busy) return;
    setBusy(key);
    setOpen(false);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" variant="secondary" onClick={() => { if (!busy) setOpen(!open); }} className="!rounded-lg" disabled={busy !== null}>
        {busy !== null ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">กำลังสร้าง...</span>
          </span>
        ) : (
          <>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">ส่งออก</span>
          </>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-card-border rounded-lg shadow-lg z-30 py-1">
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-medium text-cool-400">
            {status === "finalized" ? "รอบปิดแล้ว — ส่งออกเอกสารจริง" : "รอบร่าง — ส่งออกได้เฉพาะสรุป/ภาษี"}
          </div>
          <button disabled={busy !== null} onClick={() => run("summary", onExportSummary)} className="w-full text-left px-3 py-2 text-sm hover:bg-cool-25 flex items-center gap-2 disabled:opacity-50">
            {busy === "summary" ? <Loader2 className="w-4 h-4 animate-spin text-green-600" /> : <FileSpreadsheet className="w-4 h-4 text-green-600" />} สรุปเงินเดือน (Excel)
          </button>
          <button disabled={busy !== null} onClick={() => run("wht", onExportWht)} className="w-full text-left px-3 py-2 text-sm hover:bg-cool-25 flex items-center gap-2 disabled:opacity-50">
            {busy === "wht" ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <FileSpreadsheet className="w-4 h-4 text-blue-600" />} ภาษีหัก ณ ที่จ่าย (Excel)
          </button>
          {status === "finalized" && (
            <>
              <div className="border-t border-card-border my-1" />
              <button disabled={busy !== null || syncingWht} onClick={() => run("syncwht", onSyncWht)} className="w-full text-left px-3 py-2 text-sm hover:bg-cool-25 flex items-center gap-2 disabled:opacity-50">
                {busy === "syncwht" || syncingWht ? <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> : <RefreshCw className="w-4 h-4 text-teal-600" />} ซิงก์รายการภาษีหัก ณ ที่จ่าย
              </button>
              <button disabled={busy !== null} onClick={() => run("bank", onExportBank)} className="w-full text-left px-3 py-2 text-sm hover:bg-cool-25 flex items-center gap-2 disabled:opacity-50">
                {busy === "bank" ? <Loader2 className="w-4 h-4 animate-spin text-purple-600" /> : <FileSpreadsheet className="w-4 h-4 text-purple-600" />} รายการโอนธนาคาร (Excel)
              </button>
              <button disabled={busy !== null} onClick={() => run("payslips", onExportPayslips)} className="w-full text-left px-3 py-2 text-sm hover:bg-cool-25 flex items-center gap-2 disabled:opacity-50">
                {busy === "payslips" ? <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> : <FileArchive className="w-4 h-4 text-amber-600" />} สลิปเงินเดือนทั้งหมด (ZIP)
              </button>
            </>
          )}
        </div>
      )}
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
  highlighted?: boolean;
  daysColumn?: boolean;
  daysWorked?: number | null;
  inlineEditing?: boolean;
  onToggleInlineEdit?: () => void;
  onSaveDaysWorked?: (days: number | null) => Promise<boolean>;
  onOpenDetails: () => void;
  onPrint: () => void;
}

const ROW_STATUS_LABELS: Record<RowStatus, string> = {
  complete: "กรอกครบแล้ว",
  warning: "มีข้อมูลที่ต้องตรวจสอบ",
  incomplete: "ยังกรอกไม่ครบ",
  untouched: "ยังไม่ได้กรอก",
};

function PayrollRow({ employee, calc, status, rowStatus, highlighted, daysColumn, daysWorked, inlineEditing, onToggleInlineEdit, onSaveDaysWorked, onOpenDetails, onPrint }: PayrollRowProps) {
  const statusColors: Record<RowStatus, string> = {
    complete: "border-l-green-500",
    warning: "border-l-amber-400",
    incomplete: "border-l-red-400",
    untouched: "border-l-cool-200",
  };

  const statusIcons: Record<RowStatus, React.ReactNode> = {
    complete: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
    warning: <AlertCircle className="w-3.5 h-3.5 text-amber-500" />,
    incomplete: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
    untouched: <Circle className="w-3.5 h-3.5 text-cool-300" />,
  };

  const statusLabels: Record<RowStatus, string> = {
    complete: "กรอกครบแล้ว",
    warning: "มีข้อมูลที่ต้องตรวจสอบ",
    incomplete: "ยังกรอกไม่ครบ",
    untouched: "ยังไม่ได้กรอก",
  };

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`${employee.full_name}, ${statusLabels[rowStatus]}`}
      onClick={onOpenDetails}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetails(); } }}
      className={`${TABLE.tbodyTr} group hover:bg-cool-25/50 transition-colors duration-150 border-l-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40 ${statusColors[rowStatus]} ${highlighted ? "ring-2 ring-inset ring-amber-400 bg-amber-50/40" : ""}`}
    >
      {status === "draft" && (
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <span className="shrink-0" title={statusLabels[rowStatus]}>{statusIcons[rowStatus]}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-cool-25 text-cool-400 hover:text-cool-700 transition-colors"
              aria-label={`แก้ไขเงินเดือน ${employee.full_name}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      )}
      {status === "finalized" && (
        <td className="px-2 py-2">
          <span className="shrink-0" title={statusLabels[rowStatus]}>{statusIcons[rowStatus]}</span>
        </td>
      )}
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-cool-900 font-medium">{employee.full_name}</span>
            {employee.status === "inactive" && employee.end_date && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-cool-100 text-cool-500 font-medium">
                <UserRoundX className="w-3 h-3" />
                ลาออก {formatThaiDate(employee.end_date)}
              </span>
            )}
          </div>
          <span className="text-cool-400 text-[10px]">{employee.employee_code} · {employee.position}</span>
        </div>
      </td>
      {status === "draft" ? (
        <>
          {daysColumn && (
            <td className="px-3 py-2 text-right">
              {employee.salary_type === "daily" ? (
                inlineEditing && onSaveDaysWorked ? (
                  <InlineDaysWorked
                    value={daysWorked ?? null}
                    onSave={onSaveDaysWorked}
                    onCancel={() => onToggleInlineEdit?.()}
                  />
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleInlineEdit?.(); }}
                    className="tabular-nums text-cool-700 hover:text-primary hover:underline transition-colors cursor-pointer"
                    aria-label={`แก้ไขวันทำงาน ${employee.full_name}`}
                  >
                    {daysWorked !== null && daysWorked !== undefined ? `${daysWorked} วัน` : "—"}
                  </button>
                )
              ) : (
                <span className="text-cool-300" title="พนักงานรายเดือน — ไม่นับวันทำงาน">—</span>
              )}
            </td>
          )}
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
            {employee.sso_registered === false ? (
              <span className="text-cool-300">—</span>
            ) : (
              <span className="text-cool-400 tabular-nums">฿{formatCurrency(calc.sso_employee)}</span>
            )}
          </td>
          <td className="px-3 py-2 text-right">
            {employee.sso_registered === false ? (
              <span className="text-cool-300">—</span>
            ) : (
              <span className="text-cool-400 tabular-nums">฿{formatCurrency(calc.sso_employer)}</span>
            )}
          </td>
          <td className="px-3 py-2 text-right">
            {employee.sso_registered === false ? (
              <span className="text-cool-400 tabular-nums" title="ภ.ง.ด.3 · ค่าจ้างทำของ 3%">
                ฿{formatCurrency(calc.withholding_tax)} <span className="text-[10px] text-cool-300">3%</span>
              </span>
            ) : (
              <span className="text-cool-400 tabular-nums">฿{formatCurrency(calc.withholding_tax)}</span>
            )}
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

interface InlineDaysWorkedProps {
  value: number | null;
  onSave: (days: number | null) => Promise<boolean>;
  onCancel: () => void;
}

function InlineDaysWorked({ value, onSave, onCancel }: InlineDaysWorkedProps) {
  const [val, setVal] = useState<string>(value !== null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function commit() {
    if (saving) return;
    const days = val === "" ? null : parseFloat(val);
    if (days !== null && (isNaN(days) || days < 0)) return;
    setSaving(true);
    await onSave(days);
    setSaving(false);
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="1"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        disabled={saving}
        className="w-16 h-7 text-right text-[11px] tabular-nums rounded border border-primary/40 bg-white px-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        aria-label="วันทำงาน"
      />
      <span className="text-[10px] text-cool-400">วัน</span>
    </div>
  );
}

interface PayrollDetailModalProps {
  employee: Employee;
  run: PayrollRun | null;
  initialItem: PayrollLineItem;
  settings: PayrollSettings;
  month: number;
  year: number;
  readOnly: boolean;
  templateNote?: string | null;
  onSave: (item: PayrollLineItem) => Promise<boolean>;
  onPrint: () => void;
  onClose: () => void;
}

function PayrollDetailModal({ employee, run, initialItem, settings, month, year, readOnly, templateNote, onSave, onPrint, onClose }: PayrollDetailModalProps) {
  const [localItem, setLocalItem] = useState<PayrollLineItem>(initialItem);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiscardModalLocal, setShowDiscardModalLocal] = useState(false);

  // Mid-month leaver: suggest pro-ration through the absent_days mechanism
  const isLeaverInPeriod =
    !readOnly &&
    employee.salary_type === "monthly" &&
    !!run &&
    !!employee.end_date &&
    employee.end_date >= run.period_start &&
    employee.end_date <= run.period_end;
  const leaverSuggestion = isLeaverInPeriod
    ? suggestLeaveProrate(employee.end_date as string, settings, run ? Number(run.period_end.slice(0, 4)) : undefined)
    : null;

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
      setShowDiscardModalLocal(true);
      return;
    }
    onClose();
  }

  function handleConfirmDiscard() {
    setShowDiscardModalLocal(false);
    onClose();
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(localItem);
    setSaving(false);
    if (ok) setDirty(false);
  }

  const hourlyRate = getEffectiveHourlyRate(employee.salary_type, employee.base_salary, resolveDivisorDays(settings, run ? Number(run.period_end.slice(5, 7)) : month, run ? Number(run.period_end.slice(0, 4)) : year));

  return (
    <>
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

        {isLeaverInPeriod && leaverSuggestion && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-blue-800">
                พนักงานลาออกวันที่ {formatThaiDate(employee.end_date as string)} (กลางรอบ) — แนะนำปรับค่าจ้างตามสัดส่วนวันที่ทำงาน
              </p>
              <button
                type="button"
                onClick={() => updateLocal({ absent_days: leaverSuggestion.absent_days })}
                disabled={leaverSuggestion.absent_days === 0}
                className="mt-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                กรอกข้อเสนอให้ ({leaverSuggestion.absent_days} วันเทียบเท่าถึงสิ้นรอบ — คำนวณค่าจ้างตามสัดส่วน)
              </button>
            </div>
          </div>
        )}

        {templateNote && (
          <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 flex items-start gap-2">
            <Receipt className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-primary-deep">{templateNote}</p>
          </div>
        )}

        {(employee.salary_type === "daily" || settings.absence_deduction !== false) && (
          <div className="flex flex-wrap gap-4">
            {employee.salary_type === "daily" && (
              <div className="max-w-[180px]">
                <Input
                  label="วันทำงาน"
                  type="number"
                  min="0"
                  value={localItem.days_worked ?? ""}
                  onChange={(e) => updateLocal({ days_worked: e.target.value === "" ? null : parseFloat(e.target.value) || null })}
                  placeholder="0"
                  disabled={readOnly}
                />
              </div>
            )}
            {settings.absence_deduction !== false && (
              <div className="max-w-[180px]">
                <Input
                  label={employee.salary_type === "monthly" ? "วันขาดงาน (หักอัตโนมัติ)" : "วันลา/ขาด (บันทึกเพื่อติดตาม)"}
                  type="number"
                  min="0"
                  step="0.5"
                  value={localItem.absent_days ?? ""}
                  onChange={(e) => updateLocal({ absent_days: e.target.value === "" ? null : parseFloat(e.target.value) || null })}
                  placeholder="0"
                  disabled={readOnly}
                />
                {employee.salary_type === "monthly" ? (
                  <p className="text-[10px] text-cool-400 mt-1">
                    หัก {formatCurrency(localItem.absence_daily_rate ?? employee.base_salary / resolveDivisorDays(settings, month, year))} / วัน
                    {localItem.absence_daily_rate ? " (กำหนดเอง)" : " (อัตโนมัติ)"}
                  </p>
                ) : (
                  <p className="text-[10px] text-cool-400 mt-1">ไม่หักซ้ำ — วันที่ไม่มาไม่ได้รับค่าจ้างผ่านวันทำงานแล้ว</p>
                )}
              </div>
            )}
            {employee.salary_type === "monthly" && settings.absence_deduction !== false && (
              <div className="max-w-[180px]">
                <Input
                  label="ค่าหักต่อวัน (กำหนดเอง)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={localItem.absence_daily_rate ?? ""}
                  onChange={(e) => updateLocal({ absence_daily_rate: e.target.value === "" ? null : parseFloat(e.target.value) || null })}
                  placeholder={(employee.base_salary / resolveDivisorDays(settings, month, year)).toFixed(2)}
                  disabled={readOnly}
                />
                <p className="text-[10px] text-cool-400 mt-1">เว้นว่าง = ใช้อัตราอัตโนมัติ</p>
              </div>
            )}
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

        <CalculationBreakdown employee={employee} lineItem={localItem} settings={settings} month={month} year={year} />

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

    <Modal open={showDiscardModalLocal} onClose={() => setShowDiscardModalLocal(false)} title="ยกเลิกการแก้ไข?">
      <div className="space-y-4">
        <p className="text-sm text-cool-600">มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการยกเลิกและออกหรือไม่?</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowDiscardModalLocal(false)} className="flex-1">
            แก้ไขต่อ
          </Button>
          <Button variant="danger" onClick={handleConfirmDiscard} className="flex-1">
            ยกเลิกการแก้ไข
          </Button>
        </div>
      </div>
    </Modal>
    </>
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
                    min="0"
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
                    min="0"
                    step="0.5"
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
                    min="0"
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
                    min="0"
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
  year: number;
}

function CalculationBreakdown({ employee, lineItem, settings, month, year }: CalculationBreakdownProps) {
  const divisorDays = settings.prorate_mode === "actual_days" ? getMonthDays(month, year) : (settings.ot_divisor || 30);
  const hourlyRate = getEffectiveHourlyRate(employee.salary_type, employee.base_salary, divisorDays);
  const basePay = employee.salary_type === "daily"
    ? employee.base_salary * (lineItem.days_worked ?? 0)
    : employee.base_salary;

  const totalOT = lineItem.ot_entries.reduce((sum, ot) => sum + (Number(ot.hours) * hourlyRate * Number(ot.multiplier)), 0);
  const totalAdditions = lineItem.additions.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const totalDeductions = lineItem.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const absence = calculateAbsenceDeduction(
    { salary_type: employee.salary_type, base_salary: employee.base_salary, absent_days: lineItem.absent_days, absence_daily_rate: lineItem.absence_daily_rate },
    settings,
    divisorDays
  );
  const gross = Math.max(0, basePay + totalOT + totalAdditions - absence);

  const calc = calculateBreakdown(
    { salary_type: employee.salary_type, base_salary: employee.base_salary, days_worked: lineItem.days_worked, absent_days: lineItem.absent_days, absence_daily_rate: lineItem.absence_daily_rate, ot_entries: lineItem.ot_entries, additions: lineItem.additions, deductions: lineItem.deductions, sso_registered: employee.sso_registered !== false },
    settings,
    month,
    year
  );

  const absenceDailyRate = lineItem.absence_daily_rate && lineItem.absence_daily_rate > 0
    ? lineItem.absence_daily_rate
    : employee.base_salary / divisorDays;

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
          {calc.absence_deduction > 0 && (
            <div className="flex justify-between">
              <span className="text-cool-500">หักวันไม่ทำงาน ({lineItem.absent_days} วัน × ฿{formatCurrency(absenceDailyRate)}/วัน)</span>
              <span className="text-red-500 tabular-nums font-medium">-฿{formatCurrency(calc.absence_deduction)}</span>
            </div>
          )}
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
          {employee.sso_registered === false ? (
            <>
              <div className="flex justify-between">
                <span className="text-cool-500">ประกันสังคม</span>
                <span className="text-cool-300">— ไม่ลงทะเบียน</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cool-500">ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.3 · ค่าจ้างทำของ 3%)</span>
                <span className="text-red-500 tabular-nums font-medium">-฿{formatCurrency(calc.withholding_tax)}</span>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
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
  company?: PayslipCompany | null;
  onBack: () => void;
  onPrint?: () => void;
}

function PayslipView({ employee, run, lineItem, settings, company, onBack, onPrint }: PayslipViewProps) {
  const calc = calculateBreakdown(
    {
      salary_type: employee.salary_type,
      base_salary: employee.base_salary,
      days_worked: lineItem.days_worked,
      absent_days: lineItem.absent_days,
      absence_daily_rate: lineItem.absence_daily_rate,
      ot_entries: lineItem.ot_entries,
      additions: lineItem.additions,
      deductions: lineItem.deductions,
      sso_registered: employee.sso_registered !== false,
    },
    settings,
    run?.period_month ?? 1,
    run ? Number(run.period_end.slice(0, 4)) : undefined
  );

  function handlePrint() {
    onPrint?.();
    window.print();
  }

  const basePay = employee.salary_type === "daily"
    ? employee.base_salary * (lineItem.days_worked ?? 0)
    : employee.base_salary;

  const totalDeductions = lineItem.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const absenceDailyRate = lineItem.absence_daily_rate && lineItem.absence_daily_rate > 0
    ? lineItem.absence_daily_rate
    : employee.base_salary / resolveDivisorDays(settings, run?.period_month ?? 1, run ? Number(run.period_end.slice(0, 4)) : undefined);

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
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-start gap-3 min-w-0">
                {company?.logoUrl && (
                  <img src={company.logoUrl} alt="" className="w-11 h-11 object-contain rounded-lg border border-card-border p-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  {company?.name && <div className="text-[15px] font-bold text-ink-900 leading-tight">{company.name}</div>}
                  {company?.address && <div className="text-[11px] text-ink-400 mt-0.5 leading-snug">{company.address}</div>}
                  {company?.taxId && <div className="text-[11px] text-ink-400">เลขประจำตัวผู้เสียภาษี {company.taxId}{company?.phone ? ` · โทร ${company.phone}` : ""}</div>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <h1 className="text-xl font-bold text-ink-900">สลิปเงินเดือน</h1>
                <p className="text-xs text-ink-400 mt-0.5">Pay Slip · {MONTHS[(run?.period_month ?? 1) - 1]?.label} {(run?.period_year ?? 2025) + 543}</p>
                <div className="text-xs text-ink-400 mt-1">วันจ่าย</div>
                <div className="text-sm font-medium text-ink-700">{run?.pay_date}</div>
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
                  {calc.absence_deduction > 0 && (
                    <div className="flex justify-between">
                      <span className="text-ink-500">หักวันไม่ทำงาน ({lineItem.absent_days} วัน × ฿{formatCurrency(absenceDailyRate)}/วัน)</span>
                      <span className="text-ink-700 tabular-nums font-medium">-฿{formatCurrency(calc.absence_deduction)}</span>
                    </div>
                  )}
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
                  {employee.sso_registered === false ? (
                    <div className="flex justify-between">
                      <span className="text-ink-500">ประกันสังคม</span>
                      <span className="text-ink-300">— ไม่ลงทะเบียน</span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-ink-500">ประกันสังคม (พนักงาน)</span>
                      <span className="text-ink-700 tabular-nums font-medium">-฿{formatCurrency(calc.sso_employee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-ink-500">{employee.sso_registered === false ? "ภาษีหัก ณ ที่จ่าย (ค่าจ้างทำของ 3%)" : "ภาษีหัก ณ ที่จ่าย"}</span>
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
              <div className="text-right text-xs text-ink-400 mt-1">({thaiNumberToWords(calc.net_pay)})</div>
              {employee.sso_registered !== false ? (
                <p className="text-[11px] text-ink-400 mt-2">นายจ้างสมทบประกันสังคม ฿{formatCurrency(calc.sso_employer)} (ไม่หักจากเงินเดือนสุทธิของพนักงาน)</p>
              ) : (
                <p className="text-[11px] text-ink-400 mt-2">พนักงานไม่ได้ลงทะเบียนประกันสังคม — ภาษีข้างต้นยื่นแบบ ภ.ง.ด.3 (ค่าจ้างทำของ 3%)</p>
              )}
              <div className="grid grid-cols-2 gap-8 mt-7 print:mt-8">
                <div className="text-center text-xs text-ink-500">
                  <div className="border-b border-dotted border-ink-400 h-7 mb-1" />
                  ผู้จ่ายเงิน · วันที่ ......../......../........
                </div>
                <div className="text-center text-xs text-ink-500">
                  <div className="border-b border-dotted border-ink-400 h-7 mb-1" />
                  ผู้รับเงิน · วันที่ ......../......../........
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hourlyRateFor(employee: Employee, settings: PayrollSettings) {
  return getEffectiveHourlyRate(employee.salary_type, employee.base_salary, settings.ot_divisor || 30);
}