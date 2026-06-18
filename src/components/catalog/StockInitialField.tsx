import { useState } from "react";
import { cartonsToBase, baseToCartons, formatMixedStock } from "../../lib/stock";

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

  const [useCarton, setUseCarton] = useState(hasCarton);

  const displayUnit = hasCarton && useCarton ? cartonUnit! : baseUnit;
  const step = hasCarton && useCarton ? "1" : "0.01";

  const displayValue = hasCarton && useCarton
    ? baseToCartons(numValue, qtyPerCarton!)
    : numValue;

  function handleChange(raw: string) {
    if (hasCarton && useCarton) {
      const cartons = parseFloat(raw) || 0;
      const base = cartonsToBase(cartons, qtyPerCarton!);
      onChange(base);
    } else {
      onChange(raw);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <label className="text-[13px] text-[#1A1A18]">
          จำนวนสต็อกเริ่มต้น
        </label>
        {hasCarton && (
          <button
            type="button"
            onClick={() => {
              setUseCarton((prev) => !prev);
              onChange(0);
            }}
            className="text-[11px] px-2 py-0.5 rounded border border-[#E8E6DF] text-[#888780] hover:border-[#378ADD] hover:text-[#378ADD] transition-colors"
          >
            {useCarton ? baseUnit : cartonUnit}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step={step}
          value={displayValue === 0 ? "" : displayValue}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 transition-colors"
        />
        <span className="text-sm text-[#888780] shrink-0">{displayUnit}</span>
      </div>
      {hasCarton && numValue > 0 && (
        <div className="text-[11px] text-[#888780]">
          {useCarton
            ? `= ${numValue} ${baseUnit}`
            : `= ${formatMixedStock(numValue, baseUnit, cartonUnit, qtyPerCarton)}`}
        </div>
      )}
    </div>
  );
}
