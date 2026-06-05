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
    <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4">
      <div className="divide-y divide-[#F1EFE8]">
        <div className="flex justify-between py-2.5">
          <span className="text-[12px] text-[#888780]">ราคา</span>
          <span className="text-[13px] text-[#1A1A18]">
            ฿ {formatCurrency(item.unit_price)} / {item.base_unit}
          </span>
        </div>
        {hasCarton && (
          <div className="flex justify-between py-2.5">
            <span className="text-[12px] text-[#888780]">หน่วยรอง</span>
            <span className="text-[13px] text-[#1A1A18]">
              1 {item.carton_unit} = {item.qty_per_carton} {item.base_unit}
            </span>
          </div>
        )}
        <div className="flex justify-between py-2.5">
          <span className="text-[12px] text-[#888780]">แจ้งเตือน</span>
          <span className="text-[13px] text-[#1A1A18]">
            เหลือน้อยกว่า {item.low_stock_threshold} {item.base_unit}
          </span>
        </div>
        <div className="flex justify-between py-2.5">
          <span className="text-[12px] text-[#888780]">สถานะ</span>
          <span
            className={`text-[13px] ${item.is_active ? "text-[#27500A]" : "text-[#888780]"}`}
          >
            {item.is_active ? "ใช้งานอยู่" : "ซ่อนแล้ว"}
          </span>
        </div>
      </div>
    </div>
  );
}
