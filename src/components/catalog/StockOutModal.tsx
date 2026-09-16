import { useState, useMemo } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { StockTransactionPreview } from "./StockTransactionPreview";
import { cartonsToBase } from "../../lib/stock";
import type { Item } from "../../types";

interface Props {
  item: Item;
  isOpen: boolean;
  onConfirm: (qtyBase: number, reason: string) => Promise<void>;
  onDismiss: () => void;
}

export function StockOutModal({ item, isOpen, onConfirm, onDismiss }: Props) {
  const hasCarton = !!(
    item.carton_unit &&
    item.qty_per_carton &&
    item.qty_per_carton > 0
  );
  const [useCarton, setUseCarton] = useState(hasCarton);
  const [qtyCarton, setQtyCarton] = useState("");
  const [qtyBase, setQtyBase] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const computedQtyBase = useMemo(() => {
    if (hasCarton && useCarton && qtyCarton) {
      return cartonsToBase(
        parseFloat(qtyCarton) || 0,
        item.qty_per_carton!,
      );
    }
    return parseFloat(qtyBase) || 0;
  }, [hasCarton, useCarton, qtyCarton, qtyBase, item.qty_per_carton]);

  const negativeQty = -computedQtyBase;

  async function handleConfirm() {
    if (computedQtyBase <= 0) return;
    setSaving(true);
    try {
      await onConfirm(computedQtyBase, reason);
    } finally {
      setSaving(false);
    }
  }

  function handleDismiss() {
    setQtyCarton("");
    setQtyBase("");
    setReason("");
    setUseCarton(hasCarton);
    onDismiss();
  }

  return (
    <Modal
      open={isOpen}
      onClose={handleDismiss}
      title={`ตัดสต็อก — ${item.name}`}
    >
      <div className="space-y-4">
        {hasCarton ? (
          <div className="space-y-2">
            <label className="block text-body font-medium text-ink-900">
              จำนวนที่ตัด ({useCarton ? item.carton_unit : item.base_unit})
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
              onClick={() => setUseCarton(!useCarton)}
              className="text-label text-primary hover:underline"
            >
              ป้อนเป็น {item.base_unit} แทน
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-body font-medium text-ink-900">
              จำนวนที่ตัด ({item.base_unit})
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
              <span className="text-body text-ink-300 shrink-0">
                {item.base_unit}
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-body font-medium text-ink-900 mb-1">
            เหตุผล
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="สินค้าเสียหาย / สูญหาย..."
            className="w-full px-3 py-2 text-body border border-card-border rounded-control focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="text-label text-ink-300 mt-1">
            แนะนำให้ระบุเหตุผล
          </div>
        </div>

        {computedQtyBase > 0 && (
          <StockTransactionPreview
            currentStock={item.stock_count}
            delta={negativeQty}
            baseUnit={item.base_unit}
            cartonUnit={item.carton_unit}
            qtyPerCarton={item.qty_per_carton}
          />
        )}

        <Button
          onClick={handleConfirm}
          disabled={computedQtyBase <= 0 || saving}
          loading={saving}
          className="w-full !bg-danger hover:!bg-danger !text-white"
        >
          ยืนยันตัดสต็อก
        </Button>
      </div>
    </Modal>
  );
}
