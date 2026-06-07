import { formatMixedStock } from "../../lib/stock";
import type { Item } from "../../types";

interface Props {
  item: Item;
  onStockIn: () => void;
  onStockOut: () => void;
}

export function StockStatusCard({ item, onStockIn, onStockOut }: Props) {
  const isOut = item.stock_count === 0;
  const isLow =
    item.stock_count > 0 &&
    item.low_stock_threshold > 0 &&
    item.stock_count <= item.low_stock_threshold;
  const hasCarton = !!(
    item.carton_unit &&
    item.qty_per_carton &&
    item.qty_per_carton > 0
  );

  const stockColor = isOut
    ? "text-[#C0392B]"
    : isLow
      ? "text-[#633806]"
      : "text-[#1A1A18]";

  return (
    <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4">
      <div className="text-[11px] uppercase font-semibold text-[#888780] mb-1">
        สต็อกปัจจุบัน
      </div>
      <div className={`text-[36px] font-bold leading-tight ${stockColor}`}>
        {formatMixedStock(
          item.stock_count,
          item.base_unit,
          item.carton_unit,
          item.qty_per_carton,
        )}
      </div>
      {hasCarton && (
        <div className="text-[16px] text-[#888780]">
          รวม {item.stock_count.toLocaleString("th-TH")} {item.base_unit}
        </div>
      )}
      {isLow && !isOut && (
        <span className="inline-flex mt-2 px-2 py-0.5 rounded text-[10px] font-medium bg-[#FAEEDA] text-[#633806]">
          ใกล้หมด
        </span>
      )}
      {isOut && (
        <span className="inline-flex mt-2 px-2 py-0.5 rounded text-[10px] font-medium bg-[#FCEBEB] text-[#791F1F]">
          หมด
        </span>
      )}
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onStockIn}
          className="flex-1 px-4 py-2.5 rounded-lg bg-[#EAF3DE] border-[0.5px] border-[#C8E6B0] text-[#27500A] text-[13px] font-medium hover:bg-[#dcebcb] transition-colors"
        >
          รับสินค้าเข้า
        </button>
        <button
          type="button"
          onClick={onStockOut}
          className="flex-1 px-4 py-2.5 rounded-lg bg-[#FCEBEB] border-[0.5px] border-[#F5C6C6] text-[#791F1F] text-[13px] font-medium hover:bg-[#f9d9d9] transition-colors"
        >
          ตัดสต็อก
        </button>
      </div>
    </div>
  );
}
