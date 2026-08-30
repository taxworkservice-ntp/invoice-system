import { formatCurrency } from "../../lib/format";
import type { PrintDocumentData } from "../../lib/print";

export function PrintTotals({ data, blankForm = false }: { data: PrintDocumentData; blankForm?: boolean }) {
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
  const showFullTotals = isDeliveryNote && document.show_full_totals === true;
  const hasNote = Boolean(document.note?.trim());
  const isCreditNote = document.doc_type === "credit_note";
  const isDebitNote = document.doc_type === "debit_note";
  const adjustmentLabels =
    isCreditNote || isDebitNote
      ? {
          subtotal: isCreditNote ? "ยอดลดก่อนภาษี" : "ยอดเพิ่มก่อนภาษี",
          subtotalEn: "ADJUSTMENT SUBTOTAL",
          vat: isCreditNote ? "ภาษีที่ลด" : "ภาษีที่เพิ่ม",
          vatEn: "VAT ADJUSTMENT",
          total: isCreditNote ? "ยอดลดรวม" : "ยอดเพิ่มรวม",
          totalEn: "TOTAL ADJUSTMENT",
        }
      : null;

  if (hideDeliveryAmounts || blankForm) {
    return (
      <section className="print-block mt-3">
        {hasNote ? (
          <>
            <div>
              <div className="text-[9px] tracking-[0.12em] text-[#667085]">
                {isDeliveryNote ? "หมายเหตุการส่งของ" : "หมายเหตุ"}
              </div>
              <div className="text-[6.5px] text-[#94a3b8]">
                {isDeliveryNote ? "DELIVERY REMARKS" : "NOTE"}
              </div>
            </div>
            <div className="mt-1 min-h-[10mm] whitespace-pre-line text-[9.5px] leading-[14px] text-[#475467]">
              {document.note?.trim()}
            </div>
          </>
        ) : (
          <div className="min-h-[10mm]" />
        )}
      </section>
    );
  }

  return (
    <section className="print-block print-totals mt-3 grid grid-cols-[1fr_60mm] gap-3">
      <div className="bg-transparent p-0">
        {hasNote ? (
          <div>
            <div>
              <div className="text-[9px] tracking-[0.12em] text-[#667085]">หมายเหตุ</div>
              <div className="text-[6.5px] text-[#94a3b8]">NOTE</div>
            </div>
            <div className="mt-1 whitespace-pre-line text-[9.5px] leading-[14px] text-[#475467]">
              {document.note?.trim()}
            </div>
          </div>
        ) : null}
        {isReceipt ? (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div>
                <div className="text-[9px] tracking-[0.12em] text-[#667085]">สถานะการชำระเงิน</div>
                <div className="text-[6.5px] text-[#94a3b8]">SETTLEMENT</div>
              </div>
              {receiptPaidInFull ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#B7E3CB] bg-[#F0FBF4] px-2 py-0.5 text-[9px] font-semibold text-[#176B3A]">
                  <span>ชำระครบถ้วน</span>
                  <span className="text-[7px] font-medium tracking-[0.08em] text-[#5B9B75]">PAID IN FULL</span>
                </span>
              ) : null}
            </div>
            <div className="space-y-1 text-[10px] text-[#344054]">
              <div className="flex justify-between gap-4 border-t-[0.5px] border-[#C9D5E3] pt-2">
                <div className="flex flex-col">
                  <span>ยอดตามเอกสารอ้างอิง</span>
                  <span className="text-[6.5px] text-[#94a3b8]">REFERENCE AMOUNT</span>
                </div>
                <span className="self-center">{formatCurrency(receiptReferenceAmount)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <div className="flex flex-col">
                  <span>ยอดชำระสะสมก่อนหักภาษี ณ ที่จ่าย</span>
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
            </div>
          </div>
        ) : null}
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

          {isDeliveryNote && !showFullTotals ? (
            <div className="flex justify-between gap-4 border-t-[0.5px] border-[#C9D5E3] pt-2 font-semibold text-[12px] text-[#111827]">
              <div className="flex flex-col">
                <span>มูลค่ารวม</span>
                <span className="text-[6.5px] font-normal text-[#94a3b8]">TOTAL VALUE</span>
              </div>
              <span className="self-center">{formatCurrency(document.subtotal)}</span>
            </div>
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
                    <span className="text-[6.5px] text-[#94a3b8]">หัก ณ ที่จ่าย {document.wht_rate}%</span>
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
            </>
          ) : (
            <>
              <div className="flex justify-between gap-4">
                <div className="flex flex-col">
                  <span>{adjustmentLabels ? adjustmentLabels.subtotal : "รวมก่อนภาษี"}</span>
                  <span className="text-[6.5px] text-[#94a3b8]">{adjustmentLabels ? adjustmentLabels.subtotalEn : "SUBTOTAL"}</span>
                </div>
                <span className="self-center">
                   {isCreditNote ? `-${formatCurrency(document.subtotal)}` : formatCurrency(document.subtotal)}
                </span>
              </div>

              {document.vat_registered ? (
                <div className="flex justify-between gap-4">
                  <div className="flex flex-col">
                    <span>
                      {adjustmentLabels
                        ? adjustmentLabels.vat
                        : `ภาษีมูลค่าเพิ่ม ${document.vat_rate}%`}
                    </span>
                    <span className="text-[6.5px] text-[#94a3b8]">
                      {adjustmentLabels ? adjustmentLabels.vatEn : `VAT ${document.vat_rate}%`}
                    </span>
                  </div>
                  <span className="self-center">
                    {isCreditNote ? `-${formatCurrency(document.vat_amount)}` : formatCurrency(document.vat_amount)}
                  </span>
                </div>
              ) : null}

              <div className={`flex justify-between gap-4 border-t-[0.5px] border-[#C9D5E3] pt-2 font-semibold text-[12px] ${isCreditNote ? "text-[#DC2626]" : "text-[#111827]"}`}>
                <div className="flex flex-col">
                  <span>{adjustmentLabels ? adjustmentLabels.total : "รวมทั้งสิ้น"}</span>
                  <span className="text-[6.5px] font-normal text-[#94a3b8]">{adjustmentLabels ? adjustmentLabels.totalEn : "GRAND TOTAL"}</span>
                </div>
                <span className="self-center">
                  {isCreditNote ? `-${formatCurrency(document.total_amount)}` : formatCurrency(document.total_amount)}
                </span>
              </div>

              {document.wht_amount > 0 && !adjustmentLabels ? (
                <div className="flex justify-between gap-4 text-[#B54708]">
                  <div className="flex flex-col">
                    <span>หัก ณ ที่จ่าย {document.wht_rate}%</span>
                    <span className="text-[6.5px] text-[#94a3b8]">หัก ณ ที่จ่าย {document.wht_rate}%</span>
                  </div>
                  <span className="self-center">-{formatCurrency(document.wht_amount)}</span>
                </div>
              ) : null}

              <div className={`flex justify-between gap-4 border-t-[0.5px] border-[#111827] pt-2 text-[13px] font-semibold ${isCreditNote ? "text-[#DC2626]" : "text-[#111827]"}`}>
                <div className="flex flex-col">
                  <span>
                    {isCreditNote ? "ยอดเครดิตสุทธิ" : isDebitNote ? "ยอดเพิ่มสุทธิ" : "ยอดชำระสุทธิ"}
                  </span>
                  <span className="text-[6.5px] font-normal text-[#94a3b8]">
                    {isCreditNote ? "NET CREDIT" : isDebitNote ? "NET ADJUSTMENT" : "NET PAYABLE"}
                  </span>
                </div>
                <span className="self-center">
                  {isCreditNote ? "-" : ""}{formatCurrency(document.wht_amount > 0 && !adjustmentLabels ? document.net_payable : document.total_amount)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
