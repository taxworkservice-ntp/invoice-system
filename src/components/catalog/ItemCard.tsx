import { Star } from "lucide-react";
import type { Item } from "../../types";
import { formatCurrency } from "../../lib/format";
import { formatMixedStock, isLowStock, isOutOfStock } from "../../lib/stock";

interface Props {
  item: Item;
  onTap: (item: Item) => void;
  onToggleFavorite?: (item: Item, e: React.MouseEvent) => void;
  variant?: "list" | "grid";
}

export function ItemCard({ item, onTap, onToggleFavorite, variant = "list" }: Props) {
  const isProduct = item.item_type === "product";
  const isOut = isProduct && isOutOfStock(item.stock_count);
  const isLow = isProduct && !isOut && isLowStock(item.stock_count, item.low_stock_threshold);
  const hasCarton = !!(item.carton_unit && item.qty_per_carton && item.qty_per_carton > 0);

  if (variant === "grid") {
    const dotColor = isOut
      ? "bg-[#C0392B]"
      : isLow
      ? "bg-[#F59E0B]"
      : "bg-[#22C55E]";

    return (
      <div
        onClick={() => onTap(item)}
        className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] px-3.5 py-3 w-full cursor-pointer hover:shadow-md transition-shadow relative min-h-[120px] flex flex-col gap-2"
      >
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => onToggleFavorite(item, e)}
            aria-label={item.is_favorite ? "เลิกรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
            aria-pressed={item.is_favorite}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#F7F6F3] transition-colors z-10"
          >
            <Star
              size={15}
              className={item.is_favorite ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#AAAAAA] hover:text-[#F59E0B]"}
            />
          </button>
        )}
        <div className="flex items-start gap-2 pr-7">
          {isProduct ? (
            <span
              className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${dotColor}`}
              aria-label={
                isOut
                  ? "สต็อกหมด"
                  : isLow
                  ? "สต็อกใกล้หมด"
                  : "สต็อกปกติ"
              }
            />
          ) : (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F1EFE8] text-[#888780] shrink-0">
              บริการ
            </span>
          )}
          <div className="min-w-0 flex-1">
            {item.sku && (
              <div className="text-[10px] font-mono text-[#888780] mb-0.5 truncate">
                {item.sku}
              </div>
            )}
            <div className="text-[13px] font-semibold text-[#1A1A18] line-clamp-2 leading-tight">
              {item.name}
            </div>
          </div>
        </div>
        <div className="mt-auto pt-2 border-t border-[#F0EFE9]">
          <div className="text-[12px] font-medium text-[#1A1A18] whitespace-nowrap truncate">
            ฿ {formatCurrency(item.unit_price)} / {item.base_unit}
          </div>
          {hasCarton && (
            <div className="text-[10px] text-[#888780] truncate">
              ฿ {formatCurrency(item.unit_price * item.qty_per_carton!)} / {item.carton_unit}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onTap(item)}
      className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] px-4 py-[14px] w-full cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-3">
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => onToggleFavorite(item, e)}
            aria-label={item.is_favorite ? "เลิกรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
            aria-pressed={item.is_favorite}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#F7F6F3] transition-colors"
          >
            <Star
              size={16}
              className={item.is_favorite ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#AAAAAA] hover:text-[#F59E0B]"}
            />
          </button>
        )}
        <div className="flex-1 min-w-0 flex items-start justify-between">
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
                ฿ {formatCurrency(item.unit_price * item.qty_per_carton!)} /{" "}
                {item.carton_unit}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span
          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isProduct
              ? "bg-[#E6F1FB] text-[#0C447C]"
              : "bg-[#F1EFE8] text-[#888780]"
          }`}
        >
          {isProduct ? "สินค้า" : "บริการ"}
        </span>
        {isProduct && (
          <span
            className={`text-[12px] ${
              isOut ? "text-[#C0392B] font-medium" : "text-[#888780]"
            }`}
          >
            {isOut
              ? "สต็อก: หมด"
              : `สต็อก: ${formatMixedStock(
                  item.stock_count,
                  item.base_unit,
                  item.carton_unit,
                  item.qty_per_carton,
                )}`}
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
            ใกล้หมด
          </span>
        )}
      </div>
    </div>
  );
}
