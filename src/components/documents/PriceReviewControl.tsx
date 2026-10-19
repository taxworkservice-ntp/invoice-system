import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/Button";

interface PriceReviewControlProps {
  confirmed: boolean;
  onConfirm: () => void;
  onUnconfirm: () => void;
  className?: string;
  /** Confirm button text — defaults to ยืนยันราคานี้. Pass the amount to show what's being confirmed. */
  confirmLabel?: string;
  /** Small hint rendered under the control (e.g. editing counts as confirming). */
  hint?: string;
}

/**
 * Per-line mandatory price review for delivery notes
 * (`require_dn_price_review`). One consistent affordance shared by the deal
 * form and the DN-from-quotation form: a clear confirm action (not a raw
 * checkbox).
 *
 * The price-history entry point is deliberately NOT here: a lookup is useful on
 * every line-item document, while the confirm gate is a delivery-note rule. The
 * editor renders `ประวัติราคาขาย` beside the price field, independent of this
 * control (see LineItemEditorModal).
 */
export function PriceReviewControl({
  confirmed,
  onConfirm,
  onUnconfirm,
  className = "",
  confirmLabel = "ยืนยันราคานี้",
  hint,
}: PriceReviewControlProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      {confirmed ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-label font-medium text-success-text">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ยืนยันราคาแล้ว
          </span>
          <button
            type="button"
            onClick={onUnconfirm}
            className="text-label text-ink-400 underline underline-offset-2 transition-colors hover:text-ink-600"
          >
            แก้ไข
          </button>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 text-label font-medium text-warning-text">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            ต้องยืนยันราคา
          </span>
          <Button size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
          {hint ? <span className="w-full text-label leading-4 text-ink-400">{hint}</span> : null}
        </>
      )}
    </div>
  );
}
