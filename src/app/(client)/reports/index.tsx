import { useState } from "react";
import { BarChart3, Package } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { FinancialReport } from "../../../components/reports/FinancialReport";
import { StockReport } from "../../../components/reports/StockReport";
import { useAuth } from "../../../hooks/useAuth";

const TABS = [
  { key: "financial", label: "รายงานการเงิน", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "stock", label: "รายงานสต็อก", icon: <Package className="h-4 w-4" /> },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("financial");
  const { profile } = useAuth();
  const userId = profile?.id;

  return (
    <AppShell title="รายงาน">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl border border-[#E8E6DF] bg-[#FAFAF8] p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-[#1A1A18] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "financial" && <FinancialReport userId={userId} />}
        {activeTab === "stock" && <StockReport userId={userId} />}
      </div>
    </AppShell>
  );
}
