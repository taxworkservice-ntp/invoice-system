import { formatBaseWithCartonHint, formatMixedStock } from "../../lib/stock";
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
    <div className="rounded-[10px] border-[0.5px] border-[#E8E6DF] bg-white p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase text-[#888780]">
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
          รวม{" "}
          {formatBaseWithCartonHint(
            item.stock_count,
            item.base_unit,
            item.carton_unit,
            item.qty_per_carton,
          )}
        </div>
      )}
      {isLow && !isOut && (
        <span className="mt-2 inline-flex rounded bg-[#FAEEDA] px-2 py-0.5 text-[10px] font-medium text-[#633806]">
          ใกล้หมด
        </span>
      )}
      {isOut && (
        <span className="mt-2 inline-flex rounded bg-[#FCEBEB] px-2 py-0.5 text-[10px] font-medium text-[#791F1F]">
          หมด
        </span>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onStockIn}
          className="flex-1 rounded-lg border-[0.5px] border-[#C8E6B0] bg-[#EAF3DE] px-4 py-2.5 text-[13px] font-medium text-[#27500A] transition-colors hover:bg-[#dcebcb]"
        >
          รับสินค้าเข้า
        </button>
        <button
          type="button"
          onClick={onStockOut}
          className="flex-1 rounded-lg border-[0.5px] border-[#F5C6C6] bg-[#FCEBEB] px-4 py-2.5 text-[13px] font-medium text-[#791F1F] transition-colors hover:bg-[#f9d9d9]"
        >
          ตัดสต็อก
        </button>
      </div>
    </div>
  );
}
