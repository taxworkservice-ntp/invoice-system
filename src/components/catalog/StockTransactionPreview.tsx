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
    <div className="bg-[#F7F6F3] rounded-lg px-3 py-2.5 space-y-1 text-[12px]">
      <div className="flex justify-between">
        <span className="text-[#888780]">สต็อกปัจจุบัน</span>
        <span className="font-medium text-[#1A1A18]">
          {formatMixedStock(currentStock, baseUnit, cartonUnit, qtyPerCarton)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-[#888780]">{isIn ? "รับเข้า" : "ตัดออก"}</span>
        <span
          className={`font-medium ${isIn ? "text-[#27500A]" : "text-[#C0392B]"}`}
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
      <div className="border-t border-[#E8E6DF] pt-1 flex justify-between">
        <span className="text-[#888780]">
          {isIn ? "สต็อกหลังรับ" : "สต็อกคงเหลือ"}
        </span>
        <span className="font-semibold text-[#1A1A18]">
          {formatMixedStock(clampedAfter, baseUnit, cartonUnit, qtyPerCarton)}
        </span>
      </div>
      {willNegative && (
        <div className="text-[#633806] text-[11px]">
          สต็อกจะติดลบ ระบบจะตั้งค่าเป็น 0
        </div>
      )}
    </div>
  );
}
