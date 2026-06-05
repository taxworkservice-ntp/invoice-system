import { useState } from "react";
import { StockMovementRow } from "./StockMovementRow";
import { Button } from "../ui/Button";
import type { StockMovement, Item } from "../../types";

interface Props {
  movements: StockMovement[];
  loading: boolean;
  item: Item;
  onLoadMore?: () => void;
}

const PAGE_SIZE = 20;

export function StockHistory({
  movements,
  loading,
  item,
  onLoadMore,
}: Props) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  const shown = movements.slice(0, visible);
  const hasMore = movements.length > visible;

  if (loading && movements.length === 0) {
    return (
      <div>
        <div className="text-[11px] uppercase font-semibold text-[#888780] mb-2">
          ประวัติการเคลื่อนไหวสต็อก
        </div>
        <div className="bg-white border border-[#E8E6DF] rounded-[10px]">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="py-3 px-4 border-b border-[#F1EFE8] last:border-b-0 animate-pulse"
            >
              <div className="flex gap-3">
                <div className="w-5 h-5 bg-gray-200 rounded shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[11px] uppercase font-semibold text-[#888780] mb-2">
        ประวัติการเคลื่อนไหวสต็อก
      </div>
      {movements.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-[#888780]">
          ยังไม่มีประวัติการเคลื่อนไหว
        </div>
      ) : (
        <div className="bg-white border border-[#E8E6DF] rounded-[10px] px-4">
          {shown.map((m) => (
            <StockMovementRow key={m.id} movement={m} item={item} />
          ))}
          {hasMore && (
            <div className="py-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (onLoadMore) {
                    onLoadMore();
                  } else {
                    setVisible((v) => v + PAGE_SIZE);
                  }
                }}
              >
                โหลดเพิ่มเติม
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
