import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { isLowStock, isOutOfStock, formatMixedStock } from "../../lib/stock";
import { formatCurrency } from "../../lib/format";
import { SortableTh } from "../ui/SortableTh";
import { useTableSort } from "../ui/useTableSort";
import { TABLE } from "../../lib/tableStyles";
import type { Item } from "../../types";

interface Props {
  items: Item[];
  startIndex?: number;
  onToggleFavorite?: (item: Item, e: React.MouseEvent) => void;
}

type SortKey =
  "name" | "stock_count" | "base_unit" | "low_stock_threshold" | "avg_cost" | "stock_value";

function StockRow({
  item,
  index,
  onToggleFavorite,
}: {
  item: Item;
  index: number;
  onToggleFavorite?: (item: Item, e: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();
  const isProduct = item.item_type === "product";
  const low = isProduct && isLowStock(item.stock_count, item.low_stock_threshold);
  const out = isProduct && isOutOfStock(item.stock_count);
  const value = item.stock_value;

  let textColor = "";
  if (out) {
    textColor = "text-overdue-text";
  } else if (low) {
    textColor = "text-pending-text";
  }

  return (
    <tr className={`${TABLE.tbodyTr} group`} onClick={() => navigate(`/catalog/${item.id}`)}>
      {onToggleFavorite && (
        <td className="px-2 py-3 md:py-2 w-[42px]" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => onToggleFavorite(item, e)}
            aria-label={item.is_favorite ? "เลิกรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
            aria-pressed={item.is_favorite}
            className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded-control hover:bg-line-faint transition-colors"
          >
            <Star
              size={14}
              className={
                item.is_favorite ? "fill-warning text-warning" : "text-ink-200 hover:text-warning"
              }
            />
          </button>
        </td>
      )}
      <td
        className={`border-l-2 px-3 py-3 md:py-2 text-label text-ink-400 w-8 text-right tabular-nums ${out ? "border-l-danger" : low ? "border-l-warning" : "border-l-transparent"}`}
      >
        {index}
      </td>
      <td className={`${TABLE.tdSticky} px-3 py-3 md:py-2 min-w-0`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-body leading-tight text-ink-900" title={item.name}>
            {item.name}
          </span>
          {out && (
            <span className="shrink-0 rounded border border-danger-border bg-danger-soft px-1.5 py-0.5 text-label font-medium text-danger-text">
              หมด
            </span>
          )}
          {low && !out && (
            <span className="shrink-0 rounded border border-warning-border bg-warning-soft px-1.5 py-0.5 text-label font-medium text-warning-text">
              ใกล้หมด
            </span>
          )}
        </div>
        {item.sku && <div className="text-label text-ink-400">{item.sku}</div>}
      </td>
      <td
        className={`px-3 py-3 md:py-2 text-body text-right tabular-nums font-medium ${textColor || "text-ink-900"}`}
      >
        {item.item_type === "product" ? item.stock_count : "—"}
      </td>
      <td className="px-3 py-3 md:py-2 text-label text-ink-400 text-center">
        {item.item_type === "product" ? item.base_unit : "—"}
      </td>
      <td className="px-3 py-3 md:py-2 text-label text-right text-ink-400">
        {item.item_type === "product"
          ? formatMixedStock(
              item.stock_count,
              item.base_unit,
              item.carton_unit,
              item.qty_per_carton,
            )
          : "—"}
      </td>
      <td className="px-3 py-3 md:py-2 text-label text-right tabular-nums text-ink-400">
        {item.item_type === "product" ? item.low_stock_threshold : "—"}
      </td>
      <td className="px-3 py-3 md:py-2 text-label text-right tabular-nums text-ink-500">
        {item.item_type === "product"
          ? item.avg_cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })
          : "—"}
      </td>
      <td className="px-3 py-3 md:py-2 text-label text-right tabular-nums font-medium text-ink-900">
        {item.item_type === "product"
          ? value.toLocaleString("th-TH", { minimumFractionDigits: 2 })
          : formatCurrency(item.unit_price)}
      </td>
    </tr>
  );
}

export function StockReportTable({ items, startIndex = 0, onToggleFavorite }: Props) {
  const { sort, handleSort, sorted } = useTableSort<Item, SortKey>(items, {
    key: "name",
    dir: "asc",
  });

  if (items.length === 0) return null;

  return (
    <div className={TABLE.cardWrapper}>
      <div className={TABLE.scrollBody}>
        <table className={`${TABLE.table} min-w-[760px]`}>
          <thead>
            <tr className={TABLE.theadTr}>
              {onToggleFavorite && <th className="px-3 py-2 w-[42px]" />}
              <th className={`${TABLE.thStatic} w-8 text-right`}>#</th>
              <SortableTh
                label="รายการ"
                align="left"
                active={sort.key === "name"}
                dir={sort.dir}
                onClick={() => handleSort("name")}
                className={`${TABLE.thSortable} ${TABLE.thSticky} min-w-[180px]`}
              />
              <SortableTh
                label="สต็อก"
                align="right"
                active={sort.key === "stock_count"}
                dir={sort.dir}
                onClick={() => handleSort("stock_count")}
                className={TABLE.thSortable}
              />
              <SortableTh
                label="หน่วย"
                align="right"
                active={sort.key === "base_unit"}
                dir={sort.dir}
                onClick={() => handleSort("base_unit")}
                className={TABLE.thSortable}
              />
              <th className={`${TABLE.thStatic} text-right`}>นับรวม</th>
              <SortableTh
                label="แจ้งเตือน"
                align="right"
                active={sort.key === "low_stock_threshold"}
                dir={sort.dir}
                onClick={() => handleSort("low_stock_threshold")}
                className={TABLE.thSortable}
              />
              <SortableTh
                label="ต้นทุนเฉลี่ย"
                align="right"
                active={sort.key === "avg_cost"}
                dir={sort.dir}
                onClick={() => handleSort("avg_cost")}
                className={TABLE.thSortable}
              />
              <SortableTh
                label="มูลค่า"
                align="right"
                active={sort.key === "stock_value"}
                dir={sort.dir}
                onClick={() => handleSort("stock_value")}
                className={TABLE.thSortable}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => (
              <StockRow
                key={item.id}
                item={item}
                index={startIndex + i + 1}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
