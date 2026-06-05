import { formatCurrency } from "../../lib/format";
import type { PrintDocumentData } from "../../lib/print";

function getRowClass(index: number) {
  return `break-inside-avoid align-top ${index % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]"}`;
}

export function PrintLineItemsTable({ data }: { data: PrintDocumentData }) {
  const { document, lineItems, billingNoteInvoices } = data;

  if (document.doc_type === "billing_note") {
    return (
      <section className="print-block mt-4">
        <div className="mb-1 text-[10px] tracking-[0.12em] text-[#667085]">รายการใบแจ้งหนี้</div>
        <table className="print-table w-full border-separate border-spacing-0">
          <thead className="bg-[#F4F7FB] text-[#344054]">
            <tr>
              <th className="px-2 py-2 text-left text-[10px] font-semibold tracking-[0.06em]">เลขที่ใบแจ้งหนี้</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold tracking-[0.06em]">วันที่ออก</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold tracking-[0.06em]">มูลค่า</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold tracking-[0.06em]">ภาษีมูลค่าเพิ่ม</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold tracking-[0.06em]">รวม</th>
            </tr>
          </thead>
          <tbody>
            {billingNoteInvoices.map((invoice, index) => (
              <tr key={invoice.id} className={getRowClass(index)}>
                <td className="px-2 py-2 text-[11px] text-[#111827] border-t border-[#E4EAF1]">
                  {invoice.invoice_number}
                </td>
                <td className="px-2 py-2 text-[11px] text-[#475467] border-t border-[#E4EAF1]">
                  {invoice.issue_date || "-"}
                </td>
                <td className="px-2 py-2 text-right text-[11px] text-[#111827] border-t border-[#E4EAF1]">
                  {formatCurrency(invoice.subtotal)}
                </td>
                <td className="px-2 py-2 text-right text-[11px] text-[#111827] border-t border-[#E4EAF1]">
                  {formatCurrency(invoice.vat_amount)}
                </td>
                <td className="px-2 py-2 text-right text-[11px] font-medium text-[#111827] border-t border-[#E4EAF1]">
                  {formatCurrency(invoice.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <section className="print-block mt-4">
      <div className="mb-1 text-[10px] tracking-[0.12em] text-[#667085]">
        {document.doc_type === "receipt" ? "รายการที่ชำระ" : "รายการสินค้าและบริการ"}
      </div>
      <table className="print-table w-full border-separate border-spacing-0">
        <thead className="bg-[#F4F7FB] text-[#344054]">
          <tr>
            <th className="w-[8mm] px-2 py-2 text-left text-[10px] font-semibold tracking-[0.06em]">ลำดับ</th>
            <th className="px-2 py-2 text-left text-[10px] font-semibold tracking-[0.06em]">รายละเอียด</th>
            <th className="w-[16mm] px-2 py-2 text-right text-[10px] font-semibold tracking-[0.06em]">จำนวน</th>
            <th className="w-[16mm] px-2 py-2 text-left text-[10px] font-semibold tracking-[0.06em]">หน่วย</th>
            <th className="w-[22mm] px-2 py-2 text-right text-[10px] font-semibold tracking-[0.06em]">ราคา/หน่วย</th>
            <th className="w-[14mm] px-2 py-2 text-right text-[10px] font-semibold tracking-[0.06em]">ส่วนลด</th>
            <th className="w-[24mm] px-2 py-2 text-right text-[10px] font-semibold tracking-[0.06em]">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, index) => {
            const hasLineDiscount = item.discount_amount > 0 || item.discount_percent > 0;

            return (
              <tr key={item.id} className={getRowClass(index)}>
                <td className="px-2 py-2 text-[11px] text-[#667085] border-t border-[#E4EAF1]">{index + 1}</td>
                <td className="px-2 py-2 text-[11px] text-[#111827] border-t border-[#E4EAF1]">
                  <div className="leading-[16px]">{item.item_name}</div>
                  {hasLineDiscount ? (
                    <div className="mt-0.5 text-[10px] text-[#B54708]">
                      ส่วนลด {item.discount_percent || 0}%{item.discount_amount > 0 ? ` | ฿${formatCurrency(item.discount_amount)}` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-right text-[11px] text-[#111827] border-t border-[#E4EAF1]">{item.quantity}</td>
                <td className="px-2 py-2 text-[11px] text-[#475467] border-t border-[#E4EAF1]">{item.unit}</td>
                <td className="px-2 py-2 text-right text-[11px] text-[#111827] border-t border-[#E4EAF1]">{formatCurrency(item.unit_price)}</td>
                <td className="px-2 py-2 text-right text-[11px] text-[#111827] border-t border-[#E4EAF1]">
                  {hasLineDiscount ? `${item.discount_percent || 0}%` : "-"}
                </td>
                <td className="px-2 py-2 text-right text-[11px] font-medium text-[#111827] border-t border-[#E4EAF1]">
                  {formatCurrency(item.line_total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
