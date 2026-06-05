import { formatCurrency } from "../../lib/format";
import type { PrintDocumentData } from "../../lib/print";
import { PrintHeader } from "./PrintHeader";
import { PrintLineItemsTable } from "./PrintLineItemsTable";
import { PrintTotals } from "./PrintTotals";

export function PrintDocument({ data }: { data: PrintDocumentData }) {
  return (
    <article className="print-sheet print-theme-modern">
      <PrintHeader data={data} />
      <PrintLineItemsTable data={data} />
      <PrintTotals data={data} />

      <footer className="print-block mt-4 grid grid-cols-2 gap-4">
        <div className="border-t border-[#D3DAE6] pt-4">
          <div className="text-[10px] tracking-[0.12em] text-[#667085]">ข้อมูลการชำระเงิน</div>
          <div className="mt-2 space-y-1 text-[11px] text-[#475467]">
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
              <div className="border-b border-[#98A2B3] pb-6" />
              <div className="mt-1 text-center">ผู้มีอำนาจลงนาม</div>
            </div>
          </div>
        </div>
      </footer>
    </article>
  );
}
