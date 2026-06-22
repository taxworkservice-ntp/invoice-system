import { formatCurrency } from "../../lib/format";
import type { PrintDocumentData } from "../../lib/print";
import type { DocumentType } from "../../types";
import { PrintHeader } from "./PrintHeader";
import { PrintLineItemsTable } from "./PrintLineItemsTable";
import { PrintTotals } from "./PrintTotals";

const SHOW_BANK_TYPES = new Set(["invoice", "tax_invoice_receipt", "billing_note"]);
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
};

const COPY_LABELS: Record<CopyType, string> = {
  original: "ต้นฉบับ",
  copy: "สำเนา",
};

export function PrintDocument({ data, copyType = "original" }: { data: PrintDocumentData; copyType?: CopyType }) {
  const showBank = SHOW_BANK_TYPES.has(data.document.doc_type);
  const showPaymentMethod = SHOW_PAYMENT_METHOD_TYPES.has(data.document.doc_type);
  const hasPayment = (showPaymentMethod && data.document.payment_method) || data.document.wht_certificate_no || data.document.amount_received != null;
  const signatureUrl = data.clientProfile.signature_url;
  const stampUrl = data.clientProfile.stamp_url;
  const accentColor = DOC_ACCENT_COLORS[data.document.doc_type];
  const isCopy = copyType === "copy";

  return (
    <article
      className={isCopy ? "print-sheet print-theme-modern print-copy" : "print-sheet print-theme-modern"}
      style={{ "--doc-accent": accentColor } as React.CSSProperties}
    >
      <PrintHeader data={data} copyType={copyType} />
      <PrintLineItemsTable data={data} />
      <PrintTotals data={data} />

      <footer className="print-block mt-4 grid grid-cols-2 gap-4">
        <div className="border-t-[0.5px] border-[#D3DAE6] pt-4">
          <div className="text-[10px] tracking-[0.12em] text-[#667085]">ข้อมูลการชำระเงิน</div>
          <div className="mt-2 space-y-1 text-[11px] text-[#475467]">
            {showBank && data.clientProfile.bank_name ? <div>ธนาคาร: {data.clientProfile.bank_name}</div> : null}
            {showBank && data.clientProfile.bank_account ? <div>เลขที่บัญชี: {data.clientProfile.bank_account}</div> : null}
            {hasPayment ? <div className="border-t-[0.5px] border-[#E8ECF2] my-1" /> : null}
            {showPaymentMethod && data.document.payment_method ? <div>วิธีชำระเงิน: {data.document.payment_method}</div> : null}
            {data.document.wht_certificate_no ? <div>เลขที่หนังสือรับรองหัก ณ ที่จ่าย: {data.document.wht_certificate_no}</div> : null}
            {data.document.amount_received != null ? <div>จำนวนเงินที่รับ: {formatCurrency(data.document.amount_received)}</div> : null}
          </div>
          {stampUrl && (
            <div className="mt-3">
              <img
                src={stampUrl}
                alt="ตราประทับ"
                className="h-[60px] w-auto object-contain opacity-90"
              />
            </div>
          )}
        </div>

        <div className="border-t-[0.5px] border-[#D3DAE6] pt-4">
          <div className="text-[10px] tracking-[0.12em] text-[#667085]">ลายเซ็น</div>
          <div className="mt-10 grid grid-cols-2 gap-4 text-[11px] text-[#475467]">
            <div>
              <div className="border-b-[0.5px] border-[#98A2B3] pb-6" />
              <div className="mt-1 text-center">ผู้รับเงิน</div>
            </div>
            <div>
              <div className="relative border-b-[0.5px] border-[#98A2B3] pb-6">
                {signatureUrl && (
                  <img
                    src={signatureUrl}
                    alt="ลายเซ็น"
                    className="absolute left-1/2 bottom-0 h-[56px] -translate-x-1/2 object-contain"
                  />
                )}
              </div>
              <div className="mt-1 text-center">ผู้มีอำนาจลงนาม</div>
            </div>
          </div>
        </div>
      </footer>

      {isCopy && (
        <div className="print-copy-watermark">{COPY_LABELS[copyType]}</div>
      )}
    </article>
  );
}