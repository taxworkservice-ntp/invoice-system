import { formatCurrency, paymentMethodText } from "../../lib/format";
import { splitTerms } from "../../lib/terms";
import type { PrintDocumentData } from "../../lib/print";
import type {
  BillingNoteInvoice,
  DocumentType,
  DocumentLineItem,
  ReceiptInvoice,
} from "../../types";
import { PAYMENT_METHOD_LABELS, ASSET_SCALE_MULT } from "../../constants";
import { PrintHeader } from "./PrintHeader";
import { PrintLineItemsTable } from "./PrintLineItemsTable";
import { PrintTotals } from "./PrintTotals";
import { PrintContinuationHeader } from "./PrintContinuationHeader";
import type { PageMode } from "../../lib/pagination";

const SHOW_BANK_TYPES = new Set(["invoice", "tax_invoice_receipt", "billing_note", "receipt"]);
const SHOW_PAYMENT_METHOD_TYPES = new Set(["invoice", "tax_invoice_receipt", "receipt"]);

export type CopyType = "original" | "copy";

const DOC_ACCENT_COLORS: Record<DocumentType, string> = {
  quotation: "#7E57C2",
  invoice: "#378ADD",
  tax_invoice_receipt: "#1F9D73",
  billing_note: "#D97706",
  receipt: "#2F855A",
  delivery_note: "#0F9AA8",
  credit_note: "#DC2626",
  debit_note: "#B45309",
};

const COPY_LABELS: Record<CopyType, string> = {
  original: "ต้นฉบับ",
  copy: "สำเนา",
};

function formatDate(date: string | null | undefined) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const d = parsed.getDate().toString().padStart(2, "0");
  const m = (parsed.getMonth() + 1).toString().padStart(2, "0");
  const y = parsed.getFullYear();
  return `${d}/${m}/${y}`;
}

