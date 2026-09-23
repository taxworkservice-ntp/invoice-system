import { AlertTriangle, CheckCircle2, History } from "lucide-react";
import { Button } from "../ui/Button";

interface PriceReviewControlProps {
  confirmed: boolean;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onOpenHistory?: () => void;
  className?: string;
}

/**
 * Per-line mandatory price review for delivery notes
 * (`require_dn_price_review`). One consistent affordance shared by the deal
 * form and the DN-from-quotation form: a clear confirm action (not a raw
 * checkbox) plus an optional price-history entry point.
 */
export function PriceReviewControl({
  confirmed,
  onConfirm,
  onUnconfirm,
  onOpenHistory,
  className = "",
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
            ยืนยันราคานี้
          </Button>
        </>
      )}
      {onOpenHistory ? (
        <button
          type="button"
          onClick={onOpenHistory}
          className="ml-auto inline-flex items-center gap-1 text-label font-medium text-primary transition-colors hover:underline"
        >
          <History className="h-3.5 w-3.5" />
          ประวัติราคาขาย
        </button>
      ) : null}
    </div>
  );
}
