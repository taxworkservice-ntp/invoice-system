import { formatBaseWithCartonHint, formatMixedStock } from "../../lib/stock";
import type { Item } from "../../types";

interface Props {
  item: Item;
  onStockIn?: () => void;
  onStockOut?: () => void;
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
    ? "text-danger"
    : isLow
      ? "text-pending-text"
      : "text-ink-900";

  return (
    <div className="rounded-[10px] border-[0.5px] border-card-border bg-white p-4">
      <div className="mb-1 text-label font-semibold text-ink-300">
        สต็อกปัจจุบัน
      </div>
      <div className={`text-hero font-semibold leading-tight ${stockColor}`}>
        {formatMixedStock(
          item.stock_count,
          item.base_unit,
          item.carton_unit,
          item.qty_per_carton,
        )}
      </div>
      {hasCarton && (
        <div className="text-title text-ink-300">
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
        <span className="mt-2 inline-flex rounded bg-pending-bg px-2 py-0.5 text-label font-medium text-pending-text">
          ใกล้หมด
        </span>
      )}
      {isOut && (
        <span className="mt-2 inline-flex rounded bg-overdue-bg px-2 py-0.5 text-label font-medium text-overdue-text">
          หมด
        </span>
      )}
      {(onStockIn || onStockOut) && (
        <div className="mt-4 flex gap-2">
          {onStockIn && (
            <button
              type="button"
              onClick={onStockIn}
              className="flex-1 rounded-control border-[0.5px] border-success-border bg-paid-bg px-4 py-2.5 text-body font-medium text-paid-text transition-colors hover:bg-success-border"
            >
              รับสินค้าเข้า
            </button>
          )}
          {onStockOut && (
            <button
              type="button"
              onClick={onStockOut}
              className="flex-1 rounded-control border-[0.5px] border-danger-border bg-overdue-bg px-4 py-2.5 text-body font-medium text-overdue-text transition-colors hover:bg-danger-border"
            >
              ตัดสต็อก
            </button>
          )}
        </div>
      )}
    </div>
  );
}
