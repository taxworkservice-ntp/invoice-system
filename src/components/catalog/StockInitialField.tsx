import { baseToCartons } from "../../lib/stock";

interface Props {
  value: number | string;
  onChange: (value: number | string) => void;
  baseUnit: string;
  cartonUnit?: string | null;
  qtyPerCarton?: number | null;
}

export function StockInitialField({
  value,
  onChange,
  baseUnit,
  cartonUnit,
  qtyPerCarton,
}: Props) {
  const hasCarton = !!(cartonUnit && qtyPerCarton && qtyPerCarton > 0);
  const numValue =
    typeof value === "string" ? parseFloat(value) || 0 : value;

  return (
    <div className="space-y-1">
      <label className="block text-[13px] text-[#1A1A18] mb-1">
        จำนวนสต็อกเริ่มต้น
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 transition-colors"
        />
        <span className="text-sm text-[#888780] shrink-0">{baseUnit}</span>
      </div>
      {hasCarton && numValue > 0 && (
        <div className="text-[11px] text-[#888780]">
          (= {baseToCartons(numValue, qtyPerCarton!)} {cartonUnit})
        </div>
      )}
    </div>
  );
}
