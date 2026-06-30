import { formatCurrency } from "../../lib/format";
import type { PrintDocumentData } from "../../lib/print";

const MIN_MODERN_ITEM_ROWS = 6;
const MIN_MODERN_BILLING_NOTE_ROWS = 6;

function formatDate(date: string | null | undefined) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const d = parsed.getDate().toString().padStart(2, "0");
  const m = (parsed.getMonth() + 1).toString().padStart(2, "0");
  const y = parsed.getFullYear();
  return `${d}/${m}/${y}`;
}

function getRowClass() {
  return "break-inside-avoid align-top bg-white";
}

function getPrintableLineNote(note: string | null | undefined) {
  return String(note || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "[USAGE_BILL]")
    .join("\n")
    .trim();
}

export function PrintLineItemsTable({ data }: { data: PrintDocumentData }) {
  const { document, lineItems, billingNoteInvoices, lineDeliveryNoteMap, showInlineDeliveryNotes } = data;
  const isDeliveryNote = document.doc_type === "delivery_note";
  const blankLineCount = Math.max(0, MIN_MODERN_ITEM_ROWS - lineItems.length);
  const billingBlankCount = Math.max(0, MIN_MODERN_BILLING_NOTE_ROWS - billingNoteInvoices.length);

  if (document.doc_type === "billing_note") {
    return (
      <section className="print-block mt-3">
        <div className="mb-0.5">
          <span className="text-[9px] tracking-[0.12em] text-[#667085]">รายการใบแจ้งหนี้</span>
          <span className="text-[6.5px] text-[#94a3b8] ml-2">INVOICES</span>
        </div>
        <table className="print-table w-full border-separate border-spacing-0">
          <thead className="bg-[#F4F7FB] text-[#344054]">
            <tr>
              <th className="px-2 py-1.5 text-left text-[9px] font-semibold tracking-[0.06em]">เลขที่ใบแจ้งหนี้<div className="text-[6.5px] font-normal text-[#94a3b8]">INVOICE NO.</div></th>
              <th className="px-2 py-1.5 text-left text-[9px] font-semibold tracking-[0.06em]">วันที่ออก<div className="text-[6.5px] font-normal text-[#94a3b8]">ISSUE DATE</div></th>
              <th className="px-2 py-1.5 text-right text-[9px] font-semibold tracking-[0.06em]">มูลค่า<div className="text-[6.5px] font-normal text-[#94a3b8]">SUBTOTAL</div></th>
              <th className="px-2 py-1.5 text-right text-[9px] font-semibold tracking-[0.06em]">ภาษีมูลค่าเพิ่ม<div className="text-[6.5px] font-normal text-[#94a3b8]">VAT</div></th>
              <th className="px-2 py-1.5 text-right text-[9px] font-semibold tracking-[0.06em]">รวม<div className="text-[6.5px] font-normal text-[#94a3b8]">TOTAL</div></th>
            </tr>
          </thead>
          <tbody>
            {billingNoteInvoices.map((invoice) => (
              <tr key={invoice.id} className={getRowClass()}>
                <td className="px-2 py-1.5 text-[10px] text-[#111827] border-t-[0.5px] border-[#E6EBF2]">
                  {invoice.invoice_number}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-[#475467] border-t-[0.5px] border-[#E6EBF2]">
                  {formatDate(invoice.issue_date)}
                </td>
                <td className="px-2 py-1.5 text-right text-[10px] text-[#111827] border-t-[0.5px] border-[#E6EBF2]">
                  {formatCurrency(invoice.subtotal)}
                </td>
                <td className="px-2 py-1.5 text-right text-[10px] text-[#111827] border-t-[0.5px] border-[#E6EBF2]">
                  {formatCurrency(invoice.vat_amount)}
                </td>
                <td className="px-2 py-1.5 text-right text-[10px] font-medium text-[#111827] border-t-[0.5px] border-[#E6EBF2]">
                  {formatCurrency(invoice.total_amount)}
                </td>
              </tr>
            ))}
            {Array.from({ length: billingBlankCount }).map((_, index) => (
              <tr key={`billing-blank-${index}`} className="print-modern-blank-row break-inside-avoid align-top bg-white">
                <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
                <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
                <td className="px-2 py-1.5 text-[10px] text-right border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
                <td className="px-2 py-1.5 text-[10px] text-right border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
                <td className="px-2 py-1.5 text-[10px] text-right border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <section className="print-block mt-3">
      <div className="mb-0.5">
        <span className="text-[9px] tracking-[0.12em] text-[#667085]">
          {document.doc_type === "receipt" ? "รายการที่ชำระ" : "รายการสินค้าและบริการ"}
        </span>
        <span className="text-[6.5px] text-[#94a3b8] ml-2">ITEMS</span>
      </div>
      <table className="print-table w-full border-separate border-spacing-0">
        <thead className="bg-[#F4F7FB] text-[#344054]">
          <tr>
            <th className="w-[7mm] px-2 py-1.5 text-left text-[9px] font-semibold tracking-[0.06em]">ลำดับ<div className="text-[6.5px] font-normal text-[#94a3b8]">NO.</div></th>
            <th className="px-2 py-1.5 text-left text-[9px] font-semibold tracking-[0.06em]">รายละเอียด<div className="text-[6.5px] font-normal text-[#94a3b8]">DESCRIPTION</div></th>
            <th className="w-[16mm] px-2 py-1.5 text-right text-[9px] font-semibold tracking-[0.06em]">จำนวน<div className="text-[6.5px] font-normal text-[#94a3b8]">QTY</div></th>
            <th className="w-[16mm] px-2 py-1.5 text-left text-[9px] font-semibold tracking-[0.06em]">หน่วย<div className="text-[6.5px] font-normal text-[#94a3b8]">UNIT</div></th>
            {!isDeliveryNote && (
              <>
                <th className="w-[20mm] px-2 py-1.5 text-right text-[9px] font-semibold tracking-[0.06em]">ราคา/หน่วย<div className="text-[6.5px] font-normal text-[#94a3b8]">UNIT PRICE</div></th>
                <th className="w-[13mm] px-2 py-1.5 text-right text-[9px] font-semibold tracking-[0.06em]">ส่วนลด<div className="text-[6.5px] font-normal text-[#94a3b8]">DISC.</div></th>
                <th className="w-[22mm] px-2 py-1.5 text-right text-[9px] font-semibold tracking-[0.06em]">จำนวนเงิน<div className="text-[6.5px] font-normal text-[#94a3b8]">AMOUNT</div></th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, index) => {
            const hasLineDiscount = item.discount_amount > 0 || item.discount_percent > 0;
            const printableNote = getPrintableLineNote(item.line_note);

            return (
              <tr key={item.id} className={getRowClass()}>
                <td className="px-2 py-1.5 text-[10px] text-[#667085] border-t-[0.5px] border-[#E6EBF2]">{index + 1}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#111827] border-t-[0.5px] border-[#E6EBF2]">
                  <div className="leading-[14px]">{item.item_name}</div>
                  {printableNote ? (
                    <div className="mt-0.5 whitespace-pre-line text-[9px] leading-[12px] text-[#667085]">หมายเหตุ: {printableNote}</div>
                  ) : null}
                  {hasLineDiscount && !isDeliveryNote ? (
                    <div className="mt-0.5 text-[9px] text-[#B54708]">
                      ส่วนลด {item.discount_percent || 0}%{item.discount_amount > 0 ? ` | -${formatCurrency(item.discount_amount)}` : ""}
                    </div>
                  ) : null}
                  {showInlineDeliveryNotes && lineDeliveryNoteMap[item.id] ? (
                    <div className="mt-0.5 text-[9px] text-[#6B7280]">
                      อ้างอิง {lineDeliveryNoteMap[item.id].number}
                      {lineDeliveryNoteMap[item.id].issue_date ? ` (${formatDate(lineDeliveryNoteMap[item.id].issue_date)})` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-right text-[10px] text-[#111827] border-t-[0.5px] border-[#E6EBF2]">{item.quantity}</td>
                <td className="px-2 py-1.5 text-[10px] text-[#475467] border-t-[0.5px] border-[#E6EBF2]">{item.unit}</td>
                {!isDeliveryNote && (
                  <>
                    <td className="px-2 py-1.5 text-right text-[10px] text-[#111827] border-t-[0.5px] border-[#E6EBF2]">{formatCurrency(item.unit_price)}</td>
                    <td className="px-2 py-1.5 text-right text-[10px] text-[#111827] border-t-[0.5px] border-[#E6EBF2]">
                      {hasLineDiscount ? `${item.discount_percent || 0}%` : "-"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[10px] font-medium text-[#111827] border-t-[0.5px] border-[#E6EBF2]">
                      {formatCurrency(item.line_total)}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
          {Array.from({ length: blankLineCount }).map((_, index) => (
            <tr key={`blank-${index}`} className="print-modern-blank-row break-inside-avoid align-top bg-white">
              <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
              <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
              <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
              <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
              {!isDeliveryNote && (
                <>
                  <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
                  <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
                  <td className="px-2 py-1.5 text-[10px] border-t-[0.5px] border-[#E6EBF2]">&nbsp;</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
