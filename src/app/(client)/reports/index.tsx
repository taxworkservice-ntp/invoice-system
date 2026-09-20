import { lazy, Suspense, useState } from "react";
import { BarChart3, Package } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorBoundary } from "../../../components/ui/ErrorBoundary";
import { useAuth } from "../../../hooks/useAuth";

const FinancialReport = lazy(() =>
  import("../../../components/reports/FinancialReport").then((module) => ({
    default: module.FinancialReport,
  })),
);
const StockReport = lazy(() =>
  import("../../../components/reports/StockReport").then((module) => ({
    default: module.StockReport,
  })),
);

const TABS = [
  { key: "financial", label: "รายงานการเงิน", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "stock", label: "รายงานสต็อก", icon: <Package className="h-4 w-4" /> },
];

function ReportFallback() {
  return (
    <div className="space-y-4">
      {/* Mirrors the loaded report: 6 KPI cards on the same column steps and the
          same `max-w-row` cap, so the page does not jump when the lazy tab
          resolves. */}
      <div className="grid max-w-row grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-32 rounded-card" />
    </div>
  );
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("financial");
  const { profile } = useAuth();
  const userId = profile?.id;

  return (
    <AppShell title="รายงาน">
      <div className="space-y-4">
        <div
          className="flex gap-1 rounded-card border border-card-border bg-paper-field p-1"
          role="tablist"
          aria-label="ประเภทรายงาน"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control px-3 py-2 text-body font-medium transition-colors md:min-h-0 ${activeTab === tab.key ? "bg-white text-ink-900 " : "text-ink-300 hover:bg-white/60 hover:text-ink-500"}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <ErrorBoundary>
          <Suspense fallback={<ReportFallback />}>
            {activeTab === "financial" && <FinancialReport userId={userId} />}
            {activeTab === "stock" && <StockReport userId={userId} />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </AppShell>
  );
}
