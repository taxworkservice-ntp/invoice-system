import { useState } from "react";
import { cartonsToBase, baseToCartons, formatMixedStock } from "../../lib/stock";
import { NumericInput } from "../ui/NumericInput";

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

  const displayValue = hasCarton && useCarton
    ? baseToCartons(numValue, qtyPerCarton!)
    : numValue;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <label className="text-body text-ink-900">
          จำนวนสต็อกเริ่มต้น
        </label>
        {hasCarton && (
          <button
            type="button"
            onClick={() => {
              setUseCarton((prev) => !prev);
              onChange(0);
            }}
            className="text-label px-2 py-0.5 rounded border border-card-border text-ink-300 hover:border-primary hover:text-primary transition-colors"
          >
            {useCarton ? baseUnit : cartonUnit}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <NumericInput
            value={displayValue === 0 ? null : displayValue}
            maxFractionDigits={hasCarton && useCarton ? 0 : 3}
            onValueChange={(next) => {
              // Selling by carton shows cartons; stock is always stored in base units.
              onChange(
                hasCarton && useCarton ? cartonsToBase(next, qtyPerCarton!) : next,
              );
            }}
          />
        </div>
        <span className="text-body text-ink-300 shrink-0">{displayUnit}</span>
      </div>
      {hasCarton && numValue > 0 && (
        <div className="text-label text-ink-300">
          {useCarton
            ? `= ${numValue} ${baseUnit}`
            : `= ${formatMixedStock(numValue, baseUnit, cartonUnit, qtyPerCarton)}`}
        </div>
      )}
    </div>
  );
}
