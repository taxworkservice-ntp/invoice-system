import { supabase } from "./supabase";
import { applyAttribution, computeMonthData, type MonthDataResult } from "./payroll/monthClose";
import { buildPayrollCalcRows, resolveEffectiveLineItem } from "./payroll/rows";
import type { PayrollSettings } from "./payroll/calculations";
import type { RecurringTemplate } from "./payroll/recurring";
import type { PayrollCalcRow } from "./payroll/reportXlsx";
import type { ClientProfile, Employee, PayrollLineItem, PayrollRun } from "../types";

const DEFAULT_SETTINGS: PayrollSettings = {
  ot_divisor: 30,
  normal_ot_multiplier: 1.5,
  holiday_ot_multiplier: 3.0,
};

export interface AdminMonthBundle {
  year: number;
  month: number;
  employees: Employee[];
  runs: PayrollRun[];
  settings: PayrollSettings;
  profile: ClientProfile | null;
  recurringByEmployee: Map<string, RecurringTemplate[]>;
  storedByRun: Map<string, Map<string, PayrollLineItem>>;
  monthData: MonthDataResult | null;
  /** Labels of draft rounds included (workbook scope lines + audit). */
  draftLabels: string[];
}

/**
 * Load everything the admin export center needs for one client's statutory
 * month. Always-anytime semantics: finalized rounds at stored numbers, draft
 * rounds at their currently saved working values.
 */
export async function fetchAdminMonthBundle(
  clientUserId: string,
  year: number,
  month: number,
): Promise<AdminMonthBundle> {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStart = `${year}-${mm}-01`;
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const { data: runsData } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("user_id", clientUserId)
    .gte("period_end", monthStart)
    .lte("period_end", monthEnd)
    .order("period_start");
  const runs = (runsData ?? []) as PayrollRun[];
  const runIds = runs.map((r) => r.id);

  const [
    { data: empData },
    { data: itemsData },
    { data: recData },
    { data: settingsData },
    { data: profileData },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("*")
      .eq("user_id", clientUserId)
      .lte("start_date", monthEnd)
      .or(`end_date.is.null,end_date.gte.${monthStart}`)
      .order("employee_code"),
    runIds.length > 0
      ? supabase.from("payroll_line_items").select("*").in("payroll_run_id", runIds)
      : Promise.resolve({ data: [] as PayrollLineItem[] }),
    supabase
      .from("payroll_recurring_items")
      .select("*")
      .eq("user_id", clientUserId)
      .eq("active", true),
    supabase.from("client_payroll_settings").select("*").eq("user_id", clientUserId).maybeSingle(),
    supabase.from("client_profiles").select("*").eq("user_id", clientUserId).maybeSingle(),
  ]);

  const employees = (empData ?? []) as Employee[];
  const settings = (settingsData as PayrollSettings | null) ?? DEFAULT_SETTINGS;
  const profile = (profileData as ClientProfile | null) ?? null;

  const recurringByEmployee = new Map<string, RecurringTemplate[]>();
  for (const t of (recData ?? []) as RecurringTemplate[]) {
    const list = recurringByEmployee.get(t.employee_id) ?? [];
    list.push(t);
    recurringByEmployee.set(t.employee_id, list);
  }
  const storedByRun = new Map<string, Map<string, PayrollLineItem>>();
  for (const item of (itemsData ?? []) as PayrollLineItem[]) {
    const map = storedByRun.get(item.payroll_run_id) ?? new Map<string, PayrollLineItem>();
    map.set(item.employee_id, item);
    storedByRun.set(item.payroll_run_id, map);
  }

  const effectiveItems = new Map<string, Map<string, PayrollLineItem>>();
  for (const r of runs) {
    const perEmp = new Map<string, PayrollLineItem>();
    const includeRecurring = (r.batch_type ?? "salary") !== "ot";
    for (const emp of employees) {
      perEmp.set(
        emp.id,
        resolveEffectiveLineItem(
          emp.id,
          storedByRun.get(r.id) ?? new Map(),
          recurringByEmployee,
          r.id,
          {
            includeRecurring,
          },
        ),
      );
    }
    effectiveItems.set(r.id, perEmp);
  }

  const monthData = computeMonthData({ employees, runs, effectiveItems, settings, month, year });
  const draftLabels = runs
    .filter((r) => r.status === "draft")
    .map((r) => r.label || `${r.period_start} → ${r.period_end}`);

  return {
    year,
    month,
    employees,
    runs,
    settings,
    profile,
    recurringByEmployee,
    storedByRun,
    monthData,
    draftLabels,
  };
}

/**
 * Per-run calc rows for exports, with monthly attribution applied on draft
 * rounds — the same numbers the client table shows.
 */
export function buildAdminCalcRows(bundle: AdminMonthBundle, run: PayrollRun): PayrollCalcRow[] {
  const otOnly = (run.batch_type ?? "salary") === "ot";
  const rows = buildPayrollCalcRows({
    employees: bundle.employees,
    lineItems: bundle.storedByRun.get(run.id) ?? new Map(),
    settings: bundle.settings,
    month: bundle.month,
    year: bundle.year,
    recurringByEmployee: bundle.recurringByEmployee,
    runId: run.id,
    calcOpts: otOnly ? { scope: "ot-only" } : undefined,
    includeRecurring: !otOnly,
  });
  if (run.status !== "draft") return rows;
  const perEmp = bundle.monthData?.attributed.get(run.id);
  if (!perEmp) return rows;
  return rows.map((r) => {
    if (r.employee.sso_registered === false) return r;
    const attr = perEmp.get(r.employee.id);
    return attr ? { ...r, ...applyAttribution(r, attr, bundle.settings.rounding_rule) } : r;
  });
}
