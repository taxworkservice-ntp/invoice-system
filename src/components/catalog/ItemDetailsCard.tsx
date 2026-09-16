import { formatCurrency } from "../../lib/format";
import type { Item } from "../../types";

interface Props {
  item: Item;
}

export function ItemDetailsCard({ item }: Props) {
  const hasCarton = !!(
    item.carton_unit &&
    item.qty_per_carton &&
    item.qty_per_carton > 0
  );

  return (
    <div className="bg-white border-[0.5px] border-card-border rounded-[10px] p-4">
      {item.sku && (
        <div className="mb-4 flex items-center justify-between rounded-[10px] border border-paper-warm bg-paper-tint px-3 py-2.5">
          <span className="text-label text-ink-300">SKU</span>
          <span className="text-body font-semibold text-ink-900">
            {item.sku}
          </span>
        </div>
      )}
      <div className="divide-y divide-draft-bg">
        <div className="flex justify-between py-2.5">
          <span className="text-label text-ink-300">ราคา</span>
          <span className="text-body text-ink-900">
            ฿ {formatCurrency(item.unit_price)} / {item.base_unit}
          </span>
        </div>
        {item.item_type === "product" && (
          <>
            <div className="flex justify-between py-2.5">
              <span className="text-label text-ink-300">ต้นทุนเฉลี่ย</span>
              <span className="text-body text-ink-900">
                ฿ {formatCurrency(item.avg_cost)} / {item.base_unit}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-label text-ink-300">มูลค่าสต็อก</span>
              <span className="text-body text-ink-900">
                ฿ {formatCurrency(item.stock_value)}
              </span>
            </div>
          </>
        )}
        {hasCarton && (
          <div className="flex justify-between py-2.5">
            <span className="text-label text-ink-300">หน่วยรอง</span>
            <span className="text-body text-ink-900">
              1 {item.carton_unit} = {item.qty_per_carton} {item.base_unit}
            </span>
          </div>
        )}
        {item.item_type === "product" && (
          <div className="flex justify-between py-2.5">
            <span className="text-label text-ink-300">แจ้งเตือน</span>
            <span className="text-body text-ink-900">
              เหลือน้อยกว่า {item.low_stock_threshold} {item.base_unit}
            </span>
          </div>
        )}
        <div className="flex justify-between py-2.5">
          <span className="text-label text-ink-300">สถานะ</span>
          <span
            className={`text-body ${item.is_active ? "text-paid-text" : "text-ink-300"}`}
          >
            {item.is_active ? "ใช้งานอยู่" : "ซ่อนแล้ว"}
          </span>
        </div>
      </div>
    </div>
  );
}
