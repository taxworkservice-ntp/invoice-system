import type { Item } from "../../types";
import { formatCurrency } from "../../lib/format";
import { baseToCartons } from "../../lib/stock";

interface Props {
  item: Item;
  onTap: (item: Item) => void;
}

export function ItemCard({ item, onTap }: Props) {
  const isProduct = item.item_type === "product";
  const isOut = isProduct && item.stock_count === 0;
  const isLow =
    isProduct &&
    item.stock_count > 0 &&
    item.low_stock_threshold > 0 &&
    item.stock_count <= item.low_stock_threshold;
  const hasCarton = !!(item.carton_unit && item.qty_per_carton && item.qty_per_carton > 0);

  return (
    <div
      onClick={() => onTap(item)}
      className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] px-4 py-[14px] w-full cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-3">
          {item.sku && (
            <div className="mb-1">
              <span className="inline-flex rounded-full border border-[#E3DDD0] bg-[#F7F3EA] px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-[#7A5C1B]">
                {item.sku}
              </span>
            </div>
          )}
          <div className="text-[14px] font-semibold text-[#1A1A18] truncate">
            {item.name}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[13px] font-medium text-[#1A1A18] whitespace-nowrap">
            ฿ {formatCurrency(item.unit_price)} / {item.base_unit}
          </div>
          {hasCarton && (
            <div className="text-[11px] text-[#888780]">
              ฿ {formatCurrency(item.unit_price * item.qty_per_carton!)} / {item.carton_unit}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span
          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isProduct ? "bg-[#E6F1FB] text-[#0C447C]" : "bg-[#F1EFE8] text-[#888780]"
          }`}
        >
          {isProduct ? "สินค้า" : "บริการ"}
        </span>
        {isProduct && (
          <span className={`text-[12px] ${isOut ? "text-[#C0392B] font-medium" : "text-[#888780]"}`}>
            {isOut
              ? "สต็อก: หมดแล้ว"
              : `สต็อก: ${item.stock_count} ${item.base_unit}${
                  hasCarton
                    ? ` (${baseToCartons(item.stock_count, item.qty_per_carton!)} ${item.carton_unit})`
                    : ""
                }`}
          </span>
        )}
      </div>

      <div className="flex justify-end mt-1">
        {isOut && (
          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FCEBEB] text-[#791F1F]">
            หมด
          </span>
        )}
        {isLow && !isOut && (
          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FAEEDA] text-[#633806]">
            ⚠ เหลือน้อย
          </span>
        )}
      </div>
    </div>
  );
}
