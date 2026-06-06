import { formatCurrency } from "../../lib/format";
import type { PrintDocumentData } from "../../lib/print";
import { PrintHeader } from "./PrintHeader";
import { PrintLineItemsTable } from "./PrintLineItemsTable";
import { PrintTotals } from "./PrintTotals";

const SHOW_BANK_TYPES = new Set(["invoice", "tax_invoice_receipt", "billing_note"]);

export function PrintDocument({ data }: { data: PrintDocumentData }) {
  const showBank = SHOW_BANK_TYPES.has(data.document.doc_type);
  const hasPayment = data.document.payment_method || data.document.wht_certificate_no || data.document.amount_received != null;
  const signatureUrl = data.clientProfile.signature_url;
  const stampUrl = data.clientProfile.stamp_url;

  return (
    <article className="print-sheet print-theme-modern">
      <PrintHeader data={data} />
      <PrintLineItemsTable data={data} />
      <PrintTotals data={data} />

      <footer className="print-block mt-4 grid grid-cols-2 gap-4">
        <div className="border-t border-[#D3DAE6] pt-4">
          <div className="text-[10px] tracking-[0.12em] text-[#667085]">ข้อมูลการชำระเงิน</div>
          <div className="mt-2 space-y-1 text-[11px] text-[#475467]">
            {showBank && data.clientProfile.bank_name ? <div>ธนาคาร: {data.clientProfile.bank_name}</div> : null}
            {showBank && data.clientProfile.bank_account ? <div>เลขที่บัญชี: {data.clientProfile.bank_account}</div> : null}
            {hasPayment ? <div className="border-t border-[#E8ECF2] my-1" /> : null}
            {data.document.payment_method ? <div>วิธีชำระเงิน: {data.document.payment_method}</div> : null}
            {data.document.wht_certificate_no ? <div>เลขที่หนังสือรับรองหัก ณ ที่จ่าย: {data.document.wht_certificate_no}</div> : null}
            {data.document.amount_received != null ? <div>จำนวนเงินที่รับ: {formatCurrency(data.document.amount_received)}</div> : null}
          </div>
        </div>

        <div className="border-t border-[#D3DAE6] pt-4">
          <div className="text-[10px] tracking-[0.12em] text-[#667085]">ลายเซ็น</div>
          <div className="mt-10 grid grid-cols-2 gap-4 text-[11px] text-[#475467]">
            <div>
              <div className="border-b border-[#98A2B3] pb-6" />
              <div className="mt-1 text-center">ผู้รับเงิน</div>
            </div>
            <div>
              <div className="relative border-b border-[#98A2B3] pb-6">
                {signatureUrl && (
                  <img
                    src={signatureUrl}
                    alt="ลายเซ็น"
                    className="absolute left-1/2 bottom-0 h-[56px] -translate-x-1/2 object-contain"
                  />
                )}
              </div>
              <div className="mt-1 text-center relative">
                ผู้มีอำนาจลงนาม
                {stampUrl && (
                  <img
                    src={stampUrl}
                    alt="ตราประทับ"
                    className="absolute right-0 top-[-48px] h-[52px] w-auto object-contain opacity-90"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </article>
  );
}