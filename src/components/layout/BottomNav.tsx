import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, FileText, BarChart3, Package, Users, Settings, Download, Percent, MoreHorizontal, LogOut } from "lucide-react";
import { BOTTOM_NAV_ITEMS } from "../../constants";
import { useWorkspaceRole } from "../../hooks/useAuth";
import { getWorkspacePermissions } from "../../lib/permissions";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { supabase } from "../../lib/supabase";

const LOGOUT_PATH = "__logout__";

const iconMap: Record<string, React.ReactNode> = {
  "/home": <Home className="w-5 h-5" />,
  "/documents": <FileText className="w-5 h-5" />,
  "/download-center": <Download className="w-5 h-5" />,
  "/reports": <BarChart3 className="w-5 h-5" />,
  "/wht": <Percent className="w-5 h-5" />,
  "/catalog": <Package className="w-5 h-5" />,
  "/customers": <Users className="w-5 h-5" />,
  "/settings": <Settings className="w-5 h-5" />,
  [LOGOUT_PATH]: <LogOut className="w-5 h-5" />,
};

const MAX_VISIBLE = 5;

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);

  const navItems = BOTTOM_NAV_ITEMS.filter((item) => {
    if (item.path === "/reports") return permissions.canViewReports;
    if (item.path === "/wht") return permissions.canManageWht;
    if (item.path === "/download-center") return permissions.canExportReports;
    if (item.path === "/settings") return permissions.canManageSettings;
    if (item.path === "/catalog") return permissions.canViewCatalog;
    if (item.path === "/customers") return permissions.canViewCustomers;
    return true;
  });

  const allItems = [...navItems, { label: "ออกจากระบบ", path: LOGOUT_PATH }];

  function isActive(path: string) {
    return location.pathname.startsWith(path);
  }

  const needsOverflow = allItems.length > MAX_VISIBLE;
  const visibleItems = needsOverflow ? allItems.slice(0, MAX_VISIBLE - 1) : allItems;
  const overflowItems = needsOverflow ? allItems.slice(MAX_VISIBLE - 1) : [];
  const overflowActive = overflowItems.some((item) => isActive(item.path));

  function handleClick(item: (typeof allItems)[number]) {
    if (item.path === LOGOUT_PATH) {
      setLogoutOpen(true);
    } else {
      navigate(item.path);
    }
  }

  function handleOverflowClick(item: (typeof allItems)[number]) {
    setOverflowOpen(false);
    if (item.path === LOGOUT_PATH) {
      setLogoutOpen(true);
    } else {
      navigate(item.path);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-card-border shadow-[0_-1px_3px_rgba(0,0,0,0.04)] z-40 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex py-1.5">
          {visibleItems.map((item) => {
            const active = isActive(item.path);
            const isLogout = item.path === LOGOUT_PATH;
            return (
              <button
                key={item.path}
                onClick={() => handleClick(item)}
                aria-label={item.label}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-xl text-xs transition-all duration-150 active:scale-95 ${
                  isLogout
                    ? "text-red-500 hover:text-red-600"
                    : active
                      ? "text-primary font-semibold"
                      : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {iconMap[item.path] || <Home className="w-5 h-5" />}
                <span className="text-[11px] whitespace-nowrap leading-tight">{item.label}</span>
              </button>
            );
          })}
          {needsOverflow && (
            <button
              onClick={() => setOverflowOpen(true)}
              aria-label="เพิ่มเติม"
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-xl text-xs transition-all duration-150 active:scale-95 ${
                overflowActive ? "text-primary font-semibold" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[11px] whitespace-nowrap leading-tight">เพิ่มเติม</span>
            </button>
          )}
        </div>
      </nav>

      {needsOverflow && (
        <Modal open={overflowOpen} onClose={() => setOverflowOpen(false)} title="เพิ่มเติม">
          <div className="space-y-0.5">
            {overflowItems.map((item) => {
              const isLogout = item.path === LOGOUT_PATH;
              return (
                <button
                  key={item.path}
                  onClick={() => handleOverflowClick(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isLogout
                      ? "text-red-500 hover:bg-red-50"
                      : isActive(item.path)
                        ? "bg-[#EEF6FF] text-primary font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {iconMap[item.path]}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

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
    </>
  );
}
