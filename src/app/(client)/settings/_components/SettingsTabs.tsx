import { Link } from "react-router-dom";
import { SETTINGS_TABS } from "../../../../constants";
import { useWorkspaceRole } from "../../../../hooks/useAuth";

export function SettingsTabs({ activePath }: { activePath: string }) {
  // ทีมงาน (team management) is owner-only — don't even link it otherwise.
  const { workspaceRole } = useWorkspaceRole();
  const visibleTabs = SETTINGS_TABS.filter(
    (tab) => tab.path !== "/settings/team" || workspaceRole === "owner",
  );
  return (
    <div className="flex gap-1 border-b border-card-border pb-0">
      {visibleTabs.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`px-3 py-2 text-body rounded-t-control ${ tab.path === activePath ? "bg-white border border-card-border border-b-white text-primary font-medium" : "text-ink-400 hover:text-ink-600" }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
