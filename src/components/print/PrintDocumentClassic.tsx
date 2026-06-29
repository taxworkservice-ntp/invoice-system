import { formatCurrency } from "../../lib/format";
import { documentTypeLabel } from "../../lib/docLabels";
import { LOGO_SIZE_OPTIONS, PAYMENT_METHOD_LABELS } from "../../constants";
import type { PrintDocumentData } from "../../lib/print";
import type { Customer } from "../../types";

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

const SHOW_BANK_TYPES = new Set(["invoice", "tax_invoice_receipt", "billing_note"]);
const SHOW_PAYMENT_METHOD_TYPES = new Set(["invoice", "tax_invoice_receipt", "receipt"]);
const MIN_CLASSIC_ITEM_ROWS = 6;

function defaultClassicTerms(companyName: string): string[] {
  return [
    "ได้รับสินค้าตามรายการข้างบนนี้ไว้ในสภาพดีและถูกต้องเรียบร้อยแล้ว",
    "สินค้าตามรายการข้างบนนี้ หากมีการเสียหายหรือชำรุด โปรดแจ้งกลับให้ทราบภายใน 3 วัน",
    "สินค้าซื้อแล้ว จะไม่รับคืน ยกเว้นแต่จะตกลงเป็นอย่างอื่น",
    `โปรดสั่งจ่ายเช็คขีดคร่อมในนาม "${companyName}"`,
  ];
}

function splitClassicTerms(value: string | null | undefined, companyName: string): string[] {
  const customTerms = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return customTerms && customTerms.length > 0 ? customTerms : defaultClassicTerms(companyName);
}

interface PrintDocumentClassicProps {
  data: PrintDocumentData;
  copyType?: CopyType;
}

