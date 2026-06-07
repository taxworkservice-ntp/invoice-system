import { useNavigate } from "react-router-dom";
import { isLowStock, isOutOfStock, formatMixedStock } from "../../lib/stock";
import type { Item } from "../../types";

interface Props {
  items: Item[];
  startIndex?: number;
}

function StockRow({ item, index }: { item: Item; index: number }) {
  const navigate = useNavigate();
  const low = isLowStock(item.stock_count, item.low_stock_threshold);
  const out = isOutOfStock(item.stock_count);
  const value = item.stock_count * item.unit_price;

  let rowBg = "";
  let textColor = "";
  if (out) {
    rowBg = "bg-red-50/60";
    textColor = "text-red-700";
  } else if (low) {
    rowBg = "bg-amber-50/60";
    textColor = "text-amber-800";
  }

  return (
    <tr
      className={`cursor-pointer border-b border-[#F0EDE6] transition-colors hover:bg-gray-50/60 ${rowBg}`}
      onClick={() => navigate(`/catalog/${item.id}`)}
    >
      <td className="px-2 py-2.5 text-[11px] text-gray-400 w-8 text-right tabular-nums">
        {index}
      </td>
      <td className="px-2 py-2.5 min-w-0">
        <div className={`text-sm leading-tight ${out ? "text-red-700" : low ? "text-amber-900" : "text-gray-800"}`}>
          {item.name}
        </div>
        {item.sku && (
          <div className="text-[10px] text-gray-400">{item.sku}</div>
        )}
      </td>
      <td className={`px-2 py-2.5 text-sm text-right tabular-nums ${textColor}`}>
        {item.stock_count}
      </td>
      <td className="px-2 py-2.5 text-[11px] text-gray-500 text-center">
        {item.base_unit}
      </td>
      <td className="px-2 py-2.5 text-[11px] text-right text-gray-500">
        {formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton)}
      </td>
      <td className="px-2 py-2.5 text-xs text-right tabular-nums text-gray-500">
        {item.low_stock_threshold}
      </td>
      <td className="px-2 py-2.5 text-xs text-right tabular-nums text-gray-600 hidden sm:table-cell">
        {item.unit_price.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </td>
      <td className="px-2 py-2.5 text-xs text-right tabular-nums font-medium text-gray-700 hidden sm:table-cell">
        {value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </td>
    </tr>
  );
}

function StockRowMobile({ item, index }: { item: Item; index: number }) {
  const navigate = useNavigate();
  const low = isLowStock(item.stock_count, item.low_stock_threshold);
  const out = isOutOfStock(item.stock_count);
  const value = item.stock_count * item.unit_price;

  let rowBg = "";
  if (out) rowBg = "bg-red-50/60";
  else if (low) rowBg = "bg-amber-50/60";

  return (
    <div
      className={`cursor-pointer border-b border-[#F0EDE6] px-3 py-2.5 transition-colors hover:bg-gray-50/60 ${rowBg}`}
      onClick={() => navigate(`/catalog/${item.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] text-gray-400 mr-1">{index}.</span>
          <span className={`text-sm ${out ? "text-red-700" : low ? "text-amber-900" : "text-gray-800"}`}>
            {item.name}
          </span>
          {item.sku && <span className="text-[10px] text-gray-400 ml-1">{item.sku}</span>}
        </div>
        <div className={`shrink-0 text-sm font-medium tabular-nums text-right ${out ? "text-red-700" : low ? "text-amber-800" : "text-gray-800"}`}>
          {item.stock_count} <span className="text-[10px] font-normal text-gray-400">{item.base_unit}</span>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-gray-500">
        <span>นับรวม: {formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton)}</span>
        <span>แจ้งเตือน: {item.low_stock_threshold}</span>
        <span>฿{item.unit_price.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
        <span className="font-medium text-gray-600">= ฿{value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

export function StockReportTable({ items, startIndex = 0 }: Props) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E8E6DF]">
              <th className="px-2 py-2 text-left text-[10px] uppercase tracking-[0.08em] text-[#888780] font-medium w-8">#</th>
              <th className="px-2 py-2 text-left text-[10px] uppercase tracking-[0.08em] text-[#888780] font-medium">รายการ</th>
              <th className="px-2 py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[#888780] font-medium">สต็อก</th>
              <th className="px-2 py-2 text-center text-[10px] uppercase tracking-[0.08em] text-[#888780] font-medium">หน่วย</th>
              <th className="px-2 py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[#888780] font-medium">นับรวม</th>
              <th className="px-2 py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[#888780] font-medium">แจ้งเตือน</th>
              <th className="px-2 py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[#888780] font-medium">ราคา</th>
              <th className="px-2 py-2 text-right text-[10px] uppercase tracking-[0.08em] text-[#888780] font-medium">มูลค่า</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <StockRow key={item.id} item={item} index={startIndex + i + 1} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden">
        {items.map((item, i) => (
          <StockRowMobile key={item.id} item={item} index={startIndex + i + 1} />
        ))}
      </div>
    </div>
  );
}
