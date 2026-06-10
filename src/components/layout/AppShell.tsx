import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, FileText, BarChart3, Package, Settings, ChevronRight, ArrowLeft } from "lucide-react";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { BOTTOM_NAV_ITEMS } from "../../constants";

const iconMap: Record<string, React.ReactNode> = {
  "/home": <Home className="w-5 h-5" />,
  "/documents": <FileText className="w-5 h-5" />,
  "/reports": <BarChart3 className="w-5 h-5" />,
  "/catalog": <Package className="w-5 h-5" />,
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

export function AppShell({ title, showBack, action, breadcrumbs, children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();

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

  return (
    <div className="md:flex min-h-screen bg-page-bg">
      <aside className="hidden md:flex md:flex-col md:w-56 md:h-screen md:sticky md:top-0 bg-white border-r border-card-border shrink-0">
        <div className="px-4 py-4 border-b border-card-border">
          <h1 className="text-base font-semibold text-gray-800">Invoice System</h1>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive(item.path)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-50"
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
          <div className="max-w-4xl mx-auto px-4 pt-2">
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
        <main className="max-w-4xl mx-auto px-4 py-4 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}