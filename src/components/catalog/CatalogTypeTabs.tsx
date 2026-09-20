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
    <div className="flex gap-4 border-b border-card-border">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`inline-flex min-h-11 items-center pb-2 text-body font-medium transition-colors border-b-2 -mb-[1px] md:min-h-0 ${ activeTab === tab.key ? "text-primary border-primary" : "text-ink-300 border-transparent hover:text-ink-700" }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
