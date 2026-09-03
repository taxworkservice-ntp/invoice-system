import { supabase } from "../supabase";
import { PND3_HIRE_RATE } from "./calculations";
import { formatPayRangeLabel } from "./schedule";
import { assignWhtCertificateNo } from "../whtCertificate";
import type { Employee, PayrollRun } from "../../types";

export interface WhtSyncSkip {
  employee_code: string;
  full_name: string;
  reason: "no_tax_id" | "unsaved" | "no_vendor" | "excluded";
}

export interface WhtSyncOptions {
  /** When set, only these employees are synced; unconfirmed rows of excluded employees are removed. */
  onlyEmployeeIds?: string[];
}

export interface WhtSyncResult {
  created: number;
  updated: number;
  deleted: number;
  keptDone: number;
  skipped: WhtSyncSkip[];
}

export function normalizeTaxId(taxId: string | null | undefined): string {
  return (taxId ?? "").replace(/[\s-]/g, "");
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || /column .* does not exist/i.test(error.message ?? "")));
}

function backComputedRate(amount: number, whtAmount: number): number {
  if (amount <= 0) return 0;
  return Math.round((whtAmount / amount) * 100 * 100) / 100;
}

export async function syncRunToWht(userId: string, run: PayrollRun, opts?: WhtSyncOptions): Promise<WhtSyncResult> {
  const result: WhtSyncResult = { created: 0, updated: 0, deleted: 0, keptDone: 0, skipped: [] };
  const allowlist = opts?.onlyEmployeeIds ? new Set(opts.onlyEmployeeIds) : null;

  const [{ data: itemsData, error: itemsError }, { data: existingRecords, error: recordsError }] =
    await Promise.all([
      supabase
        .from("payroll_line_items")
        .select("employee_id, gross_pay, withholding_tax")
        .eq("payroll_run_id", run.id),
      supabase
        .from("wht_records")
        .select("id, employee_id, status, vendor_id")
        .eq("payroll_run_id", run.id)
        .eq("source", "payroll"),
    ]);

  if (isMissingColumnError(itemsError) || isMissingColumnError(recordsError)) {
    throw new Error("ยังไม่ได้อัปเดตฐานข้อมูล — กรุณารัน migration wht_payroll_link ก่อน");
  }
  if (itemsError) throw itemsError;
  if (recordsError) throw recordsError;

  const items = (itemsData ?? []) as { employee_id: string; gross_pay: number | null; withholding_tax: number | null }[];
  const existing = (existingRecords ?? []) as {
    id: string;
    employee_id: string | null;
    status: "active" | "done";
    vendor_id: string;
  }[];

  const itemByEmployee = new Map(items.map((item) => [item.employee_id, item]));
  const employeeIds = [...itemByEmployee.keys()];
  const existingByEmployee = new Map(
    existing.filter((record) => record.employee_id).map((record) => [record.employee_id as string, record]),
  );

  if (employeeIds.length > 0) {
    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("*")
      .in("id", employeeIds);
    if (employeesError) throw employeesError;

    const employees = (employeesData ?? []) as Employee[];
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

    const { data: vendorsData, error: vendorsError } = await supabase
      .from("wht_vendors")
      .select("*")
      .eq("user_id", userId);
    if (vendorsError) throw vendorsError;

    const vendors = (vendorsData ?? []) as { id: string; tax_id: string | null; is_active: boolean }[];
    const vendorByTaxId = new Map(
      vendors.filter((vendor) => vendor.is_active).map((vendor) => [normalizeTaxId(vendor.tax_id), vendor.id]),
    );
    const vendorIdByEmployee = new Map<string, string>();
    const vendorCreateQueue = new Map<string, { employee: Employee; taxId: string }>();

    for (const employee of employees) {
      const taxId = normalizeTaxId(employee.tax_id);
      if (!taxId) continue;
      const matched = vendorByTaxId.get(taxId);
      if (matched) {
        vendorIdByEmployee.set(employee.id, matched);
      } else if (!vendorCreateQueue.has(taxId)) {
        vendorCreateQueue.set(taxId, { employee, taxId });
      }
    }

    if (vendorCreateQueue.size > 0) {
      const { data: createdVendors, error: createError } = await supabase
        .from("wht_vendors")
        .insert(
          [...vendorCreateQueue.values()].map(({ employee, taxId }) => ({
            user_id: userId,
            name: employee.full_name || employee.employee_code,
            vendor_type: "individual" as const,
            tax_id: employee.tax_id,
          })),
        )
        .select("id, tax_id");
      if (createError) throw createError;
      for (const vendor of (createdVendors ?? []) as { id: string; tax_id: string | null }[]) {
        vendorByTaxId.set(normalizeTaxId(vendor.tax_id), vendor.id);
      }
      for (const { employee } of [...vendorCreateQueue.values()]) {
        const vendorId = vendorByTaxId.get(normalizeTaxId(employee.tax_id));
        if (vendorId) vendorIdByEmployee.set(employee.id, vendorId);
      }
    }

    const periodLabel = run.label || formatPayRangeLabel({ start: run.period_start, end: run.period_end });
    const insertedIds: { id: string; issueDate: string }[] = [];

    for (const [employeeId, item] of itemByEmployee) {
      const employee = employeeById.get(employeeId);
      if (!employee) continue;
      if (allowlist && !allowlist.has(employeeId)) {
        const existingRecord = existingByEmployee.get(employeeId);
        if (existingRecord) {
          if (existingRecord.status === "done") {
            result.keptDone++;
          } else {
            const { error: deleteError } = await supabase.from("wht_records").delete().eq("id", existingRecord.id);
            if (deleteError) throw deleteError;
            result.deleted++;
          }
        }
        result.skipped.push({
          employee_code: employee.employee_code,
          full_name: employee.full_name,
          reason: "excluded",
        });
        continue;
      }
      const taxId = normalizeTaxId(employee.tax_id);
      const vendorId = vendorIdByEmployee.get(employeeId);
      if (!taxId) {
        result.skipped.push({
          employee_code: employee.employee_code,
          full_name: employee.full_name,
          reason: "no_tax_id",
        });
        continue;
      }
      if (item.gross_pay == null || item.withholding_tax == null) {
        result.skipped.push({
          employee_code: employee.employee_code,
          full_name: employee.full_name,
          reason: "unsaved",
        });
        continue;
      }

      const isContract = employee.sso_registered === false;
      const formType = isContract ? "pnd3" : "pnd1";
      const description = isContract ? "ค่าจ้างทำของ" : `เงินเดือน ${periodLabel}`;
      const rate = isContract ? PND3_HIRE_RATE * 100 : backComputedRate(item.gross_pay, item.withholding_tax);

      const fields = {
        form_type: formType as "pnd1" | "pnd3",
        issue_date: run.pay_date,
        amount: item.gross_pay,
        wht_rate: rate,
        wht_amount: item.withholding_tax,
        description,
        source: "payroll" as const,
        payroll_run_id: run.id,
        employee_id: employeeId,
      };

      const existingRecord = existingByEmployee.get(employeeId);
      if (existingRecord) {
        if (existingRecord.status === "done") {
          result.keptDone++;
          continue;
        }
        const { error: updateError } = await supabase
          .from("wht_records")
          .update(fields)
          .eq("id", existingRecord.id);
        if (updateError) throw updateError;
        result.updated++;
      } else if (vendorId) {
        const { data: inserted, error: insertError } = await supabase
          .from("wht_records")
          .insert({ ...fields, vendor_id: vendorId, user_id: userId })
          .select("id")
          .single();
        if (insertError) throw insertError;
        insertedIds.push({ id: (inserted as { id: string }).id, issueDate: run.pay_date });
        result.created++;
      } else {
        result.skipped.push({
          employee_code: employee.employee_code,
          full_name: employee.full_name,
          reason: "no_vendor",
        });
      }
    }

    for (const { id, issueDate } of insertedIds) {
      try {
        await assignWhtCertificateNo(id, userId, issueDate);
      } catch {
        continue;
      }
    }
  }

  const currentEmployeeIds = new Set(itemByEmployee.keys());
  for (const record of existing) {
    if (!record.employee_id || currentEmployeeIds.has(record.employee_id)) continue;
    if (record.status === "done") {
      result.keptDone++;
      continue;
    }
    const { error: deleteError } = await supabase.from("wht_records").delete().eq("id", record.id);
    if (deleteError) throw deleteError;
    result.deleted++;
  }

  return result;
}

export async function cleanupRunWht(runId: string): Promise<{ deleted: number; keptDone: number }> {
  const { data, error } = await supabase
    .from("wht_records")
    .select("id, status")
    .eq("payroll_run_id", runId)
    .eq("source", "payroll");

  if (isMissingColumnError(error)) {
    return { deleted: 0, keptDone: 0 };
  }
  if (error) throw error;

  const records = (data ?? []) as { id: string; status: "active" | "done" }[];
  let deleted = 0;
  let keptDone = 0;

  for (const record of records) {
    if (record.status === "done") {
      keptDone++;
      continue;
    }
    const { error: deleteError } = await supabase.from("wht_records").delete().eq("id", record.id);
    if (deleteError) throw deleteError;
    deleted++;
  }

  return { deleted, keptDone };
}
