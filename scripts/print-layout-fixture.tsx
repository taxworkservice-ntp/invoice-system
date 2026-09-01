import React from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import { PrintDocument } from "../src/components/print/PrintDocument";
import { PrintDocumentClassic } from "../src/components/print/PrintDocumentClassic";
import { PrintDocumentClassicV2 } from "../src/components/print/PrintDocumentClassicV2";
import { PrintAppendix } from "../src/components/print/PrintAppendix";
import { applyAppendixToData } from "../src/lib/print";
import type { CopyType } from "../src/components/print/PrintDocument";
import type { HtmlPrintTemplate, PrintDocumentData } from "../src/lib/print";
import type {
  BillingNoteInvoice,
  ClientProfile,
  Customer,
  Document,
  DocumentLineItem,
  InvoiceDeliveryNote,
} from "../src/types";

const image = (label: string, color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="90" viewBox="0 0 220 90">
      <rect width="220" height="90" rx="10" fill="${color}"/>
      <text x="110" y="55" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="white" text-anchor="middle">${label}</text>
    </svg>`,
  )}`;

const now = "2026-07-01T00:00:00.000Z";

const customer: Customer = {
  id: "customer-layout-baseline",
  user_id: "user-layout-baseline",
  name: "Siam Retail Group Co., Ltd.",
  tax_id: "0105559998888",
  address: "88 Test Road, Khlong Toei, Bangkok 10110",
  contact_name: "Accounts Payable",
  phone: "02-555-0188",
  email: "ap@example.test",
  note: null,
  is_active: true,
  is_favorite: false,
  avatar_initials: "SR",
  avatar_color: "#378ADD",
  credit_term_days: 30,
  created_at: now,
  updated_at: now,
};

const clientProfile: ClientProfile = {
  id: "profile-layout-baseline",
  user_id: "user-layout-baseline",
  company_name_th: "Layout Baseline Company Limited",
  company_name_en: "Layout Baseline Co., Ltd.",
  tax_id: "0105566778899",
  address: "123 Fixed Template Avenue, Bang Rak, Bangkok 10500",
  phone: "02-123-4567",
  contact_name: "Finance Team",
  logo_url: image("LOGO", "#1f6feb"),
  logo_size: "rectangle",
  vat_registered: true,
  vat_rate: 7,
  default_wht_rate: "3",
  credit_term_days: 30,
  stock_deduct_trigger: "invoice",
  pdf_template: "modern",
  classic_terms:
    "Payment is due within the stated credit term.\nPlease quote invoice number with payment.\nGoods remain company property until paid in full.",
  bank_name: "Baseline Bank",
  bank_account: "123-4-56789-0",
  signature_url: image("SIGN", "#475467"),
  stamp_url: image("PAID", "#dc2626"),
  dev_mode_enabled: false,
  dev_effective_date: null,
  created_at: now,
  updated_at: now,
};

const documentData: Document = {
  id: "document-layout-baseline",
  user_id: "user-layout-baseline",
  deal_id: "deal-layout-baseline",
  customer_id: customer.id,
  doc_type: "invoice",
  doc_number: "INV-2026-07-001",
  status: "sent",
  issue_date: "2026-07-01",
  due_date: "2026-07-31",
  vat_registered: true,
  vat_rate: 7,
  wht_rate: 3,
  discount_percent: 5,
  discount_amount: 475,
  subtotal: 9025,
  vat_amount: 631.75,
  total_amount: 9656.75,
  wht_amount: 270.75,
  net_payable: 9386,
  note: "Deliver during business hours only.\nContact accounting before collection.",
  payment_method: "bank_transfer",
  wht_certificate_no: "WHT-2026-001",
  paid_at: null,
  amount_received: null,
  backdated_at: null,
  backdated_by_user_id: null,
  backdated_reason: null,
  voided_at: null,
  voided_reason: null,
  copied_from_id: null,
  converted_from_id: null,
  created_at: now,
  updated_at: now,
  customer,
};

const lineItems: DocumentLineItem[] = [
  {
    id: "line-1",
    document_id: documentData.id,
    user_id: documentData.user_id,
    item_id: "item-1",
    item_name: "Monthly platform subscription",
    line_note: "Includes standard support and reporting.",
    item_sku: "SUB-001",
    item_type: "service",
    unit: "month",
    unit_price: 4500,
    quantity: 1,
    base_quantity: 1,
    discount_percent: 0,
    discount_amount: 0,
    qty_carton: null,
    carton_unit: null,
    source_document_id: null,
    source_line_item_id: null,
    line_total: 4500,
    sort_order: 1,
    created_at: now,
  },
  {
    id: "line-2",
    document_id: documentData.id,
    user_id: documentData.user_id,
    item_id: "item-2",
    item_name: "Implementation and onboarding package",
    line_note: "Two setup sessions\nOne migration checklist",
    item_sku: "SERV-ONB",
    item_type: "service",
    unit: "package",
    unit_price: 3200,
    quantity: 1,
    base_quantity: 1,
    discount_percent: 10,
    discount_amount: 320,
    qty_carton: null,
    carton_unit: null,
    source_document_id: null,
    source_line_item_id: null,
    line_total: 2880,
    sort_order: 2,
    created_at: now,
  },
  {
    id: "line-3",
    document_id: documentData.id,
    user_id: documentData.user_id,
    item_id: "item-3",
    item_name: "Warehouse label rolls",
    line_note: null,
    item_sku: "LBL-ROLL",
    item_type: "product",
    unit: "roll",
    unit_price: 550,
    quantity: 4,
    base_quantity: 4,
    discount_percent: 0,
    discount_amount: 0,
    qty_carton: null,
    carton_unit: null,
    source_document_id: "delivery-note-1",
    source_line_item_id: null,
    line_total: 2200,
    sort_order: 3,
    created_at: now,
  },
  {
    id: "line-4",
    document_id: documentData.id,
    user_id: documentData.user_id,
    item_id: "item-4",
    item_name: "Adjustment credit for prior service window",
    line_note: null,
    item_sku: "ADJ",
    item_type: "service",
    unit: "item",
    unit_price: -80,
    quantity: 1,
    base_quantity: 1,
    discount_percent: 0,
    discount_amount: 0,
    qty_carton: null,
    carton_unit: null,
    source_document_id: null,
    source_line_item_id: null,
    line_total: -80,
    sort_order: 4,
    created_at: now,
  },
];

const invoiceDeliveryNotes: InvoiceDeliveryNote[] = [
  {
    id: "invoice-delivery-note-1",
    invoice_id: documentData.id,
    delivery_note_id: "delivery-note-1",
    user_id: documentData.user_id,
    delivery_note_number: "DN-2026-07-001",
    issue_date: "2026-06-28",
    subtotal: 2200,
    vat_amount: 154,
    total_amount: 2354,
    released_at: null,
    created_at: now,
  },
];

const data = (template: HtmlPrintTemplate): PrintDocumentData => ({
  document: documentData,
  lineItems,
  billingNoteInvoices: [] as BillingNoteInvoice[],
  invoiceDeliveryNotes,
  clientProfile: { ...clientProfile, pdf_template: template },
  customer,
  template,
  lineDiscountTotal: 320,
  grossSubtotal: 9820,
  lineDeliveryNoteMap: {
    "line-3": { number: "DN-2026-07-001", issue_date: "2026-06-28" },
  },
  showInlineDeliveryNotes: true,
  receiptInvoices: [],
  isDeliveryNoteSummaryInvoice: false,
  invoiceNumberMap: {},
});


// --- "many" fixture: 30 lines to exercise multi-page pagination ---
// Mix of long names (wrapping), multi-line notes, discounts, and DN-variance
// sub-lines (show_dn_variance + source refs with changed qty/price).
const manyDns = ["DN-MANY-001", "DN-MANY-002", "DN-MANY-003"];
const manyLineItems: DocumentLineItem[] = [];
manyDns.forEach((dn, di) => {
  for (let j = 0; j < 10; j++) {
    const n = di * 10 + j + 1;
    const longName = n % 3 === 0;
    const withNote = n % 2 === 0;
    const withDiscount = n % 4 === 0;
    const changed = n % 5 === 0;
    const qty = changed ? Math.max(1, 3 - (n % 2)) : 3;
    const price = 100 + n;
    manyLineItems.push({
      id: `many-line-${n}`,
      document_id: "doc-many",
      user_id: "user-layout-baseline",
      item_id: `item-${n}`,
      item_name: longName
        ? `Industrial packaging solution with extended specification line item number ${n} for warehouse operations`
        : `E2E many-lines item ${n}`,
      line_note: withNote ? `Batch note for item ${n}\nSecond note line with additional handling instructions` : null,
      item_sku: `MANY-${String(n).padStart(3, "0")}`,
      item_type: "product",
      unit: "ชิ้น",
      unit_price: price,
      quantity: qty,
      base_quantity: qty,
      discount_percent: withDiscount ? 5 : 0,
      discount_amount: withDiscount ? Math.round(price * qty * 5) / 100 : 0,
      qty_carton: null,
      carton_unit: null,
      source_document_id: `dn-many-${di + 1}`,
      source_line_item_id: `dn-line-${n}`,
      source_delivered_qty: qty + (changed ? 1 : 0),
      source_unit_price: price + (changed && n % 10 === 0 ? 20 : 0),
      line_total: Math.round(price * qty * (withDiscount ? 0.95 : 1) * 100) / 100,
      sort_order: n,
      created_at: now,
    });
  }
});

const manyDocumentData: Document = {
  ...documentData,
  id: "doc-many",
  doc_number: "INV-2026-07-MANY",
  show_dn_variance: true,
};

const manyLinks: InvoiceDeliveryNote[] = manyDns.map((dn, di) => ({
  id: `many-link-${di + 1}`,
  invoice_id: "doc-many",
  delivery_note_id: `dn-many-${di + 1}`,
  user_id: "user-layout-baseline",
  delivery_note_number: dn,
  issue_date: `2026-07-${String(20 + di).padStart(2, "0")}`,
  subtotal: 3000 + di * 100,
  vat_amount: 0,
  total_amount: 3000 + di * 100,
  released_at: null,
  created_at: now,
}));

const manyData = (template: HtmlPrintTemplate): PrintDocumentData => ({
  ...data(template),
  document: manyDocumentData,
  lineItems: manyLineItems,
  invoiceDeliveryNotes: manyLinks,
});


const params = new URLSearchParams(window.location.search);
const rawTemplate = params.get("template");
const template: HtmlPrintTemplate =
  rawTemplate === "classic" ? "classic"
  : rawTemplate === "classic_v2" ? "classic_v2"
  : "modern";
const copyType: CopyType =
  params.get("copyType") === "copy" ? "copy" : "original";
const docVariant = params.get("doc") === "many" ? "many" : "base";
const appendixOn = params.get("appendix") === "1";
const fontScalePreset = params.get("fontScale");
const pageModeParam = params.get("pageMode");
const pageMode =
  pageModeParam === "first" || pageModeParam === "continuation" || pageModeParam === "last"
    ? pageModeParam
    : "single";
const baseData = docVariant === "many" ? manyData(template) : data(template);
if (fontScalePreset) {
  baseData.clientProfile = {
    ...baseData.clientProfile,
    classic_v2_font_scale: fontScalePreset,
  };
}
const docFontScale = params.get("docFontScale");
if (docFontScale) {
  baseData.document = { ...baseData.document, print_font_scale: docFontScale };
}
const activeData = appendixOn
  ? { ...baseData, document: { ...baseData.document, dn_appendix: true } }
  : baseData;

document.documentElement.classList.add("print-export-document");
document.body.classList.add("print-export-document");
document.documentElement.dataset.accentMode = "element";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="print-export-stack">
      <div className="print-export-page">
        {template === "classic" ? (
          <PrintDocumentClassic data={activeData} copyType={copyType} />
        ) : template === "classic_v2" ? (
          <PrintDocumentClassicV2 data={activeData} copyType={copyType} pageMode={pageMode} />
        ) : (
          <PrintDocument data={activeData} copyType={copyType} />
        )}
      </div>
      {(() => {
        const { appendix } = applyAppendixToData(activeData);
        return appendix.enabled ? (
          <div className="print-export-page">
            <PrintAppendix data={appendix} template={template} />
          </div>
        ) : null;
      })()}
    </div>
  </React.StrictMode>,
);
