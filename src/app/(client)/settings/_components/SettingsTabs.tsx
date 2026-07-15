import { Link } from "react-router-dom";
import { SETTINGS_TABS } from "../../../../constants";

export function SettingsTabs({ activePath }: { activePath: string }) {
  return (
    <div className="flex gap-1 border-b border-card-border pb-0">
      {SETTINGS_TABS.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`px-3 py-2 text-sm rounded-t-lg ${
            tab.path === activePath
              ? "bg-white border border-card-border border-b-white text-primary font-medium"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
