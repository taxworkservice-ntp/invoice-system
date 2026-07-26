import { formatCurrency } from "../../lib/format";
import { documentTypeLabel } from "../../lib/docLabels";
import { splitTerms } from "../../lib/terms";
import { LOGO_SIZE_OPTIONS, PAYMENT_METHOD_LABELS } from "../../constants";
import type { PrintDocumentData } from "../../lib/print";
import type { Customer, DocumentLineItem } from "../../types";
import type { PageMode } from "../../lib/pagination";
import { PrintContinuationHeader } from "./PrintContinuationHeader";

export type CopyType = "original" | "copy";

const COPY_LABELS: Record<CopyType, string> = {
  original: "ต้นฉบับลูกค้า",
  copy: "สำเนา",
};

function getLogoPx(logoSize: string | null): number {
  return LOGO_SIZE_OPTIONS.find((o) => o.value === logoSize)?.px ?? 64;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const d = parsed.getDate().toString().padStart(2, "0");
  const m = (parsed.getMonth() + 1).toString().padStart(2, "0");
  const y = parsed.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatDateBuddhist(date: string | null | undefined): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const d = parsed.getDate().toString().padStart(2, "0");
  const m = (parsed.getMonth() + 1).toString().padStart(2, "0");
  const y = parsed.getFullYear() + 543;
  return `${d}/${m}/${y}`;
}

const SHOW_BANK_TYPES = new Set([
  "invoice",
  "tax_invoice_receipt",
  "billing_note",
]);
const SHOW_PAYMENT_METHOD_TYPES = new Set([
  "invoice",
  "tax_invoice_receipt",
  "receipt",
]);
const MIN_CLASSIC_ITEM_ROWS = 8;
const MIN_CLASSIC_BILLING_NOTE_ROWS = 8;
const MIN_CLASSIC_RECEIPT_ROWS = 8;

interface PrintDocumentClassicProps {
  data: PrintDocumentData;
  copyType?: CopyType;
}

function getPrintableLineNote(note: string | null | undefined) {
  return String(note || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "[USAGE_BILL]")
    .join("\n")
    .trim();
}

interface PrintDocumentClassicProps {
  data: PrintDocumentData;
  copyType?: CopyType;
  pageMode?: PageMode;
  pageIndex?: number;
  totalPages?: number;
  batchLineItems?: DocumentLineItem[];
}

