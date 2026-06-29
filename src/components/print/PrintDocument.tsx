import { formatCurrency } from "../../lib/format";
import { splitTerms } from "../../lib/terms";
import type { PrintDocumentData } from "../../lib/print";
import type { DocumentType } from "../../types";
import { PAYMENT_METHOD_LABELS } from "../../constants";
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

function formatDate(date: string | null | undefined) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const d = parsed.getDate().toString().padStart(2, "0");
  const m = (parsed.getMonth() + 1).toString().padStart(2, "0");
  const y = parsed.getFullYear();
  return `${d}/${m}/${y}`;
}

export function PrintDocument({ data, copyType = "original" }: { data: PrintDocumentData; copyType?: CopyType }) {
  const showBank = SHOW_BANK_TYPES.has(data.document.doc_type);
  const showPaymentMethod = SHOW_PAYMENT_METHOD_TYPES.has(data.document.doc_type);
  const hasPayment = (showPaymentMethod && data.document.payment_method) || data.document.wht_certificate_no || data.document.amount_received != null;
  const signatureUrl = data.clientProfile.signature_url;
  const stampUrl = data.clientProfile.stamp_url;
  const accentColor = DOC_ACCENT_COLORS[data.document.doc_type];
  const isCopy = copyType === "copy";
  const isDeliveryNote = data.document.doc_type === "delivery_note";
  const documentClass = isDeliveryNote ? " print-delivery-note" : "";
  const terms = isDeliveryNote
    ? []
    : splitTerms(data.clientProfile.classic_terms, data.clientProfile.company_name_th);

  return (
    <article
      className={isCopy ? `print-sheet print-theme-modern print-copy${documentClass}` : `print-sheet print-theme-modern${documentClass}`}
      style={{ "--doc-accent": accentColor } as React.CSSProperties}
    >
      <PrintHeader data={data} copyType={copyType} />
      <PrintLineItemsTable data={data} />
      {data.invoiceDeliveryNotes.length > 0 && (
        <section className="print-block mt-4">
          <div className="mb-1">
            <span className="text-[10px] tracking-[0.12em] text-[#667085]">อ้างอิงใบส่งของ</span>
            <span className="text-[7px] text-[#94a3b8] ml-2">DELIVERY NOTES</span>
          </div>
          <table className="print-table w-full border-separate border-spacing-0">
            <thead className="bg-[#F4F7FB] text-[#344054]">
              <tr>
                <th className="px-2 py-2 text-left text-[10px] font-semibold tracking-[0.06em]">เลขที่ใบส่งของ<div className="text-[7px] font-normal text-[#94a3b8]">DELIVERY NO.</div></th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold tracking-[0.06em]">วันที่ส่งของ<div className="text-[7px] font-normal text-[#94a3b8]">DELIVERY DATE</div></th>
              </tr>
            </thead>
            <tbody>
              {data.invoiceDeliveryNotes.map((deliveryNote) => (
                <tr key={deliveryNote.id} className="break-inside-avoid align-top bg-white">
                  <td className="border-t-[0.5px] border-[#E6EBF2] px-2 py-2 text-[11px] text-[#111827]">
                    {deliveryNote.delivery_note_number}
                  </td>
                  <td className="border-t-[0.5px] border-[#E6EBF2] px-2 py-2 text-[11px] text-[#475467]">
                    {formatDate(deliveryNote.issue_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <PrintTotals data={data} />

      {isDeliveryNote && (
        <footer className="print-block mt-4 grid grid-cols-3 gap-4 text-[11px] text-[#475467]">
          <div className="border-t-[0.5px] border-[#D3DAE6] pt-4">
            <div className="mt-10 border-b-[0.5px] border-[#98A2B3] pb-6" />
            <div className="mt-1 text-center">ผู้ส่งสินค้า</div>
            <div className="text-center text-[7px] text-[#94a3b8]">DELIVERED BY</div>
            <div className="mt-1 text-center text-[10px] text-[#667085]">วันที่ / DATE</div>
          </div>
          <div className="border-t-[0.5px] border-[#D3DAE6] pt-4">
            <div className="mt-10 border-b-[0.5px] border-[#98A2B3] pb-6" />
            <div className="mt-1 text-center">ผู้รับสินค้า</div>
            <div className="text-center text-[7px] text-[#94a3b8]">RECEIVED BY</div>
            <div className="mt-1 text-center text-[10px] text-[#667085]">วันที่ / DATE</div>
          </div>
          <div className="border-t-[0.5px] border-[#D3DAE6] pt-4">
            <div className="relative mt-10 border-b-[0.5px] border-[#98A2B3] pb-6">
              {signatureUrl && (
                <img
                  src={signatureUrl}
                  alt="ลายเซ็น"
                  className="absolute left-1/2 bottom-0 h-[56px] -translate-x-1/2 object-contain"
                />
              )}
            </div>
            <div className="mt-1 text-center">ผู้มีอำนาจลงนาม</div>
            <div className="text-center text-[7px] text-[#94a3b8]">AUTHORIZED BY</div>
            <div className="mt-1 text-center text-[10px] text-[#667085]">วันที่ / DATE</div>
          </div>
        </footer>
      )}

      <footer className={isDeliveryNote ? "hidden" : "print-block mt-4 grid grid-cols-2 gap-4"}>
        <div className="border-t-[0.5px] border-[#D3DAE6] pt-4">
          <div>
            <div className="text-[10px] tracking-[0.12em] text-[#667085]">
              {isDeliveryNote ? "ผู้รับสินค้า" : "ข้อมูลการชำระเงิน"}
            </div>
            <div className="text-[7px] text-[#94a3b8]">PAYMENT INFORMATION</div>
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-[#475467]">
            {isDeliveryNote ? (
              <>
                <div className="mt-10 border-b-[0.5px] border-[#98A2B3] pb-6" />
                <div className="text-center">ลงชื่อผู้รับสินค้า / วันที่</div>
              </>
            ) : (
              <>
                {showBank && data.clientProfile.bank_name ? <div>ธนาคาร: {data.clientProfile.bank_name}</div> : null}
                {showBank && data.clientProfile.bank_account ? <div>เลขที่บัญชี: {data.clientProfile.bank_account}</div> : null}
                {hasPayment ? <div className="border-t-[0.5px] border-[#E8ECF2] my-1" /> : null}
                {showPaymentMethod && data.document.payment_method ? <div>วิธีชำระเงิน: {PAYMENT_METHOD_LABELS[data.document.payment_method] || data.document.payment_method}</div> : null}
                {data.document.wht_certificate_no ? <div>เลขที่หนังสือรับรองหัก ณ ที่จ่าย: {data.document.wht_certificate_no}</div> : null}
                {data.document.amount_received != null ? <div>จำนวนเงินที่รับ: {formatCurrency(data.document.amount_received)}</div> : null}
              </>
            )}
          </div>
          {!isDeliveryNote && stampUrl && (
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
          <div>
            <div className="text-[10px] tracking-[0.12em] text-[#667085]">ลายเซ็น</div>
            <div className="text-[7px] text-[#94a3b8]">SIGNATURE</div>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 text-[11px] text-[#475467]">
            <div>
              <div className="border-b-[0.5px] border-[#98A2B3] pb-6" />
              <div className="mt-1 text-center">{isDeliveryNote ? "ผู้ส่งสินค้า" : "ผู้รับเงิน"}</div>
              <div className="text-center text-[7px] text-[#94a3b8]">PAYEE</div>
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
              <div className="mt-1 text-center">{isDeliveryNote ? "ผู้ตรวจสอบ / ผู้มีอำนาจลงนาม" : "ผู้มีอำนาจลงนาม"}</div>
              <div className="text-center text-[7px] text-[#94a3b8]">AUTHORIZED SIGNATURE</div>
            </div>
          </div>
        </div>
      </footer>

      {terms.length > 0 && (
        <section className="print-block mt-4 rounded-lg border border-[#E6EBF2] bg-[#F8FAFC] p-4">
          <div>
            <div className="text-[11px] font-semibold text-[#111827]">เงื่อนไข</div>
            <div className="text-[7px] text-[#94a3b8]">TERMS &amp; CONDITIONS</div>
          </div>
          <ol className="mt-2 ml-5 list-decimal space-y-0.5 text-[10px] leading-[16px] text-[#475467]">
            {terms.map((term, i) => (
              <li key={i}>{term}</li>
            ))}
          </ol>
        </section>
      )}

      {isCopy && (
        <div className="print-copy-watermark">{COPY_LABELS[copyType]}</div>
      )}
    </article>
  );
}
