import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, FileText, BarChart3, Package, Users, Settings, Download } from "lucide-react";
import { BOTTOM_NAV_ITEMS } from "../../constants";
import { useWorkspaceRole } from "../../hooks/useAuth";
import { getWorkspacePermissions } from "../../lib/permissions";

const iconMap: Record<string, React.ReactNode> = {
  "/home": <Home className="w-5 h-5" />,
  "/documents": <FileText className="w-5 h-5" />,
  "/download-center": <Download className="w-5 h-5" />,
  "/reports": <BarChart3 className="w-5 h-5" />,
  "/catalog": <Package className="w-5 h-5" />,
  "/customers": <Users className="w-5 h-5" />,
  "/settings": <Settings className="w-5 h-5" />,
};

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const navItems = BOTTOM_NAV_ITEMS.filter((item) => {
    if (item.path === "/reports") return permissions.canViewReports;
    if (item.path === "/settings") return permissions.canManageSettings;
    if (item.path === "/catalog") return permissions.canManageCatalog;
    if (item.path === "/customers") return permissions.canManageCustomers;
    return true;
  });

  function isActive(path: string) {
    return location.pathname.startsWith(path);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-card-border z-40 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex justify-around py-2">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            aria-label={item.label}
            className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg text-xs transition-colors ${
              isActive(item.path) ? "text-primary font-medium" : "text-gray-400"
            }`}
          >
            {iconMap[item.path] || <Home className="w-5 h-5" />}
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
