import { lazy, Suspense, useState } from "react";
import { BarChart3, Package } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorBoundary } from "../../../components/ui/ErrorBoundary";
import { useAuth } from "../../../hooks/useAuth";

const FinancialReport = lazy(() => import("../../../components/reports/FinancialReport").then((module) => ({ default: module.FinancialReport })));
const StockReport = lazy(() => import("../../../components/reports/StockReport").then((module) => ({ default: module.StockReport })));

const TABS = [
  { key: "financial", label: "รายงานการเงิน", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "stock", label: "รายงานสต็อก", icon: <Package className="h-4 w-4" /> },
];

function ReportFallback() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
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
        <div className="flex gap-1 rounded-xl border border-[#E8E6DF] bg-[#FAFAF8] p-1" role="tablist" aria-label="ประเภทรายงาน">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-[#1A1A18] shadow-sm"
                  : "text-[#888780] hover:bg-white/60 hover:text-[#475467]"
              }`}
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
