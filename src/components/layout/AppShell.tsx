import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, FileText, BarChart3, Package, Settings, Users, Download, ChevronRight, ArrowLeft, Percent } from "lucide-react";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { BOTTOM_NAV_ITEMS } from "../../constants";
import { useClientProfile, useWorkspaceRole } from "../../hooks/useAuth";
import { DevBadge } from "../ui/DevBadge";
import { getWorkspacePermissions } from "../../lib/permissions";
import { getProxiedImageUrl } from "../../lib/r2";
import type { ClientMemberRole, ClientProfile } from "../../types";

const iconMap: Record<string, React.ReactNode> = {
  "/home": <Home className="w-5 h-5" />,
  "/documents": <FileText className="w-5 h-5" />,
  "/download-center": <Download className="w-5 h-5" />,
  "/reports": <BarChart3 className="w-5 h-5" />,
  "/wht": <Percent className="w-5 h-5" />,
  "/catalog": <Package className="w-5 h-5" />,
  "/customers": <Users className="w-5 h-5" />,
  "/settings": <Settings className="w-5 h-5" />,
};

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface AppShellProps {
  title: string;
  showBack?: boolean;
  action?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  children: React.ReactNode;
}

const WORKSPACE_ROLE_LABELS: Record<ClientMemberRole, string> = {
  owner: "Owner",
  manager: "Manager",
  officer: "Officer",
};

function WorkspaceMark({ profile }: { profile: ClientProfile | null }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = profile?.logo_url && !logoFailed ? getProxiedImageUrl(profile.logo_url) : null;

  if (logoUrl) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E8E6DF] bg-white overflow-hidden">
        <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" onError={() => setLogoFailed(true)} />
      </div>
    );
  }

  return null;
}

export function AppShell({ title, showBack, action, breadcrumbs, children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const { clientProfile } = useClientProfile(profile?.id);
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const navItems = BOTTOM_NAV_ITEMS.filter((item) => {
    if (item.path === "/reports") return permissions.canViewReports;
    if (item.path === "/wht") return permissions.canViewReports;
    if (item.path === "/settings") return permissions.canManageSettings;
    if (item.path === "/catalog") return permissions.canManageCatalog;
    if (item.path === "/customers") return permissions.canManageCustomers;
    return true;
  });
  const companyName = clientProfile?.company_name_th?.trim() || "Invoice System";

  const impersonatedUserId = sessionStorage.getItem("impersonate_user_id");
  const impersonatedName = sessionStorage.getItem("impersonate_name");
  const impersonateReturn = sessionStorage.getItem("impersonate_return") || "/admin/clients";
  const isImpersonating = !!impersonatedUserId && !!impersonatedName;

  function handleStopImpersonate() {
    sessionStorage.removeItem("impersonate_user_id");
    sessionStorage.removeItem("impersonate_name");
    sessionStorage.removeItem("impersonate_return");
    navigate(impersonateReturn, { replace: true });
  }

  function isActive(path: string) {
    return location.pathname.startsWith(path);
  }

  const roleLabel = workspaceRole ? WORKSPACE_ROLE_LABELS[workspaceRole] : "Workspace";
  const vatLabel = clientProfile?.vat_registered ? `VAT ${clientProfile.vat_rate || 7}%` : "Non-VAT";
  const workspaceMeta = `${roleLabel} · ${vatLabel}`;

  return (
    <div className="md:flex min-h-screen bg-page-bg">
      <aside className="hidden md:flex md:flex-col md:w-64 md:h-screen md:sticky md:top-0 bg-white border-r border-card-border shrink-0">
        <div className="border-b border-card-border p-3">
          <button
            type="button"
            onClick={() => navigate("/home")}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#F7F6F3] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          >
            <WorkspaceMark profile={clientProfile} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center">
                <h1 className="truncate text-sm font-semibold text-[#1A1A18]" title={companyName}>
                  {companyName}
                </h1>
                <DevBadge />
              </div>
              <p className="mt-0.5 truncate text-[11px] font-medium text-[#7B766E]">{workspaceMeta}</p>
            </div>
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive(item.path)
                  ? "bg-[#EEF6FF] font-medium text-primary"
                  : "text-[#5F5B54] hover:bg-[#F7F6F3] hover:text-[#1A1A18]"
              }`}
            >
              {iconMap[item.path] || <Home className="w-5 h-5" />}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {isImpersonating && (
          <div className="bg-[#FAEEDA] border-b border-[#E8D5B2] text-[#633806] px-4 py-2 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={handleStopImpersonate}
                className="flex items-center gap-1 text-[#633806] font-medium text-sm hover:underline shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                หยุดดูในฐานะลูกค้า
              </button>
            </div>
            <span className="text-sm text-[#633806]/80 truncate ml-2">
              กำลังดูในฐานะ: <strong>{impersonatedName}</strong>
            </span>
          </div>
        )}
        <TopBar title={title} showBack={showBack} action={action} />
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="mx-auto w-full max-w-7xl px-4 pt-2 sm:px-5 lg:px-8">
            <nav className="flex items-center gap-1 text-xs text-gray-500">
              {breadcrumbs.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="w-3 h-3 text-gray-400" />}
                  {item.path ? (
                    <a href={item.path} className="hover:text-primary transition-colors">{item.label}</a>
                  ) : (
                    <span className="text-gray-700 font-medium">{item.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl px-4 py-4 pb-24 sm:px-5 md:pb-6 lg:px-8">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
