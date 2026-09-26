import { supabase } from "../supabase";
import type { Employee, PayrollLineItem, PayrollRun } from "../../types";
import type { PayrollSettings } from "./calculations";
import type { RecurringTemplate } from "./recurring";
import type { PayrollCalcRow } from "./reportXlsx";
import { buildPayrollCalcRows, payrollRunPeriod } from "./rows";

const DEFAULT_SETTINGS: PayrollSettings = {
  ot_divisor: 30,
  normal_ot_multiplier: 1.5,
  holiday_ot_multiplier: 3.0,
};

export interface PayrollExportBundle {
  run: PayrollRun;
  employees: Employee[];
  settings: PayrollSettings;
  rows: PayrollCalcRow[];
  /** Raw inputs retained so callers can recompute per-employee detail (payslips). */
  lineItems: Map<string, PayrollLineItem>;
  recurringByEmployee: Map<string, RecurringTemplate[]>;
  month: number;
  year: number;
}

/** Most recent payroll runs for the run picker. */
export async function listPayrollRuns(userId: string, limit = 24): Promise<PayrollRun[]> {
  const { data } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("user_id", userId)
    .order("period_end", { ascending: false })
    .limit(limit);
  return (data ?? []) as PayrollRun[];
}

/**
 * Reconstruct everything the payroll export builders need for one run,
 * mirroring the Payroll page's own data load so totals match exactly.
 */
export async function loadPayrollExportBundle(
  userId: string,
  runId: string,
): Promise<PayrollExportBundle> {
  const { data: run, error } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .single();
  if (error || !run) throw new Error("ไม่พบรอบจ่ายเงินเดือน");
  const payrollRun = run as PayrollRun;
  const { month, year } = payrollRunPeriod(payrollRun);

  const [{ data: empData }, { data: recData }, { data: itemsData }, { data: settingsData }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("*")
        .eq("user_id", userId)
        .lte("start_date", payrollRun.period_end)
        .or(`end_date.is.null,end_date.gte.${payrollRun.period_start}`)
        .order("employee_code"),
      supabase.from("payroll_recurring_items").select("*").eq("user_id", userId).eq("active", true),
      supabase.from("payroll_line_items").select("*").eq("payroll_run_id", payrollRun.id),
      supabase.from("client_payroll_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

  const employees = (empData ?? []) as Employee[];
  const recurringByEmployee = new Map<string, RecurringTemplate[]>();
  for (const template of (recData ?? []) as RecurringTemplate[]) {
    const list = recurringByEmployee.get(template.employee_id) ?? [];
    list.push(template);
    recurringByEmployee.set(template.employee_id, list);
  }
  const lineItems = new Map<string, PayrollLineItem>();
  for (const item of (itemsData ?? []) as PayrollLineItem[]) lineItems.set(item.employee_id, item);

  const settings = (settingsData as PayrollSettings | null) ?? DEFAULT_SETTINGS;
  // OT rounds pay OT only: same scope the payroll page applies, so exports match.
  const otOnly = payrollRun.batch_type === "ot";
  const rows = buildPayrollCalcRows({
    employees,
    lineItems,
    settings,
    month,
    year,
    recurringByEmployee,
    runId: payrollRun.id,
    calcOpts: otOnly ? { scope: "ot-only" } : undefined,
    includeRecurring: !otOnly,
  });

  return {
    run: payrollRun,
    employees,
    settings,
    rows,
    lineItems,
    recurringByEmployee,
    month,
    year,
  };
}
