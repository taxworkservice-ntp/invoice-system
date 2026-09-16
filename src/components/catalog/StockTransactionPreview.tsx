import { formatMixedStock } from "../../lib/stock";

interface Props {
  currentStock: number;
  delta: number;
  baseUnit: string;
  cartonUnit?: string | null;
  qtyPerCarton?: number | null;
}

export function StockTransactionPreview({
  currentStock,
  delta,
  baseUnit,
  cartonUnit,
  qtyPerCarton,
}: Props) {
  const afterStock = currentStock + delta;
  const clampedAfter = Math.max(0, afterStock);
  const willNegative = afterStock < 0;
  const isIn = delta > 0;

  return (
    <div className="bg-page-bg rounded-control px-3 py-2.5 space-y-1 text-label">
      <div className="flex justify-between">
        <span className="text-ink-300">สต็อกปัจจุบัน</span>
        <span className="font-medium text-ink-900">
          {formatMixedStock(currentStock, baseUnit, cartonUnit, qtyPerCarton)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-ink-300">{isIn ? "รับเข้า" : "ตัดออก"}</span>
        <span
          className={`font-medium ${isIn ? "text-paid-text" : "text-danger"}`}
        >
          {isIn ? "+" : "-"}
          {formatMixedStock(
            Math.abs(delta),
            baseUnit,
            cartonUnit,
            qtyPerCarton,
          )}
        </span>
      </div>
      <div className="border-t border-card-border pt-1 flex justify-between">
        <span className="text-ink-300">
          {isIn ? "สต็อกหลังรับ" : "สต็อกคงเหลือ"}
        </span>
        <span className="font-semibold text-ink-900">
          {formatMixedStock(clampedAfter, baseUnit, cartonUnit, qtyPerCarton)}
        </span>
      </div>
      {willNegative && (
        <div className="text-pending-text text-label">
          สต็อกจะติดลบ ระบบจะตั้งค่าเป็น 0
        </div>
      )}
    </div>
  );
}
