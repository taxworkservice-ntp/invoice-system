import { useState } from "react";
import { CheckCircle2, History } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatCurrency } from "../../lib/format";

/** The "เคยขาย..." suggestion shown under a line's price field. */
export interface PriceHintValue {
  /** `customer` = sold to the selected customer before; `all` = anyone. */
  scope: "customer" | "all";
  price: number;
  customerName?: string | null;
}

/** One wording for the suggestion, wherever it is shown. */
export function priceHintLabel(hint: PriceHintValue): string {
  return hint.scope === "customer"
    ? `เคยขายลูกค้านี้ ฿${formatCurrency(hint.price)}`
    : `เคยขายล่าสุด ฿${formatCurrency(hint.price)}${hint.customerName ? ` · ${hint.customerName}` : ""}`;
}

/**
 * "Sold before at ฿x — use this price" hint for one line.
 *
 * Replacing the price throws away what was typed (and, on a delivery note,
 * counts as confirming it), so the button asks first instead of applying on a
 * single tap. Shared by the deal form and the delivery-note form — the box, the
 * wording and the dialog exist once.
 */
export function PriceHint({
  hint,
  currentPrice,
  onApply,
  confirmsPrice = false,
}: {
  hint: PriceHintValue;
  /** The line's price right now — shown in the confirm so the trade is clear. */
  currentPrice: number;
  onApply: () => void;
  /** True when applying also marks the delivery note's price as reviewed. */
  confirmsPrice?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const label = priceHintLabel(hint);
  const alreadyUsing = Math.abs(currentPrice - hint.price) < 0.005;

  if (alreadyUsing) {
    return (
      <div className="flex items-center gap-2 rounded-control border border-card-border bg-paper-field px-2.5 py-2 text-label text-ink-500">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-text" />
        <span className="min-w-0">{label} · ใช้ราคานี้อยู่</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-card-border bg-paper-field px-2.5 py-2">
        <History className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span className="min-w-0 flex-1 text-label text-ink-600">{label}</span>
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          ใช้ราคานี้
        </Button>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="ใช้ราคานี้?">
        <p className="text-body text-ink-700">{label}</p>
        <p className="mt-2 text-label leading-5 text-ink-500">
          ระบบจะแทนที่ราคาปัจจุบัน ฿{formatCurrency(currentPrice)} ของรายการนี้
          {confirmsPrice ? " และจะถือว่ายืนยันราคาแล้ว" : ""}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => {
              onApply();
              setConfirming(false);
            }}
          >
            ใช้ราคานี้
          </Button>
        </div>
      </Modal>
    </>
  );
}
