import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, FileText, BarChart3, Package, Settings, Users, Download, ChevronRight, ArrowLeft, Percent, LogOut, Menu, PanelLeftClose } from "lucide-react";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { BOTTOM_NAV_ITEMS } from "../../constants";
import { useClientProfile, useWorkspaceRole } from "../../hooks/useAuth";
import { DevBadge } from "../ui/DevBadge";
import { getWorkspacePermissions } from "../../lib/permissions";
import { getProxiedImageUrl } from "../../lib/r2";
import { supabase } from "../../lib/supabase";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
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
  wide?: boolean;
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

  useEffect(() => {
    setLogoFailed(false);
  }, [profile?.logo_url]);

  if (logoUrl) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E8E6DF] bg-white overflow-hidden">
        <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" onError={() => setLogoFailed(true)} />
      </div>
    );
  }

  return null;
}

export function AppShell({ title, showBack, action, breadcrumbs, wide = false, children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const { clientProfile } = useClientProfile(profile?.id);
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("invoice-system.sidebar-expanded") !== "false";
  });
  const navItems = BOTTOM_NAV_ITEMS.filter((item) => {
    if (item.path === "/reports") return permissions.canViewReports;
    if (item.path === "/wht") return permissions.canViewReports;
    if (item.path === "/download-center") return permissions.canViewReports;
    if (item.path === "/settings") return permissions.canManageSettings;
    if (item.path === "/catalog") return permissions.canManageCatalog;
    if (item.path === "/customers") return permissions.canManageCustomers;
    return true;
  });

  function toggleSidebar() {
    setSidebarExpanded((current) => {
      const next = !current;
      window.localStorage.setItem("invoice-system.sidebar-expanded", String(next));
      return next;
    });
  }
  const companyName = clientProfile?.company_name_th?.trim() || "Invoice System";
  const [logoutOpen, setLogoutOpen] = useState(false);

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

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  function isActive(path: string) {
    return location.pathname.startsWith(path);
  }

  const roleLabel = workspaceRole ? WORKSPACE_ROLE_LABELS[workspaceRole] : "Workspace";
  const vatLabel = clientProfile?.vat_registered ? `VAT ${clientProfile.vat_rate || 7}%` : "Non-VAT";
  const workspaceMeta = `${roleLabel} · ${vatLabel}`;

  return (
    <div className="md:flex min-h-screen bg-page-bg">
      <aside className={`hidden md:flex md:flex-col md:h-screen md:sticky md:top-0 bg-white border-r border-card-border shrink-0 transition-[width] duration-200 ${sidebarExpanded ? "md:w-64" : "md:w-16"}`}>
        <div className="border-b border-card-border p-3">
          <div className={`flex items-center gap-2 ${sidebarExpanded ? "" : "flex-col"}`}>
            <button
              type="button"
              onClick={() => navigate("/home")}
              aria-label={companyName}
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#F7F6F3] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${sidebarExpanded ? "" : "justify-center"}`}
            >
              <WorkspaceMark profile={clientProfile} />
              {sidebarExpanded ? (
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center">
                    <h1 className="truncate text-sm font-semibold text-[#1A1A18]" title={companyName}>
                      {companyName}
                    </h1>
                    <DevBadge />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-[#7B766E]">{workspaceMeta}</p>
                </div>
              ) : null}
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarExpanded ? "ย่อเมนู" : "ขยายเมนู"}
              title={sidebarExpanded ? "ย่อเมนู" : "ขยายเมนู"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[#F7F6F3] hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            >
              {sidebarExpanded ? <PanelLeftClose className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={sidebarExpanded ? undefined : item.label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive(item.path)
                  ? "bg-[#EEF6FF] font-medium text-primary"
                  : "text-[#5F5B54] hover:bg-[#F7F6F3] hover:text-[#1A1A18]"
              } ${sidebarExpanded ? "" : "justify-center px-0"}`}
            >
              {iconMap[item.path] || <Home className="w-5 h-5" />}
              {sidebarExpanded ? <span>{item.label}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-card-border p-3">
          <button
            onClick={() => setLogoutOpen(true)}
            aria-label="ออกจากระบบ"
            title={sidebarExpanded ? undefined : "ออกจากระบบ"}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50 ${sidebarExpanded ? "" : "justify-center px-0"}`}
          >
            <LogOut className="w-5 h-5" />
            {sidebarExpanded ? <span>ออกจากระบบ</span> : null}
          </button>
        </div>
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
        <TopBar title={title} showBack={showBack} action={action} wide={wide} />
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="mx-auto w-full max-w-7xl px-4 pt-2 sm:px-5 lg:px-8">
            <nav className="flex items-center gap-1 text-xs text-gray-500">
              {breadcrumbs.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="w-3 h-3 text-gray-400" />}
                  {item.path ? (
                    <Link to={item.path} className="hover:text-primary transition-colors">{item.label}</Link>
                  ) : (
                    <span className="text-gray-700 font-medium">{item.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>
        )}
        <main className={`mx-auto w-full px-4 py-4 pb-24 sm:px-5 md:pb-6 lg:px-8 ${wide ? "max-w-screen-2xl" : "max-w-7xl"}`}>
          {children}
        </main>
      </div>

      <BottomNav />

      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title="ออกจากระบบ">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            คุณแน่ใจว่าต้องการออกจากระบบใช่หรือไม่?
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setLogoutOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={handleLogout}>
              ออกจากระบบ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
