import type { ClientFeature, ClientFeatureKey } from "../../types";

// Per-client payroll tab visibility, admin-controlled via `client_features`.
//
// Two sub-keys refine the master "payroll" flag:
//   - "payroll_runs"     → รอบเงินเดือน (/payroll)
//   - "payroll_employees" → พนักงาน (/payroll/employees)
//
// Read rule (fail-open): when NEITHER key has a row for the client, both tabs
// are visible — so existing clients are unaffected until an admin explicitly
// configures them. Once at least one key exists, each tab is visible only
// when its row exists with enabled = true. If resolution ever yields neither
// tab (only possible via manual DB edits — the admin UI always enables at
// least one), fall back to both so the client is never locked out.
//
// NOTE: the client read path (`useWorkspaceFeatures`) only loads
// enabled = true rows, which is all this resolver needs: a visible tab is
// either unconfigured (no row) or explicitly enabled.
//
// PATTERN FOR OTHER AREAS: to make another section admin-toggleable per
// client, add a feature key (extend `ClientFeatureKey` + the
// `client_features_feature_key_check` constraint), gate with
// `hasFeature(key)` / a small resolver like this one, default absent rows to
// the current behaviour, and add an admin control on the client detail page.

export const PAYROLL_RUNS_FEATURE_KEY: ClientFeatureKey = "payroll_runs";
export const PAYROLL_EMPLOYEES_FEATURE_KEY: ClientFeatureKey = "payroll_employees";

export type PayrollTabVisibility = "both" | "runs" | "employees";

export interface PayrollTabsResolved {
  mode: PayrollTabVisibility;
  showRuns: boolean;
  showEmployees: boolean;
}

type FeatureRef = Pick<ClientFeature, "feature_key" | "enabled">;

export function resolvePayrollTabsVisibility(features: FeatureRef[]): PayrollTabsResolved {
  const runsRow = features.find((f) => f.feature_key === PAYROLL_RUNS_FEATURE_KEY);
  const employeesRow = features.find((f) => f.feature_key === PAYROLL_EMPLOYEES_FEATURE_KEY);
  const configured = Boolean(runsRow ?? employeesRow);

  let showRuns = !configured || runsRow?.enabled === true;
  let showEmployees = !configured || employeesRow?.enabled === true;
  if (!showRuns && !showEmployees) {
    // Fail-open: never hide both tabs.
    showRuns = true;
    showEmployees = true;
  }

  const mode: PayrollTabVisibility =
    showRuns && showEmployees ? "both" : showRuns ? "runs" : "employees";
  return { mode, showRuns, showEmployees };
}

/** Inverse mapping for the admin 3-state control → rows to upsert. */
export function payrollVisibilityToRows(
  mode: PayrollTabVisibility,
): { key: ClientFeatureKey; enabled: boolean }[] {
  return [
    { key: PAYROLL_RUNS_FEATURE_KEY, enabled: mode === "both" || mode === "runs" },
    { key: PAYROLL_EMPLOYEES_FEATURE_KEY, enabled: mode === "both" || mode === "employees" },
  ];
}
