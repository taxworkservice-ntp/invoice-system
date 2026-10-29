interface VatChoiceCardsProps {
  value: boolean | null;
  onChange: (val: boolean) => void;
}

export function VatChoiceCards({ value, onChange }: VatChoiceCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {([
        { key: true, icon: "🧾", title: "จด VAT แล้ว", desc: "ออกใบกำกับ\nภาษีได้" },
        { key: false, icon: "📋", title: "ยังไม่ได้จด", desc: "ออกใบแจ้ง\nหนี้" },
      ] as const).map((opt) => (
        <div
          key={String(opt.key)}
          onClick={() => onChange(opt.key)}
          className={`cursor-pointer rounded-[10px] p-4 text-center border transition-colors ${ value === opt.key ? "border-primary bg-primary-soft" : "border-card-border bg-white" }`}
        >
          <div className="text-page mb-1">{opt.icon}</div>
          <div className="text-body font-medium text-ink-900 whitespace-pre-line">
            {opt.title}
          </div>
          <div className="text-label text-ink-300 whitespace-pre-line mt-1">
            {opt.desc}
          </div>
        </div>
      ))}
    </div>
  );
}
