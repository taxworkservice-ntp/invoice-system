import { formatCurrency } from "../../lib/format";
import type { PrintDocumentData } from "../../lib/print";

export function PrintTotals({ data }: { data: PrintDocumentData }) {
  const { document, referenceDoc, grossSubtotal, lineDiscountTotal, receiptOutstanding, receiptCumulativePaid } = data;
  const isDeliveryNote = document.doc_type === "delivery_note";
  const isReceipt = document.doc_type === "receipt";
  const receiptCash = document.amount_received ?? document.net_payable;
  const receiptTaxable = isReceipt && document.vat_registered && document.vat_rate > 0 && document.subtotal > 0;
  const receiptPreTax = isReceipt ? document.subtotal : 0;
  const receiptVatAmount = isReceipt ? document.vat_amount : 0;
  const receiptAmount = isReceipt ? document.total_amount : receiptCash;
  const receiptWhtTotal = isReceipt ? document.wht_amount || 0 : 0;
  const receiptReferenceAmount = referenceDoc?.total_amount ?? document.total_amount;
  const receiptPaidInFull = isReceipt && receiptOutstanding !== undefined && receiptOutstanding <= 0.01;
  const hideDeliveryAmounts = isDeliveryNote && document.hide_amounts_on_print !== false;

  if (hideDeliveryAmounts) {
    return (
      <section className="print-block mt-3">
        <div>
          <div className="text-[9px] tracking-[0.12em] text-[#667085]">หมายเหตุการส่งของ</div>
          <div className="text-[6.5px] text-[#94a3b8]">DELIVERY REMARKS</div>
        </div>
        <div className="mt-1 min-h-[10mm] whitespace-pre-line text-[9.5px] leading-[14px] text-[#475467]">
          {document.note?.trim() || "-"}
        </div>
      </section>
    );
  }

  return (
    <section className="print-block print-totals mt-3 grid grid-cols-[1fr_60mm] gap-3">
      <div className="bg-transparent p-0">
        <div>
          <div className="text-[9px] tracking-[0.12em] text-[#667085]">หมายเหตุ</div>
          <div className="text-[6.5px] text-[#94a3b8]">NOTE</div>
        </div>
        <div className="mt-1 min-h-[10mm] whitespace-pre-line text-[9.5px] leading-[14px] text-[#475467]">
          {document.note?.trim() || "-"}
        </div>
      </div>

      <div className="border-t-[0.5px] border-[#C9D5E3] pt-2">
        <div className="space-y-1 text-[10px] text-[#344054]">
          {lineDiscountTotal > 0 ? (
            <>
              <div className="flex justify-between gap-4">
                <div className="flex flex-col">
                  <span>ยอดก่อนส่วนลด</span>
                  <span className="text-[6.5px] text-[#94a3b8]">GROSS SUBTOTAL</span>
                </div>
                <span className="self-center">{formatCurrency(grossSubtotal)}</span>
              </div>
              <div className="flex justify-between gap-4 text-[#B54708]">
                <div className="flex flex-col">
                  <span>ส่วนลดรายรายการ</span>
                  <span className="text-[6.5px] text-[#94a3b8]">LINE DISCOUNT</span>
                </div>
                <span className="self-center">-{formatCurrency(lineDiscountTotal)}</span>
              </div>
            </>
          ) : null}

          {document.discount_amount > 0 ? (
            <div className="flex justify-between gap-4 text-[#B54708]">
              <div className="flex flex-col">
                <span>ส่วนลดท้ายบิล {document.discount_percent ? `(${document.discount_percent}%)` : ""}</span>
                <span className="text-[6.5px] text-[#94a3b8]">DISCOUNT</span>
              </div>
              <span className="self-center">-{formatCurrency(document.discount_amount)}</span>
            </div>
          ) : null}

          {isDeliveryNote ? (
            <>
              <div className="flex justify-between gap-4">
                <div className="flex flex-col">
                  <span>มูลค่าอ้างอิง</span>
                  <span className="text-[6.5px] text-[#94a3b8]">REFERENCE VALUE</span>
                </div>
                  <span className="self-center">{formatCurrency(document.total_amount)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t-[0.5px] border-[#C9D5E3] pt-2 font-semibold text-[12px] text-[#111827]">
                <div className="flex flex-col">
                  <span>รวมทั้งสิ้น</span>
                  <span className="text-[6.5px] font-normal text-[#94a3b8]">GRAND TOTAL</span>
                </div>
                <span className="self-center">{formatCurrency(document.total_amount)}</span>
              </div>
            </>
          ) : isReceipt ? (
            <>
              {receiptTaxable ? (
                <>
                  <div className="flex justify-between gap-4">
                    <div className="flex flex-col">
                      <span>ยอดก่อนภาษี</span>
                      <span className="text-[6.5px] text-[#94a3b8]">AMOUNT BEFORE TAX</span>
                    </div>
                    <span className="self-center">{formatCurrency(receiptPreTax)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <div className="flex flex-col">
                      <span>ภาษีมูลค่าเพิ่ม {document.vat_rate}%</span>
                      <span className="text-[6.5px] text-[#94a3b8]">VAT {document.vat_rate}%</span>
                    </div>
                    <span className="self-center">{formatCurrency(receiptVatAmount)}</span>
                  </div>
                </>
              ) : null}

              <div className="flex justify-between gap-4 border-t-[0.5px] border-[#C9D5E3] pt-2 font-semibold text-[12px] text-[#111827]">
                <div className="flex flex-col">
                  <span>รับชำระครั้งนี้</span>
                  <span className="text-[6.5px] font-normal text-[#94a3b8]">AMOUNT RECEIVED</span>
                </div>
                <span className="self-center">{formatCurrency(receiptAmount)}</span>
              </div>

              {document.wht_amount > 0 ? (
                <div className="flex justify-between gap-4 text-[#B54708]">
                  <div className="flex flex-col">
                    <span>หัก ณ ที่จ่าย {document.wht_rate}%</span>
                    <span className="text-[6.5px] text-[#94a3b8]">WHT {document.wht_rate}%</span>
                  </div>
                  <span className="self-center">-{formatCurrency(document.wht_amount)}</span>
                </div>
              ) : null}

              <div className="flex justify-between gap-4 border-t-[0.5px] border-[#111827] pt-2 text-[12px] font-semibold text-[#111827]">
                <div className="flex flex-col">
                  <span>ยอดรับสุทธิ</span>
                  <span className="text-[6.5px] font-normal text-[#94a3b8]">NET RECEIVED</span>
                </div>
                <span className="self-center">{formatCurrency(receiptAmount - receiptWhtTotal)}</span>
              </div>

              {receiptPaidInFull ? (
                <div className="mt-2 rounded border border-[#B7E3CB] bg-[#F0FBF4] px-2 py-1.5 text-center font-semibold text-[#176B3A]">
                  <div>ชำระครบถ้วน</div>
                  <div className="text-[6.5px] font-medium tracking-[0.08em] text-[#5B9B75]">PAID IN FULL</div>
                </div>
              ) : null}

              <div className="flex justify-between gap-4 border-t-[0.5px] border-[#C9D5E3] pt-2">
                <div className="flex flex-col">
                  <span>ยอดตามเอกสารอ้างอิง</span>
                  <span className="text-[6.5px] text-[#94a3b8]">REFERENCE AMOUNT</span>
                </div>
                <span className="self-center">{formatCurrency(receiptReferenceAmount)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <div className="flex flex-col">
                  <span>ยอดชำระสะสมก่อนหัก WHT</span>
                  <span className="text-[6.5px] text-[#94a3b8]">TOTAL SETTLED (GROSS)</span>
                </div>
                <span className="self-center">{formatCurrency(receiptCumulativePaid ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-4 text-[10px] text-[#344054]">
                <div className="flex flex-col">
                  <span>ยอดคงเหลือค้างชำระ</span>
                  <span className="text-[6.5px] text-[#94a3b8]">BALANCE DUE</span>
                </div>
                <span className="self-center">{formatCurrency(receiptOutstanding ?? 0)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between gap-4">
                <div className="flex flex-col">
                  <span>รวมก่อนภาษี</span>
                  <span className="text-[6.5px] text-[#94a3b8]">SUBTOTAL</span>
                </div>
                <span className="self-center">{formatCurrency(document.subtotal)}</span>
              </div>

              {document.vat_registered ? (
                <div className="flex justify-between gap-4">
                  <div className="flex flex-col">
                    <span>ภาษีมูลค่าเพิ่ม {document.vat_rate}%</span>
                    <span className="text-[6.5px] text-[#94a3b8]">VAT {document.vat_rate}%</span>
                  </div>
                  <span className="self-center">{formatCurrency(document.vat_amount)}</span>
                </div>
              ) : null}

              <div className="flex justify-between gap-4 border-t-[0.5px] border-[#C9D5E3] pt-2 font-semibold text-[12px] text-[#111827]">
                <div className="flex flex-col">
                  <span>รวมทั้งสิ้น</span>
                  <span className="text-[6.5px] font-normal text-[#94a3b8]">GRAND TOTAL</span>
                </div>
                <span className="self-center">{formatCurrency(document.total_amount)}</span>
              </div>

              {document.wht_amount > 0 ? (
                <div className="flex justify-between gap-4 text-[#B54708]">
                  <div className="flex flex-col">
                    <span>หัก ณ ที่จ่าย {document.wht_rate}%</span>
                    <span className="text-[6.5px] text-[#94a3b8]">WHT {document.wht_rate}%</span>
                  </div>
                  <span className="self-center">-{formatCurrency(document.wht_amount)}</span>
                </div>
              ) : null}

              <div className="flex justify-between gap-4 border-t-[0.5px] border-[#111827] pt-2 text-[13px] font-semibold text-[#111827]">
                <div className="flex flex-col">
                  <span>ยอดชำระสุทธิ</span>
                  <span className="text-[6.5px] font-normal text-[#94a3b8]">NET PAYABLE</span>
                </div>
                <span className="self-center">{formatCurrency(document.wht_amount > 0 ? document.net_payable : document.total_amount)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
