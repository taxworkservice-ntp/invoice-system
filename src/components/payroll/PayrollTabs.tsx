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
 */
export function PayrollTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = location.pathname.startsWith("/payroll/employees")
    ? "/payroll/employees"
    : "/payroll";

  return (
    <div
      className="inline-flex rounded-control border border-card-border bg-paper-field p-0.5"
      role="tablist"
      aria-label="ส่วนเงินเดือน"
    >
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => {
            if (active !== tab.value) navigate(tab.value);
          }}
          className={`px-3 py-1.5 text-label font-medium rounded-control transition-colors ${active === tab.value ? "bg-white text-ink-900 " : "text-ink-500 hover:text-ink-700"}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
