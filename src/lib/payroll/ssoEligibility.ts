import type { Employee } from "../../types";

/**
 * Thai SSO age-60 rule (Social Security Act, Section 33).
 *
 * Only hires aged 15–60 may newly register as insured. Someone already 60+
 * on their start date is never filed and never deducted; someone hired
 * before 60 keeps filing normally past 60. The trigger is therefore age ON
 * start_date — not current age — so a rehire after 60 (fresh start_date)
 * correctly flips to excluded.
 *
 * Missing data defaults to covered (today's behavior): legacy rows without
 * a birthdate keep filing while the UI prompts to fill it in.
 */

type SsoPerson = Pick<Employee, "sso_registered" | "start_date" | "date_of_birth">;

function parseYmd(iso: string | null | undefined): {
  y: number;
  m: number;
  d: number;
} | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { y, m: month, d: day };
}

/** Full years between birthdate and a reference date, null when unparseable. */
export function fullYearsBetween(
  dobIso: string | null | undefined,
  onIso: string | null | undefined,
): number | null {
  const dob = parseYmd(dobIso);
  const on = parseYmd(onIso);
  if (!dob || !on) return null;
  let age = on.y - dob.y;
  if (on.m < dob.m || (on.m === dob.m && on.d < dob.d)) age -= 1;
  return age;
}

/** Current age in full years (Bangkok today), null when birthdate missing. */
export function currentAgeYears(
  dobIso: string | null | undefined,
  todayIso?: string,
): number | null {
  const today = todayIso || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  return fullYearsBetween(dobIso, today);
}

/** True when the person was already 60+ on their start date. */
export function wasSixtyAtHire(emp: Pick<Employee, "start_date" | "date_of_birth">): boolean {
  const age = fullYearsBetween(emp.date_of_birth, emp.start_date);
  if (age === null) return false;
  return age >= 60;
}

/** Whether SSO should be deducted and filed for this employee. */
export function isSsoCovered(emp: SsoPerson): boolean {
  if (emp.sso_registered === false) return false;
  return !wasSixtyAtHire(emp);
}

/**
 * Registered staff exempted by the age-60 rule only. Unlike contract staff
 * (ภ.ง.ด.3 flat 3%), they keep progressive salary withholding with zero SSO
 * deduction — see calculateNet's sso_exempt branch.
 */
export function isSsoExemptByAge(
  emp: Pick<Employee, "sso_registered" | "start_date" | "date_of_birth">,
): boolean {
  if (emp.sso_registered === false) return false;
  return wasSixtyAtHire(emp);
}
