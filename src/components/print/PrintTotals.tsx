import { formatCurrency } from "../../lib/format";
import type { PrintDocumentData } from "../../lib/print";

export function PrintTotals({ data }: { data: PrintDocumentData }) {
  const { document, grossSubtotal, lineDiscountTotal } = data;
  const isDeliveryNote = document.doc_type === "delivery_note";

  if (isDeliveryNote) {
    return (
      <section className="print-block mt-4">
        <div className="text-[10px] tracking-[0.12em] text-[#667085]">หมายเหตุการส่งของ</div>
        <div className="mt-2 min-h-[24mm] whitespace-pre-line text-[11px] leading-[18px] text-[#475467]">
          {document.note?.trim() || "-"}
        </div>
      </section>
    );
  }

  return (
    <section className="print-block mt-4 grid grid-cols-[1fr_68mm] gap-4">
      <div className="bg-transparent p-0">
        <div className="text-[10px] tracking-[0.12em] text-[#667085]">หมายเหตุ</div>
        <div className="mt-2 min-h-[24mm] whitespace-pre-line text-[11px] leading-[18px] text-[#475467]">
          {document.note?.trim() || "-"}
        </div>
      </div>

      <div className="border-t-[0.5px] border-[#C9D5E3] pt-4">
        <div className="space-y-1.5 text-[11px] text-[#344054]">
          {lineDiscountTotal > 0 ? (
            <>
              <div className="flex justify-between gap-4">
                <span>ยอดก่อนส่วนลด</span>
                <span>{formatCurrency(grossSubtotal)}</span>
              </div>
              <div className="flex justify-between gap-4 text-[#B54708]">
                <span>ส่วนลดรายรายการ</span>
                <span>-{formatCurrency(lineDiscountTotal)}</span>
              </div>
            </>
          ) : null}

          {document.discount_amount > 0 ? (
            <div className="flex justify-between gap-4 text-[#B54708]">
              <span>ส่วนลดท้ายบิล {document.discount_percent ? `(${document.discount_percent}%)` : ""}</span>
              <span>-{formatCurrency(document.discount_amount)}</span>
            </div>
          ) : null}

          <div className="flex justify-between gap-4">
            <span>รวมก่อนภาษี</span>
            <span>{formatCurrency(document.subtotal)}</span>
          </div>

          {document.vat_registered ? (
            <div className="flex justify-between gap-4">
              <span>ภาษีมูลค่าเพิ่ม {document.vat_rate}%</span>
              <span>{formatCurrency(document.vat_amount)}</span>
            </div>
          ) : null}

          <div className="flex justify-between gap-4 border-t-[0.5px] border-[#C9D5E3] pt-3 font-semibold text-[#111827]">
            <span>รวมทั้งสิ้น</span>
            <span>{formatCurrency(document.total_amount)}</span>
          </div>

          {document.wht_amount > 0 ? (
            <>
              <div className="flex justify-between gap-4 text-[#B54708]">
                <span>หัก ณ ที่จ่าย {document.wht_rate}%</span>
                <span>-{formatCurrency(document.wht_amount)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t-[0.5px] border-[#111827] pt-3 text-[15px] font-semibold text-[#111827]">
                <span>ยอดชำระสุทธิ</span>
                <span>{formatCurrency(document.net_payable)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between gap-4 border-t-[0.5px] border-[#111827] pt-3 text-[15px] font-semibold text-[#111827]">
              <span>ยอดชำระสุทธิ</span>
              <span>{formatCurrency(document.total_amount)}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
