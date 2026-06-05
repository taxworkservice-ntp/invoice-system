type TabKey = "all" | "product" | "service";

interface Props {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "product", label: "สินค้า" },
  { key: "service", label: "บริการ" },
];

export function CatalogTypeTabs({ activeTab, onChange }: Props) {
  return (
    <div className="flex gap-4 border-b border-[#E8E6DF]">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`pb-2 text-[13px] font-medium transition-colors border-b-2 -mb-[1px] ${
            activeTab === tab.key
              ? "text-[#378ADD] border-[#378ADD]"
              : "text-[#888780] border-transparent hover:text-[#555]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
