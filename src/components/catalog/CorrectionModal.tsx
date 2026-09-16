import { useState, useMemo } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { StockTransactionPreview } from "./StockTransactionPreview";
import { cartonsToBase, baseToCartons } from "../../lib/stock";
import type { Item, StockMovement } from "../../types";

interface Props {
  item: Item;
  movement: StockMovement;
  isOpen: boolean;
  onConfirm: (qtyBase: number, unitCost: number, reasonNote: string) => Promise<void>;
  onDismiss: () => void;
}

export function CorrectionModal({ item, movement, isOpen, onConfirm, onDismiss }: Props) {
  const isIn = movement.movement_type === "manual_in";
  const hasCarton = !!(item.carton_unit && item.qty_per_carton && item.qty_per_carton > 0);

  const originalQty = Math.abs(Number(movement.qty_base));
  const defaultUseCarton = hasCarton && movement.qty_carton != null && Number(movement.qty_carton) > 0;

  const [useCarton, setUseCarton] = useState(defaultUseCarton);
  const [qtyCarton, setQtyCarton] = useState(
    defaultUseCarton && movement.qty_carton ? String(Math.abs(Number(movement.qty_carton))) : ""
  );
  const [qtyBase, setQtyBase] = useState(
    defaultUseCarton ? "" : String(originalQty)
  );
  const [unitCost, setUnitCost] = useState(
    movement.unit_cost != null ? String(Number(movement.unit_cost)) : ""
  );
  const [reasonNote, setReasonNote] = useState("");
  const [saving, setSaving] = useState(false);

  const computedQtyBase = useMemo(() => {
    if (hasCarton && useCarton && qtyCarton) {
      return cartonsToBase(parseFloat(qtyCarton) || 0, item.qty_per_carton!);
    }
    return parseFloat(qtyBase) || 0;
  }, [hasCarton, useCarton, qtyCarton, qtyBase, item.qty_per_carton]);

  async function handleConfirm() {
    if (computedQtyBase <= 0) return;
    if (isIn && (!unitCost || parseFloat(unitCost) <= 0)) return;
    setSaving(true);
    try {
      await onConfirm(computedQtyBase, parseFloat(unitCost) || 0, reasonNote);
    } finally {
      setSaving(false);
    }
  }

  const qtyDelta = isIn ? computedQtyBase - originalQty : originalQty - computedQtyBase;

  return (
    <Modal open={isOpen} onClose={onDismiss} title={isIn ? "แก้ไขการรับสินค้าเข้า" : "แก้ไขการตัดสต็อก"}>
      <div className="space-y-4">
        <div className="rounded-control border border-card-border bg-paper-field p-3 text-body space-y-1">
          <div className="font-medium text-ink-900">
            {isIn ? "รายการเดิม — รับเข้า" : "รายการเดิม — ตัดสต็อก"} {Math.abs(originalQty)} {item.base_unit}
          </div>
          {isIn && movement.unit_cost != null && (
            <div className="text-ink-700">
              ต้นทุนเดิม: ฿ {Number(movement.unit_cost).toLocaleString("th-TH")} / {item.base_unit}
            </div>
          )}
          {movement.reason && (
            <div className="text-ink-300 text-label italic">{movement.reason}</div>
          )}
        </div>

        {hasCarton ? (
          <div className="space-y-2">
            <label className="block text-body font-medium text-ink-900">
              จำนวนที่ถูกต้อง ({useCarton ? item.carton_unit : item.base_unit})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.001"
                value={useCarton ? qtyCarton : qtyBase}
                onChange={(e) => {
                  if (useCarton) setQtyCarton(e.target.value);
                  else setQtyBase(e.target.value);
                }}
                autoFocus
                className="flex-1 px-3 py-2 text-body border border-card-border rounded-control focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-body text-ink-300 shrink-0">
                {useCarton ? item.carton_unit : item.base_unit}
              </span>
            </div>
            {useCarton && qtyCarton && computedQtyBase > 0 && (
              <div className="text-label text-ink-300">
                = {computedQtyBase} {item.base_unit}
              </div>
            )}
            <button
              type="button"
              onClick={() => { setUseCarton(!useCarton); setQtyCarton(""); setQtyBase(""); }}
              className="text-label text-primary hover:underline"
            >
              ป้อนเป็น {useCarton ? item.base_unit : item.carton_unit} แทน
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-body font-medium text-ink-900">
              จำนวนที่ถูกต้อง ({item.base_unit})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.001"
                value={qtyBase}
                onChange={(e) => setQtyBase(e.target.value)}
                autoFocus
                className="flex-1 px-3 py-2 text-body border border-card-border rounded-control focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-body text-ink-300 shrink-0">{item.base_unit}</span>
            </div>
          </div>
        )}

        {isIn && (
          <div className="space-y-2">
            <label className="block text-body font-medium text-ink-900">
              ต้นทุนต่อ{item.base_unit} ที่ถูกต้อง
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
                className="flex-1 px-3 py-2 text-body border border-card-border rounded-control focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-body text-ink-300 shrink-0">฿</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-body font-medium text-ink-900 mb-1">
            หมายเหตุ
          </label>
          <input
            type="text"
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="เช่น กรอกผิด, แก้ไขให้ถูกต้อง"
            className="w-full px-3 py-2 text-body border border-card-border rounded-control focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {computedQtyBase > 0 && qtyDelta !== 0 && (
          <StockTransactionPreview
            currentStock={item.stock_count}
            delta={isIn ? qtyDelta : -qtyDelta}
            baseUnit={item.base_unit}
            cartonUnit={item.carton_unit}
            qtyPerCarton={item.qty_per_carton}
          />
        )}

        <Button
          onClick={handleConfirm}
          disabled={computedQtyBase <= 0 || saving}
          loading={saving}
          className="w-full"
        >
          ยืนยันแก้ไข
        </Button>
      </div>
    </Modal>
  );
}
