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

type SortKey = "name" | "stock_count" | "base_unit" | "low_stock_threshold" | "avg_cost" | "stock_value";

function StockRow({ item, index, onToggleFavorite }: { item: Item; index: number; onToggleFavorite?: (item: Item, e: React.MouseEvent) => void }) {
  const navigate = useNavigate();
  const isProduct = item.item_type === "product";
  const low = isProduct && isLowStock(item.stock_count, item.low_stock_threshold);
  const out = isProduct && isOutOfStock(item.stock_count);
  const value = item.stock_value;

  let textColor = "";
  if (out) {
    textColor = "text-[#791F1F]";
  } else if (low) {
    textColor = "text-[#633806]";
  }

  return (
    <tr
      className={TABLE.tbodyTr}
      onClick={() => navigate(`/catalog/${item.id}`)}
    >
      {onToggleFavorite && (
        <td className="px-2 py-2 w-[42px]" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => onToggleFavorite(item, e)}
            aria-label={item.is_favorite ? "เลิกรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
            aria-pressed={item.is_favorite}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#F0EFE9] transition-colors"
          >
            <Star
              size={14}
              className={item.is_favorite ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#AAAAAA] hover:text-[#F59E0B]"}
            />
          </button>
        </td>
      )}
      <td className={`border-l-2 px-3 py-2 text-[11px] text-[#667085] w-8 text-right tabular-nums ${
        out ? "border-l-[#C0392B]" : low ? "border-l-[#F59E0B]" : "border-l-transparent"
      }`}>
        {index}
      </td>
      <td className="px-3 py-2 min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] leading-tight text-[#111827]">
            {item.name}
          </span>
          {out && (
            <span className="shrink-0 rounded border border-[#F2C7C7] bg-[#FEF3F2] px-1.5 py-0.5 text-[10px] font-medium text-[#B42318]">
              หมด
            </span>
          )}
          {low && !out && (
            <span className="shrink-0 rounded border border-[#FCDFA6] bg-[#FFFAEB] px-1.5 py-0.5 text-[10px] font-medium text-[#B54708]">
              ใกล้หมด
            </span>
          )}
        </div>
        {item.sku && (
          <div className="text-[10px] text-[#667085]">{item.sku}</div>
        )}
      </td>
      <td className={`px-3 py-2 text-[13px] text-right tabular-nums font-medium ${textColor || "text-[#111827]"}`}>
        {item.item_type === "product" ? item.stock_count : "—"}
      </td>
      <td className="px-3 py-2 text-[11px] text-[#667085] text-center">
        {item.item_type === "product" ? item.base_unit : "—"}
      </td>
      <td className="px-3 py-2 text-[11px] text-right text-[#667085]">
        {item.item_type === "product" ? formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton) : "—"}
      </td>
      <td className="px-3 py-2 text-[12px] text-right tabular-nums text-[#667085]">
        {item.item_type === "product" ? item.low_stock_threshold : "—"}
      </td>
      <td className="px-3 py-2 text-[12px] text-right tabular-nums text-[#475467] hidden sm:table-cell">
        {item.item_type === "product" ? item.avg_cost.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—"}
      </td>
      <td className="px-3 py-2 text-[12px] text-right tabular-nums font-medium text-[#111827] hidden sm:table-cell">
        {item.item_type === "product" ? value.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : formatCurrency(item.unit_price)}
      </td>
    </tr>
  );
}

function StockRowMobile({ item, index, onToggleFavorite }: { item: Item; index: number; onToggleFavorite?: (item: Item, e: React.MouseEvent) => void }) {
  const navigate = useNavigate();
  const isProduct = item.item_type === "product";
  const low = isProduct && isLowStock(item.stock_count, item.low_stock_threshold);
  const out = isProduct && isOutOfStock(item.stock_count);
  const value = item.stock_value;

  return (
    <div
      className={`cursor-pointer border-b border-l-2 border-b-[#F0EFE9] last:border-b-0 px-3 py-2.5 transition-colors hover:bg-[#FAFAF7] ${
        out ? "border-l-[#C0392B]" : low ? "border-l-[#F59E0B]" : "border-l-transparent"
      }`}
      onClick={() => navigate(`/catalog/${item.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(item, e); }}
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
        <div className="min-w-0 flex-1">
          <span className="text-[10px] text-[#888780] mr-1">{index}.</span>
          <span className="text-[14px] text-[#1A1A18]">
            {item.name}
          </span>
          {out && (
            <span className="ml-1 inline-flex rounded border border-[#F2C7C7] bg-[#FEF3F2] px-1.5 py-0.5 text-[10px] font-medium text-[#B42318]">
              หมด
            </span>
          )}
          {low && !out && (
            <span className="ml-1 inline-flex rounded border border-[#FCDFA6] bg-[#FFFAEB] px-1.5 py-0.5 text-[10px] font-medium text-[#B54708]">
              ใกล้หมด
            </span>
          )}
          {item.sku && <span className="text-[10px] text-[#888780] ml-1">{item.sku}</span>}
        </div>
        <div className={`shrink-0 text-[14px] font-medium tabular-nums text-right ${out ? "text-[#791F1F]" : low ? "text-[#633806]" : "text-[#1A1A18]"}`}>
          {isProduct ? (
            <>{item.stock_count} <span className="text-[10px] font-normal text-[#888780]">{item.base_unit}</span></>
          ) : (
            <span className="text-[#1A1A18]">฿ {formatCurrency(item.unit_price)}</span>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-[#888780] flex-wrap">
        {isProduct ? (
          <>
            <span>นับรวม: {formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton)}</span>
            <span>แจ้งเตือน: {item.low_stock_threshold}</span>
            <span>ทุน ฿{item.avg_cost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            <span className="font-medium text-[#444441]">= ฿{value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </>
        ) : (
          <span>{item.base_unit}</span>
        )}
      </div>
    </div>
  );
}

export function StockReportTable({ items, startIndex = 0, onToggleFavorite }: Props) {
  const { sort, handleSort, sorted } = useTableSort<Item, SortKey>(items, { key: "name", dir: "asc" });

  if (items.length === 0) return null;

  return (
    <div>
      <div className="hidden sm:block bg-white border border-card-border rounded-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className={TABLE.table}>
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
                  className={TABLE.thSortable}
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
                  className={`${TABLE.thSortable} hidden sm:table-cell`}
                />
                <SortableTh
                  label="มูลค่า"
                  align="right"
                  active={sort.key === "stock_value"}
                  dir={sort.dir}
                  onClick={() => handleSort("stock_value")}
                  className={`${TABLE.thSortable} hidden sm:table-cell`}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => (
                <StockRow key={item.id} item={item} index={startIndex + i + 1} onToggleFavorite={onToggleFavorite} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sm:hidden bg-white border border-card-border rounded-card overflow-hidden">
        {sorted.map((item, i) => (
          <StockRowMobile key={item.id} item={item} index={startIndex + i + 1} onToggleFavorite={onToggleFavorite} />
        ))}
      </div>
    </div>
  );
}
