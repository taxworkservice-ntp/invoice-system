import { useLocation, useNavigate } from "react-router-dom";

const TABS = [
  { value: "/payroll", label: "รอบเงินเดือน" },
  { value: "/payroll/employees", label: "พนักงาน" },
] as const;

/**
 * Route-backed segmented switcher between the payroll run workspace and
 * the employee master. Both pages stay standalone routes (own data
 * loading, deep-linkable URLs) — this only renders the tab UX with the
 * active state derived from the current location.
 *
 * Visibility is admin-controlled per client (`payroll_runs` /
 * `payroll_employees` feature keys, fail-open to both). When only one tab
 * is visible the switcher hides itself — there is nothing to switch to.
 */
export function PayrollTabs({
  showRuns = true,
  showEmployees = true,
}: {
  showRuns?: boolean;
  showEmployees?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const visibleTabs = TABS.filter((tab) => (tab.value === "/payroll" ? showRuns : showEmployees));
  if (visibleTabs.length < 2) return null;

  const active = location.pathname.startsWith("/payroll/employees")
    ? "/payroll/employees"
    : "/payroll";

  return (
    <nav
      className="inline-flex rounded-control border border-card-border bg-paper-field p-0.5"
      aria-label="ส่วนเงินเดือน"
    >
      {visibleTabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          aria-current={active === tab.value ? "page" : undefined}
          onClick={() => {
            if (active !== tab.value) navigate(tab.value);
          }}
          className={`px-3 py-1.5 text-label font-medium rounded-control transition-colors ${active === tab.value ? "bg-white text-ink-900 " : "text-ink-500 hover:text-ink-700"}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
