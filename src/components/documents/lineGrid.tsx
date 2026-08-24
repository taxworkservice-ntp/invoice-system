/**
 * Shared primitives for compact line-item grids used across invoice
 * creation forms. Keeps column geometry and input styling identical
 * between InvoiceFromDeliveryNotesForm and InvoiceFromQuotationForm.
 */

export const LINE_GRID_COLS =
  "grid-cols-[minmax(180px,1fr)_78px_58px_98px_62px_100px_30px]";

export function numericInputClass(highlight: boolean) {
  return `w-full rounded-lg border bg-white px-2 py-1.5 text-right text-sm tabular-nums text-ink-900 outline-none transition-colors ${
    highlight
      ? "border-amber-400 bg-amber-50/60 focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
      : "border-card-border focus:border-primary focus:ring-2 focus:ring-primary/20"
  }`;
}

export function LineGridHeaderRow() {
  return (
    <div
      className={`grid ${LINE_GRID_COLS} items-end gap-x-2 border-b border-card-border px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-gray-400`}
    >
      <span>รายการ</span>
      <span className="text-right">จำนวน</span>
      <span>หน่วย</span>
      <span className="text-right">ราคา/หน่วย</span>
      <span className="text-right">ส่วนลด %</span>
      <span className="text-right">รวม (฿)</span>
      <span />
    </div>
  );
}
