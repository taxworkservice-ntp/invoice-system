import { formatMixedStock } from "../../lib/stock";
import { isCartonUnitSelected, lineBaseQuantity } from "../../lib/documentLine";

/**
 * "Sell by piece or by carton" control for one line.
 *
 * Shared by the deal form's row and the line editor modal so a carton line
 * behaves identically everywhere: the printed document shows cartons, stock
 * moves in pieces. Renders nothing when the catalog item has no carton option.
 */
export function LineUnitControl({
  baseUnit,
  cartonUnit,
  qtyPerCarton,
  unit,
  quantity,
  unitLabel,
  onSelectUnit,
  stockCount = null,
  className = "",
}: {
  baseUnit: string;
  cartonUnit: string;
  qtyPerCarton: number;
  /** Unit currently selected on the line. */
  unit: string;
  /** Quantity in the selected unit. */
  quantity: number;
  /** Text shown after the selected unit (defaults to the unit itself). */
  unitLabel?: string;
  onSelectUnit: (unit: string) => void;
  /** Catalog stock in pieces — adds a "คงเหลือ" line when provided. */
  stockCount?: number | null;
  className?: string;
}) {
  if (!cartonUnit || !(qtyPerCarton > 0)) return null;

  const soldByCarton = isCartonUnitSelected({ quantity, unit, carton_unit: cartonUnit, qty_per_carton: qtyPerCarton });
  const baseQuantity = lineBaseQuantity({
    quantity,
    unit,
    carton_unit: cartonUnit,
    qty_per_carton: qtyPerCarton,
  });
  const selectedUnitLabel = unitLabel ?? unit;

  const pill = (value: string, label: string) => {
    const active = unit === value;
    return (
      <button
        type="button"
        onClick={() => onSelectUnit(value)}
        aria-pressed={active}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          active ? "bg-ink-900 text-white" : "bg-white text-ink-600 border border-line"
        }`}
      >
        ขายเป็น {label}
      </button>
    );
  };

  return (
    <div
      className={`rounded-control border border-line-faint bg-paper-field px-3 py-2 text-label text-ink-600 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {pill(baseUnit, baseUnit)}
        {pill(cartonUnit, cartonUnit)}
      </div>
      <div className="mt-2">
        1 {cartonUnit} = {qtyPerCarton} {baseUnit}
      </div>
      <div className="mt-1">
        ตัดสต็อกเป็น{" "}
        {baseQuantity.toLocaleString("th-TH", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        })}{" "}
        {baseUnit}
        {soldByCarton
          ? ` จาก ${quantity.toLocaleString("th-TH", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 3,
            })} ${selectedUnitLabel}`
          : ""}
      </div>
      {stockCount != null && (
        <div className="mt-1 text-ink-500">
          คงเหลือ {formatMixedStock(stockCount, baseUnit, cartonUnit, qtyPerCarton)}
        </div>
      )}
    </div>
  );
}