export function PrintDocument({
  data,
  copyType = "original",
  pageMode = "single",
  pageIndex = 1,
  totalPages = 1,
  batchLineItems,
  batchBillingNoteInvoices,
  batchReceiptInvoices,
  summaryStartIndex = 1,
  blankForm = false,
}: {
  data: PrintDocumentData;
  copyType?: CopyType;
  pageMode?: PageMode;
  pageIndex?: number;
  totalPages?: number;
  batchLineItems?: DocumentLineItem[];
  batchBillingNoteInvoices?: BillingNoteInvoice[];
  batchReceiptInvoices?: ReceiptInvoice[];
  summaryStartIndex?: number;
  blankForm?: boolean;
}) {
  const showBank = SHOW_BANK_TYPES.has(data.document.doc_type) &&
    (data.document.doc_type !== "receipt" || !!data.bankAccount);
  const showPaymentMethod = SHOW_PAYMENT_METHOD_TYPES.has(data.document.doc_type);
  const bankAccount = data.bankAccount;
  const bankName = bankAccount?.bank_name ?? data.clientProfile.bank_name;
  const bankAccountNumber = bankAccount?.account_number ?? data.clientProfile.bank_account;
  const bankAccountHolder = bankAccount?.account_holder_name;
  const showFooter = pageMode === "single" || pageMode === "last";
  const showContinuationHeader = pageMode === "continuation" || pageMode === "last";
  const isFirst = pageMode === "first" || pageMode === "single";
  const hasPayment = (showPaymentMethod && data.document.payment_method) || data.document.wht_certificate_no || data.document.amount_received != null;
  const signatureUrl = data.clientProfile.signature_url;
  const stampUrl = data.clientProfile.stamp_url;
  const signatureScaleMult = ASSET_SCALE_MULT[data.clientProfile.signature_scale ?? "medium"] ?? 1;
  const stampScaleMult = ASSET_SCALE_MULT[data.clientProfile.stamp_scale ?? "medium"] ?? 1;
  const accentColor = DOC_ACCENT_COLORS[data.document.doc_type];
  const isCopy = copyType === "copy";
  const isDeliveryNote = data.document.doc_type === "delivery_note";
  const documentClass = isDeliveryNote ? " print-delivery-note" : "";
  const terms = isDeliveryNote
    ? []
    : splitTerms(data.clientProfile.classic_terms);
  const lineItems = batchLineItems ?? data.lineItems;
  const billingNoteInvoices = batchBillingNoteInvoices ?? data.billingNoteInvoices;
  const receiptInvoices = batchReceiptInvoices ?? data.receiptInvoices;
  const startIndex = batchLineItems ? (pageMode === "single" ? 1 : data.lineItems.indexOf(batchLineItems[0]) + 1) : 1;
  const continuedLine = lineItems.length > 0 && pageMode !== "single" && pageMode !== "last"
    ? "รายการต่อไป… (CONTINUED)"
    : null;

  return (
    <article
      className={isCopy ? `print-sheet print-theme-modern print-copy${documentClass}` : `print-sheet print-theme-modern${documentClass}`}
      style={{ "--doc-accent": accentColor } as React.CSSProperties}
      data-accent-element="true"
    >
      <div className="print-theme-modern-accent" aria-hidden="true" />
      {showContinuationHeader && (
        <PrintContinuationHeader data={data} pageIndex={pageIndex} totalPages={totalPages} />
      )}
      {isFirst && <PrintHeader data={data} copyType={copyType} />}
      <PrintLineItemsTable
        data={data}
        lineItems={lineItems}
        billingNoteInvoices={billingNoteInvoices}
        receiptInvoices={receiptInvoices}
        startIndex={batchLineItems ? startIndex : summaryStartIndex}
        pageMode={pageMode}
        blankForm={blankForm}
      />
      {continuedLine && (
        <div className="mt-1.5 text-center text-[8.5px] text-[#94a3b8] tracking-[0.08em] border-b-[0.5px] border-[#E6EBF2] pb-1">
          {continuedLine}
        </div>
      )}
      {data.invoiceDeliveryNotes.length > 0 && !data.showInlineDeliveryNotes && !data.isDeliveryNoteSummaryInvoice && showFooter && (
        <section className="print-block mt-3">
          <div className="mb-0.5">
            <span className="text-[9px] tracking-[0.12em] text-[#667085]">อ้างอิงใบส่งของ</span>
            <span className="text-[6.5px] text-[#94a3b8] ml-2">DELIVERY NOTES</span>
          </div>
          <table className="print-table w-full border-separate border-spacing-0">
            <thead className="bg-[#F4F7FB] text-[#344054]">
              <tr>
                <th className="px-2 py-1.5 text-left text-[9px] font-semibold tracking-[0.06em]">เลขที่ใบส่งของ<div className="text-[6.5px] font-normal text-[#94a3b8]">DELIVERY NO.</div></th>
                <th className="px-2 py-1.5 text-left text-[9px] font-semibold tracking-[0.06em]">วันที่ส่งของ<div className="text-[6.5px] font-normal text-[#94a3b8]">DELIVERY DATE</div></th>
              </tr>
            </thead>
            <tbody>
              {data.invoiceDeliveryNotes.map((deliveryNote) => (
                <tr key={deliveryNote.id} className="break-inside-avoid align-top bg-white">
                  <td className="border-t-[0.5px] border-[#E6EBF2] px-2 py-1.5 text-[10px] text-[#111827]">
                    {deliveryNote.delivery_note_number}
                  </td>
                  <td className="border-t-[0.5px] border-[#E6EBF2] px-2 py-1.5 text-[10px] text-[#475467]">
                    {formatDate(deliveryNote.issue_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {showFooter && <PrintTotals data={data} blankForm={blankForm} />}

      {isDeliveryNote && showFooter && (
        <footer className="print-block mt-3 grid grid-cols-3 gap-3 text-[10px] text-[#475467]">
          <div className="border-t-[0.5px] border-[#D3DAE6] pt-2">
            <div className="mt-5 border-b-[0.5px] border-[#98A2B3] pb-3" />
            <div className="mt-1 text-center">ผู้ส่งสินค้า</div>
            <div className="text-center text-[6.5px] text-[#94a3b8]">DELIVERED BY</div>
            <div className="mt-1 flex items-center justify-center gap-1 text-[9px] text-[#667085]">
              วันที่
              <span className="inline-block h-3 w-12 border-b-[0.5px] border-[#98A2B3]" />
            </div>
          </div>
          <div className="border-t-[0.5px] border-[#D3DAE6] pt-2">
            <div className="mt-5 border-b-[0.5px] border-[#98A2B3] pb-3" />
            <div className="mt-1 text-center">ผู้รับสินค้า</div>
            <div className="text-center text-[6.5px] text-[#94a3b8]">RECEIVED BY</div>
            <div className="mt-1 flex items-center justify-center gap-1 text-[9px] text-[#667085]">
              วันที่
              <span className="inline-block h-3 w-12 border-b-[0.5px] border-[#98A2B3]" />
            </div>
          </div>
          <div className="border-t-[0.5px] border-[#D3DAE6] pt-2">
              <div className="relative mt-5 border-b-[0.5px] border-[#98A2B3] pb-3">
                {signatureUrl && (
                  <img
                    src={signatureUrl}
                    alt="ลายเซ็น"
                    className="absolute left-1/2 bottom-0 -translate-x-1/2 object-contain"
                    style={{ height: `${Math.round(40 * signatureScaleMult)}px` }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                {stampUrl && (
                  <img
                    src={stampUrl}
                    alt="ตราประทับ"
                    className="pointer-events-none absolute left-[65%] top-[65%] w-auto -translate-x-1/2 -translate-y-1/2 object-contain opacity-70"
                    style={{ height: `${Math.round(53 * stampScaleMult)}px` }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </div>
            <div className="mt-1 text-center">ผู้มีอำนาจลงนาม</div>
            <div className="text-center text-[6.5px] text-[#94a3b8]">AUTHORIZED BY</div>
            <div className="mt-1 flex items-center justify-center gap-1 text-[9px] text-[#667085]">
              วันที่
              <span className="inline-block h-3 w-12 border-b-[0.5px] border-[#98A2B3]" />
            </div>
          </div>
        </footer>
      )}

      {terms.length > 0 && showFooter && (
        <section className="print-block mt-3 rounded-md border border-[#E6EBF2] bg-[#F8FAFC] p-3">
          <div>
            <div className="text-[10px] font-semibold text-[#111827]">เงื่อนไข</div>
            <div className="text-[6.5px] text-[#94a3b8]">TERMS &amp; CONDITIONS</div>
          </div>
          <ol className="mt-1 ml-5 list-decimal space-y-0.5 text-[9px] leading-[14px] text-[#475467]">
            {terms.map((term, i) => (
              <li key={i}>{term}</li>
            ))}
          </ol>
        </section>
      )}

      {showFooter && (
        <footer className={isDeliveryNote ? "hidden" : "print-block mt-3 grid grid-cols-2 gap-3"}>
          <div className="border-t-[0.5px] border-[#D3DAE6] pt-2">
            <div>
              <div className="text-[9px] tracking-[0.12em] text-[#667085]">
                รายละเอียดการชำระเงิน
              </div>
              <div className="text-[6.5px] text-[#94a3b8]">PAYMENT</div>
            </div>
            <div className="mt-1 space-y-0.5 text-[9.5px] text-[#475467]">
              <>
                {showBank && bankName ? <div>ธนาคาร: {bankName}</div> : null}
                {showBank && bankAccountNumber ? <div>เลขที่บัญชี: {bankAccountNumber}</div> : null}
                {showBank && bankAccountHolder ? <div>ชื่อบัญชี: {bankAccountHolder}</div> : null}
                {hasPayment ? <div className="border-t-[0.5px] border-[#E8ECF2] my-0.5" /> : null}
                {showPaymentMethod && data.document.payment_method ? (
                  <div>
                    วิธีชำระเงิน:{" "}
                    {paymentMethodText(
                      PAYMENT_METHOD_LABELS[data.document.payment_method] || data.document.payment_method,
                      data.document,
                    )}
                  </div>
                ) : null}
                {data.document.wht_certificate_no ? <div>เลขที่หนังสือรับรองหัก ณ ที่จ่าย: {data.document.wht_certificate_no}</div> : null}
                {(data.document.doc_type === "receipt" || data.document.doc_type === "tax_invoice_receipt") && data.document.amount_received != null ? <div>จำนวนเงินที่รับ: {formatCurrency(data.document.amount_received)}</div> : null}
              </>
            </div>
          </div>

          <div className="border-t-[0.5px] border-[#D3DAE6] pt-2">
            <div>
              <div className="text-[9px] tracking-[0.12em] text-[#667085]">ลายเซ็น</div>
              <div className="text-[6.5px] text-[#94a3b8]">SIGNATURE</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-[10px] text-[#475467]">
              <div>
                <div className="border-b-[0.5px] border-[#98A2B3] pb-3" />
                <div className="mt-0.5 text-center">ผู้รับเงิน</div>
                <div className="text-center text-[6.5px] text-[#94a3b8]">PAYEE</div>
              </div>
              <div>
                <div className="relative border-b-[0.5px] border-[#98A2B3] pb-3">
                  {signatureUrl && (
                    <img
                      src={signatureUrl}
                      alt="ลายเซ็น"
                      className="absolute left-1/2 bottom-0 -translate-x-1/2 object-contain"
                    style={{ height: `${Math.round(40 * signatureScaleMult)}px` }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  {stampUrl && (
                    <img
                      src={stampUrl}
                      alt="ตราประทับ"
                      className="pointer-events-none absolute left-[65%] top-[65%] w-auto -translate-x-1/2 -translate-y-1/2 object-contain opacity-70"
                    style={{ height: `${Math.round(53 * stampScaleMult)}px` }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </div>
                <div className="mt-0.5 text-center">ผู้มีอำนาจลงนาม</div>
                <div className="text-center text-[6.5px] text-[#94a3b8]">AUTHORIZED SIGNATURE</div>
              </div>
            </div>
          </div>
        </footer>
      )}

      {isCopy && (
        <div className="print-copy-watermark">ฉบับสำเนา</div>
      )}
    </article>
  );
}
