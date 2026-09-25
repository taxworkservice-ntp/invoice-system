import { calculateBreakdown, getEffectiveHourlyRate, resolveDivisorDays } from "./calculations";
import { isSsoExemptByAge } from "./ssoEligibility";
import { resolveEffectiveLineItem } from "./rows";
import { buildPayslipSlipNode, type PayslipCompany } from "./payslipPdf";
import { slipNodeToPdfBlob, sanitizePdfFilename } from "./payslipPdfRender";
import type { PayrollExportBundle } from "./exportRun";

export interface PayslipBatchResult {
  blob: Blob | null;
  succeeded: number;
  failed: number;
  failures: { label: string; error?: string }[];
}

/**
 * Build a ZIP of one PDF per employee for a payroll run, mirroring the Payroll
 * page's bulk-payslip output (same calc path, so amounts match).
 */
export async function buildPayslipsZip(
  bundle: PayrollExportBundle,
  company: PayslipCompany | null,
): Promise<PayslipBatchResult> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const { run, employees, settings, lineItems, recurringByEmployee, month, year } = bundle;

  let succeeded = 0;
  const failures: { label: string; error?: string }[] = [];

  for (const employee of employees) {
    try {
      const item = resolveEffectiveLineItem(employee.id, lineItems, recurringByEmployee, run.id);
      const calc = calculateBreakdown(
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
          sso_exempt: isSsoExemptByAge(employee),
        },
        settings,
        month,
        year,
      );
      const hourlyRate = getEffectiveHourlyRate(
        employee.salary_type,
        employee.base_salary,
        resolveDivisorDays(settings, month, year),
      );
      const totalDeductions = item.deductions.reduce(
        (sum, entry) => sum + (Number(entry.amount) || 0),
        0,
      );
      const node = buildPayslipSlipNode(
        employee,
        run,
        item,
        { ...calc, totalDeductions },
        hourlyRate,
        company,
      );
      const blob = await slipNodeToPdfBlob(node);
      zip.file(
        `${sanitizePdfFilename(`${employee.employee_code}-${employee.full_name}`)}.pdf`,
        blob,
      );
      succeeded += 1;
    } catch (error) {
      failures.push({
        label: `${employee.employee_code} ${employee.full_name}`,
        error: error instanceof Error ? error.message : "สร้างสลิปไม่สำเร็จ",
      });
    }
  }

  const blob = succeeded > 0 ? await zip.generateAsync({ type: "blob" }) : null;
  return { blob, succeeded, failed: failures.length, failures };
}
