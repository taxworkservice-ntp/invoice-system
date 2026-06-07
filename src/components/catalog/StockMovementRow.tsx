import { useNavigate } from "react-router-dom";
import type { StockMovement, Item } from "../../types";
import { formatBuddhistDate } from "../../lib/dates";
import { formatMixedStock } from "../../lib/stock";
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_ICONS } from "./constants";

interface Props {
  movement: StockMovement;
  item: Item;
}

export function StockMovementRow({ movement, item }: Props) {
  const navigate = useNavigate();
  const isIn =
    movement.movement_type === "manual_in" ||
    movement.movement_type === "auto_in" ||
    movement.movement_type === "return_in";
  const hasDocument =
    movement.movement_type === "auto_out" ||
    movement.movement_type === "auto_in" ||
    movement.movement_type === "return_in";

  const typeConfig = (() => {
    switch (movement.movement_type) {
      case "manual_in":
        return { qtyColor: "text-[#27500A]", iconColor: "text-[#27500A]" };
      case "auto_out":
        return { qtyColor: "text-[#888780]", iconColor: "text-[#888780]" };
      case "manual_out":
        return { qtyColor: "text-[#C0392B]", iconColor: "text-[#C0392B]" };
      case "auto_in":
        return { qtyColor: "text-[#888780]", iconColor: "text-[#888780]" };
      case "return_in":
        return { qtyColor: "text-[#378ADD]", iconColor: "text-[#378ADD]" };
      default:
        return { qtyColor: "text-[#888780]", iconColor: "text-[#888780]" };
    }
  })();

  const displayQty = Math.abs(movement.qty_base);

  return (
    <div className="py-3 border-b border-[#F1EFE8] last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          className={`text-lg shrink-0 leading-none mt-0.5 ${typeConfig.iconColor}`}
        >
          {MOVEMENT_TYPE_ICONS[movement.movement_type] || "+"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#1A1A18]">
              {MOVEMENT_TYPE_LABELS[movement.movement_type] ||
                movement.movement_type}
            </span>
            <span
              className={`text-[13px] font-semibold shrink-0 ml-3 ${typeConfig.qtyColor}`}
            >
              {isIn ? "+" : "-"}
              {formatMixedStock(
                displayQty,
                item.base_unit,
                item.carton_unit,
                item.qty_per_carton,
              )}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[11px] text-[#888780]">
              {formatBuddhistDate(movement.created_at)}
            </span>
            <span className="text-[11px] text-[#888780]">
              คงเหลือ{" "}
              {formatMixedStock(
                movement.balance_after,
                item.base_unit,
                item.carton_unit,
                item.qty_per_carton,
              )}
            </span>
          </div>
          {movement.reason && (
            <div className="text-[11px] text-[#AAAAAA] italic mt-0.5 truncate">
              {movement.reason}
            </div>
          )}
          {hasDocument && movement.document_id && (
            <button
              type="button"
              onClick={() => navigate(`/documents/${movement.document_id}`)}
              className="text-[11px] text-[#378ADD] hover:underline mt-0.5"
            >
              เอกสาร: {movement.document_id.slice(0, 8)}...
            </button>
          )}
          {movement.qty_carton && movement.carton_unit && (
            <div className="text-[11px] text-[#888780] mt-0.5">
              รวม {displayQty} {item.base_unit}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
