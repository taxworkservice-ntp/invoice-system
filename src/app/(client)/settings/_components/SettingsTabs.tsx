import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { SETTINGS_TABS } from "../../../../constants";
import { useWorkspaceRole } from "../../../../hooks/useAuth";

export function SettingsTabs({ activePath }: { activePath: string }) {
  // ทีมงาน (team management) is owner-only — don't even link it otherwise.
  const { workspaceRole } = useWorkspaceRole();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const visibleTabs = SETTINGS_TABS.filter(
    (tab) => tab.path !== "/settings/team" || workspaceRole === "owner",
  );

  // On mobile the row is a horizontal scroller; bring the active tab into view
  // so later tabs (account, payroll, team) aren't off-screen on arrival.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activePath]);

  return (
    // Mobile: a bleed scroll row (swipeable, hidden scrollbar) so the eight
    // tabs never force page-wide horizontal scroll. Desktop: inert flex row.
    <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-card-border px-4 pb-0 sm:mx-0 sm:px-0">
      {visibleTabs.map((tab) => {
        const isActive = tab.path === activePath;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            ref={isActive ? activeRef : undefined}
            aria-current={isActive ? "page" : undefined}
            className={`min-h-11 shrink-0 whitespace-nowrap px-3 py-2 text-body rounded-t-control md:min-h-0 ${ isActive ? "bg-white border border-card-border border-b-white text-primary font-medium" : "text-ink-400 hover:text-ink-600" }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
