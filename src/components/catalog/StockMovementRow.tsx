import { useNavigate } from "react-router-dom";
import type { StockMovement, Item } from "../../types";
import { formatBuddhistDate } from "../../lib/dates";
import { formatCurrency } from "../../lib/format";
import { formatBaseWithCartonHint, formatMixedStock } from "../../lib/stock";
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_ICONS } from "./constants";

interface Props {
  movement: StockMovement;
  item: Item;
  onRevert?: (movement: StockMovement) => void;
  onEdit?: (movement: StockMovement) => void;
}

export function StockMovementRow({ movement, item, onRevert, onEdit }: Props) {
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
        return { qtyColor: "text-paid-text", iconColor: "text-paid-text" };
      case "auto_out":
        return { qtyColor: "text-ink-300", iconColor: "text-ink-300" };
      case "manual_out":
        return { qtyColor: "text-danger", iconColor: "text-danger" };
      case "auto_in":
        return { qtyColor: "text-ink-300", iconColor: "text-ink-300" };
      case "return_in":
        return { qtyColor: "text-primary", iconColor: "text-primary" };
      default:
        return { qtyColor: "text-ink-300", iconColor: "text-ink-300" };
    }
  })();

  const displayQty = Math.abs(movement.qty_base);

  return (
    <div className="border-b border-draft-bg py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 shrink-0 text-subtitle leading-none ${typeConfig.iconColor}`}
        >
          {MOVEMENT_TYPE_ICONS[movement.movement_type] || "+"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-body font-medium text-ink-900">
              {MOVEMENT_TYPE_LABELS[movement.movement_type] ||
                movement.movement_type}
            </span>
            <span
              className={`ml-3 shrink-0 text-body font-semibold ${typeConfig.qtyColor}`}
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
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-label text-ink-300">
              {formatBuddhistDate(movement.created_at)}
            </span>
            <span className="text-label text-ink-300">
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
            <div className="mt-0.5 truncate text-label italic text-ink-200">
              {movement.reason}
            </div>
          )}
          {(movement.unit_cost != null || movement.movement_value != null) && (
            <div className="mt-0.5 text-label text-ink-300">
              ทุน/หน่วย ฿{formatCurrency(movement.unit_cost || 0)} · มูลค่า ฿{formatCurrency(movement.movement_value || 0)}
            </div>
          )}
          {hasDocument && movement.document_id && (
            <button
              type="button"
              onClick={() => navigate(`/documents/${movement.document_id}`)}
              className="mt-0.5 text-label text-primary hover:underline"
            >
              เอกสาร: {movement.document_id.slice(0, 8)}...
            </button>
          )}
          {movement.qty_carton && movement.carton_unit && (
            <div className="mt-0.5 text-label text-ink-300">
              รวม{" "}
              {formatBaseWithCartonHint(
                displayQty,
                item.base_unit,
                item.carton_unit,
                item.qty_per_carton,
              )}
            </div>
          )}
          {(onEdit || onRevert) &&
            (movement.movement_type === "manual_in" ||
              movement.movement_type === "manual_out") &&
            !movement.parent_movement_id && (
              <div className="mt-1 flex items-center gap-3">
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(movement);
                    }}
                    className="text-label text-primary hover:underline"
                  >
                    แก้ไข
                  </button>
                )}
                {onRevert && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRevert(movement);
                    }}
                    className="text-label text-danger hover:underline"
                  >
                    ยกเลิกรายการนี้
                  </button>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