export function PrintDocumentClassicV2({
  data,
  copyType = "original",
  pageMode = "single",
  pageIndex = 1,
  totalPages = 1,
  batchLineItems,
}: PrintDocumentClassicProps) {
  const {
    document,
    clientProfile,
    customer,
    referenceDoc,
    billingNoteInvoices,
    receiptInvoices,
    invoiceDeliveryNotes,
    lineDeliveryNoteMap,
    showInlineDeliveryNotes,
    invoiceNumberMap,
  } = data;
  const lineItems = batchLineItems ?? data.lineItems;
  const startIndex = batchLineItems
    ? data.lineItems.indexOf(batchLineItems[0]) + 1
    : 1;
  const isCopy = copyType === "copy";
  const isDeliveryNote = document.doc_type === "delivery_note";
  const hideDeliveryAmounts =
    isDeliveryNote && document.hide_amounts_on_print !== false;
  const isBillingNote = document.doc_type === "billing_note";
  const showFooter = pageMode === "single" || pageMode === "last";
  const showHeader = pageMode === "single" || pageMode === "first";
  const showContinuationHeader =
    pageMode === "continuation" || pageMode === "last";
  const documentClass = isDeliveryNote ? " print-delivery-note" : "";
  const showBank = SHOW_BANK_TYPES.has(document.doc_type);
  const showPaymentMethod = SHOW_PAYMENT_METHOD_TYPES.has(document.doc_type);
  const signatureUrl = clientProfile.signature_url;
  const stampUrl = clientProfile.stamp_url;
  const label = documentTypeLabel(document.doc_type, document.vat_registered);
  const copyLabel = COPY_LABELS[copyType];
  const classicTerms = splitTerms(
    clientProfile.classic_terms,
    clientProfile.company_name_th,
  );
  const isLastOrSingle = pageMode === "last" || pageMode === "single";
  const blankLineCount = isLastOrSingle
    ? Math.max(0, MIN_CLASSIC_ITEM_ROWS - lineItems.length)
    : 0;
  const billingBlankCount = Math.max(
    0,
    MIN_CLASSIC_BILLING_NOTE_ROWS - billingNoteInvoices.length,
  );
  const receiptBlankCount = Math.max(
    0,
    MIN_CLASSIC_RECEIPT_ROWS - receiptInvoices.length,
  );
  const noteText = document.note?.trim();
  const paymentLines = [
    clientProfile.bank_name && showBank
      ? `ธนาคาร: ${clientProfile.bank_name}`
      : null,
    clientProfile.bank_account && showBank
      ? `เลขที่บัญชี: ${clientProfile.bank_account}`
      : null,
    showPaymentMethod && document.payment_method
      ? `วิธีชำระเงิน: ${PAYMENT_METHOD_LABELS[document.payment_method] || document.payment_method}`
      : null,
    document.amount_received != null
      ? `จำนวนเงินที่รับ: ${formatCurrency(document.amount_received)}`
      : null,
    document.wht_certificate_no
      ? `เลขที่หนังสือรับรองหัก ณ ที่จ่าย: ${document.wht_certificate_no}`
      : null,
  ].filter(Boolean) as string[];

  const titleTh = label.thai;
  const titleEn = label.en.toUpperCase();

  // Reference doc label
  const refLabel = (() => {
    if (!referenceDoc) return null;
    if (document.doc_type === "receipt") {
      if (referenceDoc.doc_type === "invoice") return "อ้างอิงใบแจ้งหนี้";
      if (referenceDoc.doc_type === "tax_invoice_receipt") {
        return referenceDoc.vat_registered
          ? "อ้างอิงใบกำกับภาษี"
          : "อ้างอิงใบเสร็จรับเงิน";
      }
      if (referenceDoc.doc_type === "billing_note") return "อ้างอิงใบวางบิล";
    }
    return "เอกสารอ้างอิง";
  })();

  return (
    <article
      className={
        isCopy
          ? `print-sheet print-theme-classic print-copy${documentClass}`
          : `print-sheet print-theme-classic${documentClass}`
      }
    >
      {/* ============== TOP HEADER ============== */}
      {showContinuationHeader && (
        <PrintContinuationHeader
          data={data}
          pageIndex={pageIndex}
          totalPages={totalPages}
        />
      )}
      {showHeader && (
        <>
          <header className="print-classic-top">
            <div className="print-classic-logo">
              {clientProfile.logo_url ? (
                <img
                  src={clientProfile.logo_url}
                  alt={clientProfile.company_name_th}
                  style={{ width: getLogoPx(clientProfile.logo_size) }}
                  className="print-classic-logo-img"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="print-classic-logo-fallback">logo</div>
              )}
            </div>
            <div className="print-classic-company">
              <div className="print-classic-company-th">
                {clientProfile.company_name_th}
              </div>
              {clientProfile.company_name_en ? (
                <div className="print-classic-company-en">
                  {clientProfile.company_name_en}
                </div>
              ) : null}
              <div className="print-classic-company-meta">
                {clientProfile.address ? (
                  <>
                    <div>{clientProfile.address}</div>
                  </>
                ) : null}
                {clientProfile.tax_id ? (
                  <div>เลขภาษี : {clientProfile.tax_id}</div>
                ) : null}
                {clientProfile.phone ? (
                  <div>โทร: {clientProfile.phone}</div>
                ) : null}
              </div>
            </div>
            <div className="print-classic-top-right">
              <div className="print-classic-copy-badge">
                <div className="print-classic-copy-th">{copyLabel}</div>
                <div className="print-classic-copy-en">
                  {isCopy ? "CUSTOMER COPY" : "CUSTOMER ORIGINAL"}
                </div>
              </div>
            </div>
          </header>

          {/* ============== DOCUMENT TITLE ============== */}
          <div className="print-classic-doc-title">
            <div className="print-classic-doc-title-th">{titleTh}</div>
            {titleEn ? (
              <div className="print-classic-doc-title-en">{titleEn}</div>
            ) : null}
          </div>

          {/* ============== INFO BAND ============== */}
          <section className="print-classic-info-band">
            <div className="print-classic-panel print-classic-customer-panel">
              <div className="print-classic-customer-row">
                <div className="print-classic-label">
                  <span className="print-classic-label-th">ชื่อลูกค้า :</span>
                  <span className="print-classic-label-en">CUSTOMER NAME</span>
                </div>
                <div className="print-classic-val">{customer.name}</div>

                {customer.address ? (
                  <>
                    <div className="print-classic-label">
                      <span className="print-classic-label-th">ที่อยู่ :</span>
                      <span className="print-classic-label-en">ADDRESS</span>
                    </div>
                    <div className="print-classic-val">{customer.address}</div>
                  </>
                ) : null}

                {customer.phone ? (
                  <>
                    <div className="print-classic-label">
                      <span className="print-classic-label-th">โทรศัพท์ :</span>
                      <span className="print-classic-label-en">TELEPHONE</span>
                    </div>
                    <div className="print-classic-val">{customer.phone}</div>
                  </>
                ) : null}

                {customer.tax_id ? (
                  <>
                    <div className="print-classic-label">
                      <span className="print-classic-label-th">เลขภาษี :</span>
                      <span className="print-classic-label-en">TAX ID NO.</span>
                    </div>
                    <div className="print-classic-val">{customer.tax_id}</div>
                  </>
                ) : null}

                {customer.contact_name ? (
                  <>
                    <div className="print-classic-label">
                      <span className="print-classic-label-th">
                        ชื่อผู้ติดต่อ :
                      </span>
                      <span className="print-classic-label-en">
                        CONTACT PERSON
                      </span>
                    </div>
                    <div className="print-classic-val">
                      {customer.contact_name}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="print-classic-panel">
              <table className="print-classic-meta-table">
                <tbody>
                  <tr>
                    <th>
                      <span className="print-classic-meta-th-th">วันที่</span>
                      <span className="print-classic-meta-th-en">DATE</span>
                    </th>
                    <td className="print-classic-meta-val">
                      {formatDate(document.issue_date)}
                    </td>
                  </tr>
                  <tr>
                    <th>
                      <span className="print-classic-meta-th-th">เลขที่</span>
                      <span className="print-classic-meta-th-en">NO.</span>
                    </th>
                    <td className="print-classic-meta-val">
                      {document.doc_number || "-"}
                    </td>
                  </tr>
                  {referenceDoc && refLabel ? (
                    <tr>
                      <th>
                        <span className="print-classic-meta-th-th">
                          {refLabel}
                        </span>
                        <span className="print-classic-meta-th-en">
                          REF. NO.
                        </span>
                      </th>
                      <td className="print-classic-meta-val">
                        {referenceDoc.doc_number || "-"}
                      </td>
                    </tr>
                  ) : null}
                  {document.due_date ? (
                    <tr>
                      <th>
                        <span className="print-classic-meta-th-th">
                          วันครบกำหนด
                        </span>
                        <span className="print-classic-meta-th-en">
                          DUE DATE
                        </span>
                      </th>
                      <td className="print-classic-meta-val">
                        {formatDate(document.due_date)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ============== ITEMS TABLE ============== */}
      <section className="print-classic-items-wrap">
        {isBillingNote && document.vat_registered ? (
          <div className="print-classic-items-title">
            รายการใบแจ้งหนี้ (INVOICES)
          </div>
        ) : document.doc_type === "receipt" &&
          receiptInvoices.length > 0 &&
          document.vat_registered ? (
          <div className="print-classic-items-title">
            รายการที่ชำระ (PAID INVOICES)
          </div>
        ) : (
          <div className="print-classic-items-title">
            {document.doc_type === "receipt"
              ? "รายการที่ชำระ"
              : "รายการสินค้าและบริการ"}
            <span className="en">ITEMS</span>
          </div>
        )}

        <div className="print-classic-table-frame">
          {isBillingNote && document.vat_registered ? (
            <table className="print-classic-items-table">
              <colgroup>
                <col style={{ width: "12mm" }} />
                <col style={{ width: "32mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    เลขที่<span className="en">NO.</span>
                  </th>
                  <th>
                    เลขที่ใบแจ้งหนี้<span className="en">INVOICE NO.</span>
                  </th>
                  <th>
                    วันที่ออก<span className="en">ISSUE DATE</span>
                  </th>
                  <th>
                    มูลค่า<span className="en">SUBTOTAL</span>
                  </th>
                  <th>
                    ภาษีมูลค่าเพิ่ม<span className="en">VAT</span>
                  </th>
                  <th>
                    รวม<span className="en">AMOUNT</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {billingNoteInvoices.map((inv, i) => (
                  <tr key={inv.id}>
                    <td className="center">{i + 1}</td>
                    <td>{inv.invoice_number}</td>
                    <td>{formatDateBuddhist(inv.issue_date)}</td>
                    <td className="right">{formatCurrency(inv.subtotal)}</td>
                    <td className="right">{formatCurrency(inv.vat_amount)}</td>
                    <td className="right bold">
                      {formatCurrency(inv.total_amount)}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: billingBlankCount }).map((_, index) => (
                  <tr
                    key={`billing-blank-${index}`}
                    className="print-classic-blank-row"
                  >
                    <td className="center">&nbsp;</td>
                    <td>&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right bold">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : document.doc_type === "receipt" &&
            receiptInvoices.length > 0 &&
            document.vat_registered ? (
            <table className="print-classic-items-table">
              <colgroup>
                <col style={{ width: "12mm" }} />
                <col style={{ width: "32mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    เลขที่<span className="en">NO.</span>
                  </th>
                  <th>
                    เลขที่ใบแจ้งหนี้<span className="en">INVOICE NO.</span>
                  </th>
                  <th>
                    วันที่ออก<span className="en">ISSUE DATE</span>
                  </th>
                  <th>
                    มูลค่า<span className="en">SUBTOTAL</span>
                  </th>
                  <th>
                    ภาษีมูลค่าเพิ่ม<span className="en">VAT</span>
                  </th>
                  <th>
                    รับชำระ<span className="en">PAID</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {receiptInvoices.map((inv, i) => (
                  <tr key={inv.id}>
                    <td className="center">{i + 1}</td>
                    <td>{inv.invoice_number}</td>
                    <td>{formatDateBuddhist(inv.issue_date)}</td>
                    <td className="right">{formatCurrency(inv.subtotal)}</td>
                    <td className="right">{formatCurrency(inv.vat_amount)}</td>
                    <td className="right bold">
                      {formatCurrency(inv.paid_amount)}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: receiptBlankCount }).map((_, index) => (
                  <tr
                    key={`receipt-blank-${index}`}
                    className="print-classic-blank-row"
                  >
                    <td className="center">&nbsp;</td>
                    <td>&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right bold">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="print-classic-items-table">
              <colgroup>
                <col style={{ width: "12mm" }} />
                <col
                  style={{ width: hideDeliveryAmounts ? "139mm" : "87mm" }}
                />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "15mm" }} />
                {!hideDeliveryAmounts && (
                  <>
                    <col style={{ width: "22mm" }} />
                    <col style={{ width: "26mm" }} />
                  </>
                )}
              </colgroup>
              <thead>
                <tr>
                  <th>
                    เลขที่<span className="en">ITEM</span>
                  </th>
                  <th>
                    รายการ<span className="en">DESCRIPTION</span>
                  </th>
                  <th style={{ textAlign: "center" }}>
                    จำนวน<span className="en">QTY</span>
                  </th>
                  <th style={{ textAlign: "center" }}>
                    หน่วย<span className="en">UNIT</span>
                  </th>
                  {!hideDeliveryAmounts && (
                    <>
                      <th style={{ textAlign: "right" }}>
                        ราคา/หน่วย<span className="en">UNIT PRICE</span>
                      </th>
                      <th style={{ textAlign: "right" }}>
                        จำนวนเงิน<span className="en">AMOUNT</span>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => {
                  const hasLineDiscount =
                    item.discount_amount > 0 || item.discount_percent > 0;
                  const deliveryNoteRef = lineDeliveryNoteMap[item.id];
                  const printableNote = getPrintableLineNote(item.line_note);
                  return (
                    <tr key={item.id}>
                      <td className="center">{startIndex + index}</td>
                      <td className="print-classic-item-name">
                        {item.item_name}
                        {printableNote ? (
                          <div className="print-classic-item-note">
                            {printableNote}
                          </div>
                        ) : null}
                        {hasLineDiscount && !hideDeliveryAmounts ? (
                          <div className="print-classic-discount-note">
                            ส่วนลด {item.discount_percent || 0}%
                            {item.discount_amount > 0
                              ? ` | -${formatCurrency(item.discount_amount)}`
                              : ""}
                          </div>
                        ) : null}
                        {showInlineDeliveryNotes && deliveryNoteRef ? (
                          <div className="print-classic-dn-note">
                            อ้างอิง {deliveryNoteRef.number}
                            {deliveryNoteRef.issue_date
                              ? ` (${formatDateBuddhist(deliveryNoteRef.issue_date)})`
                              : ""}
                          </div>
                        ) : null}
                        {!document.vat_registered &&
                        (receiptInvoices.length > 1 ||
                          billingNoteInvoices.length > 1) &&
                        invoiceNumberMap[item.document_id] ? (
                          <div className="print-classic-dn-note">
                            ใบแจ้งหนี้ {invoiceNumberMap[item.document_id]}
                          </div>
                        ) : null}
                      </td>
                      <td className="center">{item.quantity.toLocaleString("th-TH")}</td>
                      <td className="center">{item.unit}</td>
                      {!hideDeliveryAmounts && (
                        <>
                          <td className="right">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="right bold">
                            {formatCurrency(item.line_total)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {Array.from({ length: blankLineCount }).map((_, index) => (
                  <tr
                    key={`blank-${index}`}
                    className="print-classic-blank-row"
                  >
                    <td className="center">&nbsp;</td>
                    <td className="print-classic-item-name">&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    {!hideDeliveryAmounts && (
                      <>
                        <td className="right">&nbsp;</td>
                        <td className="right">&nbsp;</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ============== INVOICE DELIVERY NOTES ============== */}
          {invoiceDeliveryNotes.length > 0 &&
          !isDeliveryNote &&
          !data.showInlineDeliveryNotes &&
          !data.isDeliveryNoteSummaryInvoice ? (
            <div className="print-classic-frame-section">
              <div className="print-classic-frame-section-title">
                อ้างอิงใบส่งของ<span className="en">DELIVERY NOTES</span>
              </div>
              <table className="print-classic-items-table">
                <colgroup>
                  <col style={{ width: "12mm" }} />
                  <col />
                  <col style={{ width: "24mm" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      เลขที่<span className="en">NO.</span>
                    </th>
                    <th>
                      เลขที่ใบส่งของ<span className="en">DELIVERY NO.</span>
                    </th>
                    <th>
                      วันที่ส่งของ<span className="en">DELIVERY DATE</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceDeliveryNotes.map((dn, i) => (
                    <tr key={dn.id}>
                      <td className="center">{i + 1}</td>
                      <td>{dn.delivery_note_number}</td>
                      <td>{formatDateBuddhist(dn.issue_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* ============== NOTE / PAYMENT + TOTALS ============== */}
          <div className="print-classic-bottom-row">
            <div className="print-classic-terms-col">
              {isDeliveryNote ? (
                <>
                  <div className="print-classic-terms-title">
                    หมายเหตุการส่งของ (REMARKS)
                  </div>
                  <div className="print-classic-terms-body">
                    {noteText || "-"}
                  </div>
                </>
              ) : (
                <>
                  {noteText ? (
                    <section className="print-classic-terms-section">
                      <div className="print-classic-terms-title">
                        หมายเหตุ (NOTE)
                      </div>
                      <div className="print-classic-terms-body">{noteText}</div>
                    </section>
                  ) : null}
                  {paymentLines.length > 0 ? (
                    <section className="print-classic-terms-section">
                      <div className="print-classic-terms-title">
                        ข้อมูลการชำระเงิน (PAYMENT)
                      </div>
                      <ul className="print-classic-payment-list">
                        {paymentLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {!noteText && paymentLines.length === 0 ? (
                    <div className="print-classic-terms-body">-</div>
                  ) : null}
                </>
              )}
            </div>
            {!hideDeliveryAmounts && (
              <div className="print-classic-totals-col">
                <div className="print-classic-totals-row">
                  <div className="print-classic-totals-lab">
                    <div className="print-classic-totals-th">รวมเงิน</div>
                    <div className="print-classic-totals-en">SUB TOTAL</div>
                  </div>
                  <div className="print-classic-totals-val">
                    {formatCurrency(document.subtotal)}
                  </div>
                </div>
                {document.discount_amount > 0 ? (
                  <div className="print-classic-totals-row">
                    <div className="print-classic-totals-lab">
                      <div className="print-classic-totals-th">
                        ส่วนลดท้ายบิล
                        {document.discount_percent
                          ? ` (${document.discount_percent}%)`
                          : ""}
                      </div>
                      <div className="print-classic-totals-en">DISCOUNT</div>
                    </div>
                    <div className="print-classic-totals-val">
                      -{formatCurrency(document.discount_amount)}
                    </div>
                  </div>
                ) : null}
                {document.vat_registered && document.vat_amount > 0 ? (
                  <div className="print-classic-totals-row">
                    <div className="print-classic-totals-lab">
                      <div className="print-classic-totals-th">
                        ภาษีมูลค่าเพิ่ม {document.vat_rate}%
                      </div>
                      <div className="print-classic-totals-en">
                        VAT {document.vat_rate}%
                      </div>
                    </div>
                    <div className="print-classic-totals-val">
                      {formatCurrency(document.vat_amount)}
                    </div>
                  </div>
                ) : null}
                <div className="print-classic-totals-row print-classic-totals-row-grand">
                  <div className="print-classic-totals-lab">
                    <div className="print-classic-totals-th">
                      ยอดรวมทั้งสิ้น
                    </div>
                    <div className="print-classic-totals-en">GRAND TOTAL</div>
                  </div>
                  <div className="print-classic-totals-val">
                    {formatCurrency(document.total_amount)}
                  </div>
                </div>
                {document.wht_amount > 0 ? (
                  <>
                    <div className="print-classic-totals-row">
                      <div className="print-classic-totals-lab">
                        <div className="print-classic-totals-th">
                          หัก ณ ที่จ่าย {document.wht_rate}%
                        </div>
                        <div className="print-classic-totals-en">
                          WHT {document.wht_rate}%
                        </div>
                      </div>
                      <div className="print-classic-totals-val">
                        -{formatCurrency(document.wht_amount)}
                      </div>
                    </div>
                    <div className="print-classic-totals-row print-classic-totals-row-net">
                      <div className="print-classic-totals-lab">
                        <div className="print-classic-totals-th">
                          ยอดชำระสุทธิ
                        </div>
                        <div className="print-classic-totals-en">
                          NET PAYABLE
                        </div>
                      </div>
                      <div className="print-classic-totals-val">
                        {formatCurrency(document.net_payable)}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </section>

      {lineItems.length > 0 && pageMode !== "single" && pageMode !== "last" && (
        <div className="mt-1.5 text-center text-[8.5px] text-[#94a3b8] tracking-[0.08em] border-b-[0.5px] border-[#D3DAE6] pb-1">
          รายการต่อไป… (CONTINUED)
        </div>
      )}

      {showFooter && (
        <>
          {/* ============== BOTTOM BAND (signatures) ============== */}
          <div className="print-classic-bottom-band">
            <div className="print-classic-sig-cell">
              <div className="print-classic-sig-th">
                {isDeliveryNote
                  ? "ได้รับสินค้า/บริการถูกต้องแล้ว"
                  : "ได้รับชำระเงินถูกต้องแล้ว"}
              </div>
              <div className="print-classic-sig-th-en">
                {isDeliveryNote
                  ? "GOODS/SERVICES RECEIVED"
                  : "PAYMENT RECEIVED"}
              </div>
              <div className="print-classic-sig-line"></div>
              <div className="print-classic-sig-dt">วันที่ / DATE</div>
              <div className="print-classic-sig-role">
                {isDeliveryNote
                  ? "ผู้รับของ / RECEIVED BY"
                  : "ผู้รับเงิน / RECEIVER"}
              </div>
            </div>
            <div className="print-classic-sig-cell print-classic-sig-cell-mid">
              <div className="print-classic-sig-line"></div>
              <div className="print-classic-sig-dt">วันที่ / DATE</div>
              <div className="print-classic-sig-role">
                {isDeliveryNote
                  ? "ผู้ส่งของ / DELIVERED BY"
                  : "ผู้จ่ายเงิน / PAYER"}
              </div>
            </div>
            <div className="print-classic-sig-cell">
              <div className="print-classic-sig-th">
                ในนาม&nbsp;{clientProfile.company_name_th}
              </div>
              <div className="print-classic-sig-th-en">
                FOR{" "}
                {clientProfile.company_name_en?.toUpperCase() ||
                  clientProfile.company_name_th.toUpperCase()}
              </div>
              <div className="print-classic-sig-line">
                {signatureUrl ? (
                  <img
                    src={signatureUrl}
                    alt="ลายเซ็น"
                    className="print-classic-sig-img"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : null}
              </div>
              <div className="print-classic-sig-dt">วันที่ / DATE</div>
              <div className="print-classic-sig-role">
                ผู้มีอำนาจลงนาม / AUTHORIZED BY
              </div>
            </div>
          </div>

          {!isDeliveryNote ? (
            <div className="print-classic-fine-terms">
              <div className="print-classic-fine-terms-title">
                เงื่อนไข (TERMS)
              </div>
              <ol>
                {classicTerms.map((term, index) => (
                  <li key={`${index}-${term}`}>{term}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {/* ============== FOOTER ============== */}
          <div className="print-classic-footer">
            {stampUrl ? (
              <div className="print-classic-stamp">
                <img
                  src={stampUrl}
                  alt="ตราประทับ"
                  className="print-classic-stamp-img"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}
