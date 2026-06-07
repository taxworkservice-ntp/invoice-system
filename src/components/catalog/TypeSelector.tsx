interface Props {
  value: "product" | "service";
  onChange: (value: "product" | "service") => void;
  disabled?: boolean;
}

export function TypeSelector({ value, onChange, disabled }: Props) {
  return (
    <div
      className={`flex bg-[#F7F6F3] border-[0.5px] border-[#E8E6DF] rounded-[10px] p-1 ${
        disabled ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onChange("product")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-[8px] text-[14px] font-medium transition-all ${
          value === "product"
            ? "bg-white text-[#1A1A18] shadow-sm"
            : "text-[#888780]"
        }`}
      >
        <span className="text-base">สินค้า</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("service")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-[8px] text-[14px] font-medium transition-all ${
          value === "service"
            ? "bg-white text-[#1A1A18] shadow-sm"
            : "text-[#888780]"
        }`}
      >
        <span className="text-base">บริการ</span>
      </button>
    </div>
  );
}
