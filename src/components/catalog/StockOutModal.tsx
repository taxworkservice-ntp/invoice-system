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
            <label className="block text-[13px] font-medium text-[#1A1A18]">
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
                className="flex-1 px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20"
              />
              <span className="text-sm text-[#888780] shrink-0">
                {useCarton ? item.carton_unit : item.base_unit}
              </span>
            </div>
            {useCarton && qtyCarton && computedQtyBase > 0 && (
              <div className="text-[11px] text-[#888780]">
                = {computedQtyBase} {item.base_unit}
              </div>
            )}
            <button
              type="button"
              onClick={() => setUseCarton(!useCarton)}
              className="text-[12px] text-[#378ADD] hover:underline"
            >
              ป้อนเป็น {item.base_unit} แทน
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-[#1A1A18]">
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
                className="flex-1 px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20"
              />
              <span className="text-sm text-[#888780] shrink-0">
                {item.base_unit}
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-[13px] font-medium text-[#1A1A18] mb-1">
            เหตุผล
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="สินค้าเสียหาย / สูญหาย..."
            className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20"
          />
          <div className="text-[11px] text-[#888780] mt-1">
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
          className="w-full !bg-[#C0392B] hover:!bg-[#9e2d22] !text-white"
        >
          ยืนยันตัดสต็อก
        </Button>
      </div>
    </Modal>
  );
}
