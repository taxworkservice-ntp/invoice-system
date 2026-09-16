import { UnitSelector } from "./UnitSelector";
import { CartonPreview } from "./CartonPreview";

interface Props {
  enabled: boolean;
  unit: string;
  qtyPerCarton: number | string;
  baseUnit: string;
  unitPrice: number;
  onEnabledChange: (enabled: boolean) => void;
  onUnitChange: (unit: string) => void;
  onQtyChange: (qty: number | string) => void;
  customPresets?: string[];
  onAddPreset?: (value: string) => void;
}

export function CartonUnitSection({
  enabled,
  unit,
  qtyPerCarton,
  baseUnit,
  unitPrice,
  onEnabledChange,
  onUnitChange,
  onQtyChange,
  customPresets,
  onAddPreset,
}: Props) {
  const qtyNum =
    typeof qtyPerCarton === "string"
      ? parseFloat(qtyPerCarton) || 0
      : qtyPerCarton;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-body text-ink-900">หน่วยรอง</span>
        <button
          type="button"
          onClick={() => onEnabledChange(!enabled)}
          className={`flex items-center gap-1.5 text-body transition-colors ${ enabled ? "text-primary" : "text-ink-300" }`}
        >
          <span
            className={`w-8 h-5 flex items-center rounded-full p-0.5 transition-colors ${ enabled ? "bg-primary" : "bg-ink-200" }`}
          >
            <span
              className={`w-4 h-4 bg-white rounded-full transition-transform ${ enabled ? "translate-x-3" : "translate-x-0" }`}
            />
          </span>
          {enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
        </button>
      </div>

      {enabled && (
        <div className="space-y-3 pl-2 border-l-2 border-card-border">
          <UnitSelector
            value={unit}
            onChange={onUnitChange}
            label="ชื่อหน่วยรอง"
            customPresets={customPresets}
            onAddPreset={onAddPreset}
          />
          <div>
            <label className="block text-label font-semibold text-ink-300 mb-1">
              จำนวนต่อหน่วย
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={qtyPerCarton}
              onChange={(e) => onQtyChange(e.target.value)}
              placeholder={`เช่น ${qtyNum || 10} ${baseUnit} ต่อ${unit || "ลัง"}`}
              className="w-full px-3 py-2 text-body border border-card-border rounded-control focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </div>
          {unit && qtyNum >= 1 && (
            <CartonPreview
              baseUnit={baseUnit}
              cartonUnit={unit}
              qtyPerCarton={qtyNum}
              unitPrice={unitPrice}
            />
          )}
        </div>
      )}
    </div>
  );
}
