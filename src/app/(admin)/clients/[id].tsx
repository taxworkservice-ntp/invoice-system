import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { useAdminClientDetail } from "../../../hooks/useAdminClientDetail";
import { Spinner } from "../../../components/ui/Spinner";
import { ADMIN_CLIENT_TABS, type AdminClientTabId } from "../../../components/admin/client/shared";
import { ActivityTab } from "../../../components/admin/client/ActivityTab";
import { DocumentsTab } from "../../../components/admin/client/DocumentsTab";
import { FeaturesTab } from "../../../components/admin/client/FeaturesTab";
import { ManageTab } from "../../../components/admin/client/ManageTab";
import { OverviewTab } from "../../../components/admin/client/OverviewTab";
import { ReportsTab } from "../../../components/admin/client/ReportsTab";
import { TeamTab } from "../../../components/admin/client/TeamTab";

function isTabId(value: string | null): value is AdminClientTabId {
  return ADMIN_CLIENT_TABS.some((tab) => tab.id === value);
}

export default function AdminClientDetailPage() {
  const detail = useAdminClientDetail();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showMenu, setShowMenu] = useState(false);

  const activeTab: AdminClientTabId = isTabId(searchParams.get("tab"))
    ? (searchParams.get("tab") as AdminClientTabId)
    : "overview";

  function goTab(tab: AdminClientTabId) {
    setSearchParams(tab === "overview" ? {} : { tab }, { replace: true });
    window.scrollTo({ top: 0 });
  }

  const {
    clientProfile,
    email,
    isActive,
    accountError,
    documents,
    features,
    members,
    customRoles,
    dealCount,
    activeCustomerCount,
    activeItemCount,
    activeDealCount,
    loading,
    auditEntries,
    resetBackups,
    activities,
    activityDeals,
    toggling,
    fetchData,
    handleToggleActive,
    setClientProfile,
    setMembers,
    setFeatures,
    setResetBackups,
    id,
  } = detail;

  if (loading) {
    return (
      <div className="min-h-screen bg-page-bg">
        <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
          <div className="flex items-center px-4 h-14 max-w-4xl mx-auto">
            <button
              onClick={() => navigate("/admin/clients")}
              className="text-ink-500 hover:text-ink-700 p-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-body font-semibold text-ink-800 ml-2">ข้อมูลลูกค้า</h1>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!clientProfile) {
    return (
      <div className="min-h-screen bg-page-bg">
        <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
          <div className="flex items-center px-4 h-14 max-w-4xl mx-auto">
            <button
              onClick={() => navigate("/admin/clients")}
              className="text-ink-500 hover:text-ink-700 p-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-body font-semibold text-ink-800 ml-2">ไม่พบข้อมูล</h1>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <p className="text-body text-ink-500">ไม่พบข้อมูลลูกค้า</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page-bg">
      <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 h-14 max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/admin/clients")}
              className="text-ink-500 hover:text-ink-700 p-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-body font-semibold text-ink-900 truncate">
              {clientProfile.company_name_th || email || "ลูกค้า"}
            </h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu((value) => !value)}
              className="text-ink-500 hover:text-ink-700 p-1 rounded-control hover:bg-ink-50"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-card-border rounded-control py-1 min-w-[180px] z-50">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    void handleToggleActive();
                  }}
                  disabled={toggling}
                  className="w-full text-left px-3 py-2 text-body hover:bg-paper-field disabled:opacity-50"
                >
                  {isActive ? "ปิดการใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
                </button>
              </div>
            )}
          </div>
        </div>
        <nav
          aria-label="ส่วนจัดการลูกค้า"
          className="max-w-4xl mx-auto px-4 pb-2 flex gap-1.5 overflow-x-auto"
        >
          {ADMIN_CLIENT_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => goTab(tab.id)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-label font-medium transition-colors ${selected ? "border-primary bg-primary-soft text-primary-deep font-semibold" : "border-card-border bg-white text-ink-500 hover:text-ink-700 hover:border-line-strong"}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {activeTab === "overview" && (
          <OverviewTab
            clientProfile={clientProfile}
            email={email}
            isActive={isActive}
            accountError={accountError}
            documents={documents}
            dealCount={dealCount}
            members={members}
            features={features}
            toggling={toggling}
            onToggleActive={() => void handleToggleActive()}
            onRetry={() => void fetchData()}
            onGoTab={goTab}
          />
        )}
        {activeTab === "features" && (
          <FeaturesTab clientId={id} features={features} setFeatures={setFeatures} />
        )}
        {activeTab === "team" && (
          <TeamTab
            clientId={id}
            members={members}
            setMembers={setMembers}
            customRoles={customRoles}
            auditEntries={auditEntries}
          />
        )}
        {activeTab === "documents" && <DocumentsTab documents={documents} />}
        {activeTab === "reports" && <ReportsTab />}
        {activeTab === "activity" && (
          <ActivityTab activities={activities} activityDeals={activityDeals} />
        )}
        {activeTab === "manage" && (
          <ManageTab
            clientId={id}
            email={email}
            clientProfile={clientProfile}
            setClientProfile={setClientProfile}
            documents={documents}
            dealCount={dealCount}
            activeCustomerCount={activeCustomerCount}
            activeItemCount={activeItemCount}
            activeDealCount={activeDealCount}
            resetBackups={resetBackups}
            setResetBackups={setResetBackups}
            fetchData={fetchData}
          />
        )}
      </div>
    </div>
  );
}
