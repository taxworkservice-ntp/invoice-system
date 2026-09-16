interface Props {
  value: "product" | "service";
  onChange: (value: "product" | "service") => void;
  disabled?: boolean;
}

export function TypeSelector({ value, onChange, disabled }: Props) {
  return (
    <div
      className={`flex bg-page-bg border-[0.5px] border-card-border rounded-[10px] p-1 ${ disabled ? "opacity-60 pointer-events-none" : "" }`}
    >
      <button
        type="button"
        onClick={() => onChange("product")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-[8px] text-body font-medium transition-all ${ value === "product" ? "bg-white text-ink-900 " : "text-ink-300" }`}
      >
        <span className="text-title">สินค้า</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("service")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-[8px] text-body font-medium transition-all ${ value === "service" ? "bg-white text-ink-900 " : "text-ink-300" }`}
      >
        <span className="text-title">บริการ</span>
      </button>
    </div>
  );
}
