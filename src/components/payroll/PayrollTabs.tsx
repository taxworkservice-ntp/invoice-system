import { useLocation, useNavigate } from "react-router-dom";
import { Users, Wallet } from "lucide-react";

const TABS = [
  { value: "/payroll", label: "รอบเงินเดือน", icon: Wallet },
  { value: "/payroll/employees", label: "พนักงาน", icon: Users },
] as const;

/**
 * Route-backed section switcher between the payroll run workspace and the
 * employee master. Rendered as a full-width header bar at the top of both
 * pages so the current section is unmistakable: the active section fills
 * with the primary Button colour, the other stays quiet. Both pages stay
 * standalone routes (own data loading, deep-linkable URLs) — this only
 * renders the switcher UX with the active state derived from the location.
 *
 * Visibility is admin-controlled per client (`payroll_runs` /
 * `payroll_employees` feature keys, fail-open to both). When only one tab
 * is visible the switcher hides itself — there is nothing to switch to.
 */
export function PayrollTabs({
  showRuns = true,
  showEmployees = true,
  runsCount,
  employeesCount,
}: {
  showRuns?: boolean;
  showEmployees?: boolean;
  /** Optional badges: planned + existing runs this month, eligible employees. */
  runsCount?: number;
  employeesCount?: number;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const visibleTabs = TABS.filter((tab) => (tab.value === "/payroll" ? showRuns : showEmployees));
  if (visibleTabs.length < 2) return null;

  const active = location.pathname.startsWith("/payroll/employees")
    ? "/payroll/employees"
    : "/payroll";

  function countFor(value: (typeof TABS)[number]["value"]): number | undefined {
    return value === "/payroll" ? runsCount : employeesCount;
  }

  return (
    <nav
      className="inline-flex w-full items-center gap-0.5 rounded-control border border-card-border bg-paper-field p-1 sm:w-auto"
      aria-label="ส่วนเงินเดือน"
    >
      {visibleTabs.map((tab) => {
        const isActive = active === tab.value;
        const count = countFor(tab.value);
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (!isActive) navigate(tab.value);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-control px-4 py-1.5 text-body transition-colors sm:flex-none ${isActive ? "bg-primary font-semibold text-white" : "font-medium text-ink-500 hover:text-ink-900"}`}
          >
            <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-ink-400"}`} />
            {tab.label}
            {count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-px text-label font-semibold tabular-nums ${isActive ? "bg-white text-primary-deep" : "border border-card-border bg-white text-ink-400"}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
