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
          className={`cursor-pointer rounded-[10px] p-4 text-center border transition-colors ${
            value === opt.key
              ? "border-[#378ADD] bg-[#F0F7FF]"
              : "border-[#E8E6DF] bg-white"
          }`}
        >
          <div className="text-2xl mb-1">{opt.icon}</div>
          <div className="text-[13px] font-medium text-[#1A1A18] whitespace-pre-line">
            {opt.title}
          </div>
          <div className="text-[11px] text-[#888780] whitespace-pre-line mt-1">
            {opt.desc}
          </div>
        </div>
      ))}
    </div>
  );
}