export function PrintDocumentClassic({ data, copyType = "original" }: PrintDocumentClassicProps) {
  const { document, clientProfile, customer, referenceDoc, lineItems, billingNoteInvoices, invoiceDeliveryNotes } = data;
  const isCopy = copyType === "copy";
  const isDeliveryNote = document.doc_type === "delivery_note";
  const isBillingNote = document.doc_type === "billing_note";
  const documentClass = isDeliveryNote ? " print-delivery-note" : "";
  const showBank = SHOW_BANK_TYPES.has(document.doc_type);
  const showPaymentMethod = SHOW_PAYMENT_METHOD_TYPES.has(document.doc_type);
  const signatureUrl = clientProfile.signature_url;
  const stampUrl = clientProfile.stamp_url;
  const label = documentTypeLabel(document.doc_type, document.vat_registered);
  const copyLabel = COPY_LABELS[copyType];
  const classicTerms = splitClassicTerms(clientProfile.classic_terms, clientProfile.company_name_th);
  const blankLineCount = Math.max(0, MIN_CLASSIC_ITEM_ROWS - lineItems.length);
  const noteText = document.note?.trim();
  const paymentLines = [
    clientProfile.bank_name && showBank ? `ธนาคาร: ${clientProfile.bank_name}` : null,
    clientProfile.bank_account && showBank ? `เลขที่บัญชี: ${clientProfile.bank_account}` : null,
    showPaymentMethod && document.payment_method ? `วิธีชำระเงิน: ${PAYMENT_METHOD_LABELS[document.payment_method] || document.payment_method}` : null,
    document.amount_received != null ? `จำนวนเงินที่รับ: ${formatCurrency(document.amount_received)}` : null,
    document.wht_certificate_no ? `เลขที่หนังสือรับรองหัก ณ ที่จ่าย: ${document.wht_certificate_no}` : null,
  ].filter(Boolean) as string[];

  const titleTh = label.thai;
  const titleEn = label.en.toUpperCase();

  // Reference doc label
  const refLabel = (() => {
    if (!referenceDoc) return null;
    if (document.doc_type === "receipt") {
      if (referenceDoc.doc_type === "invoice") return "อ้างอิงใบแจ้งหนี้";
      if (referenceDoc.doc_type === "tax_invoice_receipt") {
        return referenceDoc.vat_registered ? "อ้างอิงใบกำกับภาษี" : "อ้างอิงใบเสร็จรับเงิน";
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
      {/* Crop marks */}
      <div className="print-classic-crop print-classic-crop-tl" />
      <div className="print-classic-crop print-classic-crop-tr" />
      <div className="print-classic-crop print-classic-crop-bl" />
      <div className="print-classic-crop print-classic-crop-br" />

      {/* ============== TOP HEADER ============== */}
      <header className="print-classic-top">
        <div className="print-classic-logo">
          {clientProfile.logo_url ? (
            <img src={clientProfile.logo_url} alt={clientProfile.company_name_th} style={{ width: getLogoPx(clientProfile.logo_size) }} className="print-classic-logo-img" />
          ) : (
            <div className="print-classic-logo-fallback">logo</div>
          )}
        </div>
        <div className="print-classic-company">
          <div className="print-classic-company-th">{clientProfile.company_name_th}</div>
          {clientProfile.company_name_en ? <div className="print-classic-company-en">{clientProfile.company_name_en}</div> : null}
          <div className="print-classic-company-meta">
            {clientProfile.address ? (
              <>
                <div>{clientProfile.address}</div>
              </>
            ) : null}
            {clientProfile.tax_id ? <div>เลขภาษี : {clientProfile.tax_id}</div> : null}
            {clientProfile.phone ? <div>โทร: {clientProfile.phone}</div> : null}
          </div>
        </div>
        <div className="print-classic-top-right">
          <div className="print-classic-copy-badge">
            <div className="print-classic-copy-th">{copyLabel}</div>
            <div className="print-classic-copy-en">{isCopy ? "CUSTOMER COPY" : "CUSTOMER ORIGINAL"}</div>
          </div>
        </div>
      </header>

      {/* ============== DOCUMENT TITLE ============== */}
      <div className="print-classic-doc-title">
        <div className="print-classic-doc-title-th">{titleTh}</div>
        {titleEn ? <div className="print-classic-doc-title-en">{titleEn}</div> : null}
      </div>

      {/* ============== INFO BAND ============== */}
      <section className="print-classic-info-band">
        <div className="print-classic-panel print-classic-customer-panel">
          <div className="print-classic-customer-row">
            <div className="print-classic-label"><span className="print-classic-label-th">ชื่อลูกค้า :</span><span className="print-classic-label-en">CUSTOMER NAME</span></div>
            <div className="print-classic-val">{customer.name}</div>

            {customer.address ? (
              <>
                <div className="print-classic-label"><span className="print-classic-label-th">ที่อยู่ :</span><span className="print-classic-label-en">ADDRESS</span></div>
                <div className="print-classic-val">{customer.address}</div>
              </>
            ) : null}

            {customer.phone ? (
              <>
                <div className="print-classic-label"><span className="print-classic-label-th">โทรศัพท์ :</span><span className="print-classic-label-en">TELEPHONE</span></div>
                <div className="print-classic-val">{customer.phone}</div>
              </>
            ) : null}

            {customer.tax_id ? (
              <>
                <div className="print-classic-label"><span className="print-classic-label-th">เลขภาษี :</span><span className="print-classic-label-en">TAX ID NO.</span></div>
                <div className="print-classic-val">{customer.tax_id}</div>
              </>
            ) : null}

            {customer.contact_name ? (
              <>
                <div className="print-classic-label"><span className="print-classic-label-th">ชื่อผู้ติดต่อ :</span><span className="print-classic-label-en">CONTACT PERSON</span></div>
                <div className="print-classic-val">{customer.contact_name}</div>
              </>
            ) : null}
          </div>
        </div>

        <div className="print-classic-panel">
          <table className="print-classic-meta-table">
            <tbody>
              <tr>
                <th><span className="print-classic-meta-th-th">วันที่</span><span className="print-classic-meta-th-en">DATE</span></th>
                <td className="print-classic-meta-val">{formatDate(document.issue_date)}</td>
              </tr>
              <tr>
                <th><span className="print-classic-meta-th-th">เลขที่</span><span className="print-classic-meta-th-en">NO.</span></th>
                <td className="print-classic-meta-val">{document.doc_number || "-"}</td>
              </tr>
              {referenceDoc && refLabel ? (
                <tr>
                  <th><span className="print-classic-meta-th-th">{refLabel}</span><span className="print-classic-meta-th-en">REF. NO.</span></th>
                  <td className="print-classic-meta-val">{referenceDoc.doc_number || "-"}</td>
                </tr>
              ) : null}
              {document.due_date ? (
                <tr>
                  <th><span className="print-classic-meta-th-th">วันครบกำหนด</span><span className="print-classic-meta-th-en">DUE DATE</span></th>
                  <td className="print-classic-meta-val">{formatDate(document.due_date)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============== ITEMS TABLE ============== */}
      {isBillingNote ? (
        <section className="print-classic-items-wrap">
          <div className="print-classic-items-title">รายการใบแจ้งหนี้ (INVOICES)</div>
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
                <th>เลขที่<span className="en">NO.</span></th>
                <th>เลขที่ใบแจ้งหนี้<span className="en">INVOICE NO.</span></th>
                <th>วันที่ออก<span className="en">ISSUE DATE</span></th>
                <th>มูลค่า<span className="en">SUBTOTAL</span></th>
                <th>ภาษีมูลค่าเพิ่ม<span className="en">VAT</span></th>
                <th>รวม<span className="en">AMOUNT</span></th>
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
                  <td className="right bold">{formatCurrency(inv.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="print-classic-items-wrap">
          <div className="print-classic-items-title">
            {document.doc_type === "receipt" ? "รายการที่ชำระ" : "รายการสินค้าและบริการ"}
            <span className="en">ITEMS</span>
          </div>
          <table className="print-classic-items-table">
            <colgroup>
              <col style={{ width: "12mm" }} />
              <col />
              <col style={{ width: "11mm" }} />
              <col style={{ width: "13mm" }} />
              <col style={{ width: "20mm" }} />
              <col style={{ width: "11mm" }} />
              <col style={{ width: "24mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th>เลขที่<span className="en">ITEM</span></th>
                <th>รายการ<span className="en">DESCRIPTION</span></th>
                <th style={{ textAlign: "right" }}>จำนวน<span className="en">QTY</span></th>
                <th style={{ textAlign: "center" }}>หน่วย<span className="en">UNIT</span></th>
                <th style={{ textAlign: "right" }}>ราคา/หน่วย<span className="en">UNIT PRICE</span></th>
                <th style={{ textAlign: "center" }}>ส่วนลด<span className="en">DISC.</span></th>
                <th style={{ textAlign: "right" }}>จำนวนเงิน<span className="en">AMOUNT</span></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => {
                const hasLineDiscount = item.discount_amount > 0 || item.discount_percent > 0;
                return (
                  <tr key={item.id}>
                    <td className="center">{index + 1}</td>
                    <td className="print-classic-item-name">
                      {item.item_name}
                      {item.line_note ? (
                        <div className="print-classic-item-note">หมายเหตุ: {item.line_note}</div>
                      ) : null}
                      {hasLineDiscount ? (
                        <div className="print-classic-discount-note">
                          ส่วนลด {item.discount_percent || 0}%{item.discount_amount > 0 ? ` | -${formatCurrency(item.discount_amount)}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="right">{item.quantity}</td>
                    <td className="center">{item.unit}</td>
                    <td className="right">{formatCurrency(item.unit_price)}</td>
                    <td className="center">{hasLineDiscount ? `${item.discount_percent || 0}%` : "-"}</td>
                    <td className="right bold">{formatCurrency(item.line_total)}</td>
                  </tr>
                );
              })}
              {Array.from({ length: blankLineCount }).map((_, index) => (
                <tr key={`blank-${index}`} className="print-classic-blank-row">
                  <td className="center">&nbsp;</td>
                  <td className="print-classic-item-name">&nbsp;</td>
                  <td className="right">&nbsp;</td>
                  <td className="center">&nbsp;</td>
                  <td className="right">&nbsp;</td>
                  <td className="center">&nbsp;</td>
                  <td className="right">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ============== INVOICE DELIVERY NOTES ============== */}
      {invoiceDeliveryNotes.length > 0 && !isDeliveryNote ? (
        <section className="print-classic-items-wrap">
          <div className="print-classic-items-title">อ้างอิงใบส่งของ<span className="en">DELIVERY NOTES</span></div>
          <table className="print-classic-items-table">
            <colgroup>
              <col style={{ width: "12mm" }} />
              <col />
              <col style={{ width: "24mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th>เลขที่<span className="en">NO.</span></th>
                <th>เลขที่ใบส่งของ<span className="en">DELIVERY NO.</span></th>
                <th>วันที่ส่งของ<span className="en">DELIVERY DATE</span></th>
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
        </section>
      ) : null}

      {/* ============== NOTE / PAYMENT + TOTALS ============== */}
      <div className="print-classic-bottom-row">
        <div className="print-classic-terms-col">
          {isDeliveryNote ? (
            <>
              <div className="print-classic-terms-title">หมายเหตุการส่งของ (REMARKS)</div>
              <div className="print-classic-terms-body">{noteText || "-"}</div>
            </>
          ) : (
            <>
              {noteText ? (
                <section className="print-classic-terms-section">
                  <div className="print-classic-terms-title">หมายเหตุ (NOTE)</div>
                  <div className="print-classic-terms-body">{noteText}</div>
                </section>
              ) : null}
              {paymentLines.length > 0 ? (
                <section className="print-classic-terms-section">
                  <div className="print-classic-terms-title">ข้อมูลการชำระเงิน (PAYMENT)</div>
                  <ul className="print-classic-payment-list">
                    {paymentLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {!noteText && paymentLines.length === 0 ? <div className="print-classic-terms-body">-</div> : null}
            </>
          )}
        </div>
        <div className="print-classic-totals-col">
          <div className="print-classic-totals-row">
            <div className="print-classic-totals-lab">
              <div className="print-classic-totals-th">รวมเงิน</div>
              <div className="print-classic-totals-en">SUB TOTAL</div>
            </div>
            <div className="print-classic-totals-val">{formatCurrency(document.subtotal)}</div>
          </div>
          {document.discount_amount > 0 ? (
            <div className="print-classic-totals-row">
              <div className="print-classic-totals-lab">
                <div className="print-classic-totals-th">ส่วนลดท้ายบิล{document.discount_percent ? ` (${document.discount_percent}%)` : ""}</div>
                <div className="print-classic-totals-en">DISCOUNT</div>
              </div>
              <div className="print-classic-totals-val">-{formatCurrency(document.discount_amount)}</div>
            </div>
          ) : null}
          {document.vat_registered && document.vat_amount > 0 ? (
            <div className="print-classic-totals-row">
              <div className="print-classic-totals-lab">
                <div className="print-classic-totals-th">ภาษีมูลค่าเพิ่ม {document.vat_rate}%</div>
                <div className="print-classic-totals-en">VAT {document.vat_rate}%</div>
              </div>
              <div className="print-classic-totals-val">{formatCurrency(document.vat_amount)}</div>
            </div>
          ) : null}
          <div className="print-classic-totals-row print-classic-totals-row-grand">
            <div className="print-classic-totals-lab">
              <div className="print-classic-totals-th">จำนวนเงินรวมทั้งสิ้น</div>
              <div className="print-classic-totals-en">GRAND TOTAL</div>
            </div>
            <div className="print-classic-totals-val">{formatCurrency(document.total_amount)}</div>
          </div>
          {document.wht_amount > 0 ? (
            <>
              <div className="print-classic-totals-row">
                <div className="print-classic-totals-lab">
                  <div className="print-classic-totals-th">หัก ณ ที่จ่าย {document.wht_rate}%</div>
                  <div className="print-classic-totals-en">WHT {document.wht_rate}%</div>
                </div>
                <div className="print-classic-totals-val">-{formatCurrency(document.wht_amount)}</div>
              </div>
              <div className="print-classic-totals-row print-classic-totals-row-net">
                <div className="print-classic-totals-lab">
                  <div className="print-classic-totals-th">ยอดชำระสุทธิ</div>
                  <div className="print-classic-totals-en">NET PAYABLE</div>
                </div>
                <div className="print-classic-totals-val">{formatCurrency(document.net_payable)}</div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ============== BOTTOM BAND (signatures) ============== */}
      <div className="print-classic-bottom-band">
        <div className="print-classic-sig-cell">
          <div className="print-classic-sig-th">ได้รับสินค้าตามรายการข้างบนนี้ถูกต้องแล้ว</div>
          <div className="print-classic-sig-th-en">RECEIVED IN GOOD CONDITION AND ORDER</div>
          <div className="print-classic-sig-line"></div>
          <div className="print-classic-sig-dt">วันที่ / DATE</div>
          <div className="print-classic-sig-role">ผู้รับของ / RECEIVED BY</div>
        </div>
        <div className="print-classic-sig-cell print-classic-sig-cell-mid">
          <div className="print-classic-sig-line"></div>
          <div className="print-classic-sig-dt">วันที่ / DATE</div>
          <div className="print-classic-sig-role">ผู้ส่งของ / DELIVERED BY</div>
        </div>
        <div className="print-classic-sig-cell">
          <div className="print-classic-sig-th">ในนาม&nbsp;{clientProfile.company_name_th}</div>
          <div className="print-classic-sig-th-en">FOR {clientProfile.company_name_en?.toUpperCase() || clientProfile.company_name_th.toUpperCase()}</div>
          <div className="print-classic-sig-line">
            {signatureUrl ? (
              <img src={signatureUrl} alt="ลายเซ็น" className="print-classic-sig-img" />
            ) : null}
          </div>
          <div className="print-classic-sig-dt">วันที่ / DATE</div>
          <div className="print-classic-sig-role">ผู้มีอำนาจลงนาม / AUTHORIZED BY</div>
        </div>
      </div>

      {!isDeliveryNote ? (
        <div className="print-classic-fine-terms">
          <div className="print-classic-fine-terms-title">เงื่อนไข (TERMS)</div>
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
            <img src={stampUrl} alt="ตราประทับ" className="print-classic-stamp-img" />
          </div>
        ) : null}
      </div>
    </article>
  );
}
