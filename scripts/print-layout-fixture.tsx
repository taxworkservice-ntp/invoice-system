import React from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import { PrintDocument } from "../src/components/print/PrintDocument";
import { PrintDocumentClassic } from "../src/components/print/PrintDocumentClassic";
import { PrintDocumentClassicV2 } from "../src/components/print/PrintDocumentClassicV2";
import { PrintAppendix } from "../src/components/print/PrintAppendix";
import { applyAppendixToData, collapseDeliveryNoteGroups } from "../src/lib/print";
import { formatBuddhistDate } from "../src/lib/dates";
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

// --- "dn" fixture: invoice built from TWO delivery notes (detail mode) ---
// Mirrors what InvoiceFromDeliveryNotesForm saves in detail mode: per DN a
// marker row (ใบส่งของ …, qty 0, unit_price 0, note วันที่ส่งของ) followed by
// that DN's item lines (source_line_item_id set), then standalone lines.
const dnSources = [
  { id: "dn-src-1", number: "DN-2608-001", issue_date: "2026-08-20" },
  { id: "dn-src-2", number: "DN-2608-002", issue_date: "2026-08-25" },
];

const dnDraftLines: DocumentLineItem[] = [
  {
    id: "dn-marker-1", document_id: "doc-dn", user_id: "user-layout-baseline",
    item_id: null, item_name: "ใบส่งของ DN-2608-001",
    line_note: "วันที่ส่งของ: 20/8/2569", item_sku: null, item_type: "service",
    unit: "", unit_price: 0, quantity: 0, base_quantity: null,
    discount_percent: 0, discount_amount: 0, qty_carton: null, carton_unit: null,
    source_document_id: "dn-src-1", source_line_item_id: null,
    source_delivered_qty: null, source_unit_price: null,
    line_total: 0, sort_order: 0, created_at: now,
  },
  {
    id: "dn-line-1", document_id: "doc-dn", user_id: "user-layout-baseline",
    item_id: "item-dn-1", item_name: "กระดาษ A4 Double A 80gsm",
    line_note: "ส่งที่ อาคาร B ชั้น 3", item_sku: "PP-A4-80", item_type: "product",
    unit: "แพ็ค", unit_price: 120, quantity: 10, base_quantity: 10,
    discount_percent: 0, discount_amount: 0, qty_carton: null, carton_unit: null,
    source_document_id: "dn-src-1", source_line_item_id: "src-line-1",
    source_delivered_qty: 10, source_unit_price: 120,
    line_total: 1200, sort_order: 1, created_at: now,
  },
  {
    id: "dn-line-2", document_id: "doc-dn", user_id: "user-layout-baseline",
    item_id: "item-dn-2", item_name: "ปากกาเจล 0.5 หมึกน้ำเงิน",
    line_note: null, item_sku: "PEN-G05", item_type: "product",
    unit: "ด้าม", unit_price: 15, quantity: 24, base_quantity: 24,
    discount_percent: 0, discount_amount: 0, qty_carton: null, carton_unit: null,
    source_document_id: "dn-src-1", source_line_item_id: "src-line-2",
    source_delivered_qty: 24, source_unit_price: 15,
    line_total: 360, sort_order: 2, created_at: now,
  },
  {
    id: "dn-marker-2", document_id: "doc-dn", user_id: "user-layout-baseline",
    item_id: null, item_name: "ใบส่งของ DN-2608-002",
    line_note: "วันที่ส่งของ: 25/8/2569", item_sku: null, item_type: "service",
    unit: "", unit_price: 0, quantity: 0, base_quantity: null,
    discount_percent: 0, discount_amount: 0, qty_carton: null, carton_unit: null,
    source_document_id: "dn-src-2", source_line_item_id: null,
    source_delivered_qty: null, source_unit_price: null,
    line_total: 0, sort_order: 3, created_at: now,
  },
  {
    id: "dn-line-3", document_id: "doc-dn", user_id: "user-layout-baseline",
    item_id: "item-dn-3", item_name: "กล่องกระดาษชนิดพับ (ขนาดกลาง)",
    line_note: null, item_sku: "BOX-M", item_type: "product",
    unit: "กล่อง", unit_price: 88, quantity: 5, base_quantity: 5,
    discount_percent: 0, discount_amount: 0, qty_carton: null, carton_unit: null,
    source_document_id: "dn-src-2", source_line_item_id: "src-line-3",
    source_delivered_qty: 5, source_unit_price: 88,
    line_total: 440, sort_order: 4, created_at: now,
  },
  {
    id: "dn-line-4", document_id: "doc-dn", user_id: "user-layout-baseline",
    item_id: null, item_name: "ค่าจัดส่ง",
    line_note: null, item_sku: null, item_type: "service",
    unit: "งาน", unit_price: 100, quantity: 1, base_quantity: 1,
    discount_percent: 0, discount_amount: 0, qty_carton: null, carton_unit: null,
    source_document_id: null, source_line_item_id: null,
    source_delivered_qty: null, source_unit_price: null,
    line_total: 100, sort_order: 5, created_at: now,
  },
] as unknown as DocumentLineItem[];

const dnSubtotal = 2100;
const dnDocumentData: Document = {
  ...documentData,
  id: "doc-dn",
  doc_number: "INV-2026-08-DN",
  issue_date: "2026-08-31",
  due_date: "2026-09-30",
  discount_percent: 0,
  discount_amount: 0,
  subtotal: dnSubtotal,
  vat_amount: Math.round(dnSubtotal * 7) / 100,
  total_amount: dnSubtotal + Math.round(dnSubtotal * 7) / 100,
  wht_rate: 0,
  wht_amount: 0,
  net_payable: dnSubtotal + Math.round(dnSubtotal * 7) / 100,
  task_name: "งานติดตั้งไฟโรงงาน A",
  customer_po_number: "PO-2569-001",
  note: null,
};

const dnLinks: InvoiceDeliveryNote[] = [
  {
    id: "dn-link-1", invoice_id: "doc-dn", delivery_note_id: "dn-src-1",
    user_id: "user-layout-baseline", delivery_note_number: "DN-2608-001",
    issue_date: "2026-08-20", subtotal: 1560, vat_amount: 109.2,
    total_amount: 1669.2, released_at: null, created_at: now,
  },
  {
    id: "dn-link-2", invoice_id: "doc-dn", delivery_note_id: "dn-src-2",
    user_id: "user-layout-baseline", delivery_note_number: "DN-2608-002",
    issue_date: "2026-08-25", subtotal: 440, vat_amount: 30.8,
    total_amount: 470.8, released_at: null, created_at: now,
  },
];

const dnSourceById = new Map(dnSources.map((s) => [s.id, s]));
const dnLineDeliveryNoteMap = Object.fromEntries(
  dnDraftLines
    .filter((l) => l.source_document_id)
    .map((l) => {
      const src = dnSourceById.get(l.source_document_id!)!;
      return [l.id, { number: src.number, issue_date: src.issue_date }];
    }),
);

// --- "qt" fixture: quotation with per-line example photos (classic V2) ---
const qtImageSvg = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <rect width="640" height="480" fill="#eef2f7"/>
    <rect x="60" y="120" width="300" height="220" fill="#378ADD" opacity="0.8"/>
    <rect x="420" y="180" width="160" height="160" fill="#f59e0b" opacity="0.8"/>
    <text x="320" y="440" font-family="Arial" font-size="28" fill="#475467" text-anchor="middle">ตัวอย่างงานติดตั้ง</text>
  </svg>`,
)}`;

const qtLines: DocumentLineItem[] = [
  {
    id: "qt-line-1", document_id: "doc-qt", user_id: "user-layout-baseline",
    item_id: null, item_name: "งานติดตั้งไฟโรงงาน A (โครงสร้างครบชุด)",
    line_note: "ตัวอย่างผลงานจากโครงการก่อนหน้า", item_sku: null, item_type: "service",
    unit: "งาน", unit_price: 35000, quantity: 1, base_quantity: 1,
    discount_percent: 0, discount_amount: 0, qty_carton: null, carton_unit: null,
    source_document_id: null, source_line_item_id: null,
    source_delivered_qty: null, source_unit_price: null,
    image_url: qtImageSvg,
    line_total: 35000, sort_order: 1, created_at: now,
  },
  {
    id: "qt-line-2", document_id: "doc-qt", user_id: "user-layout-baseline",
    item_id: null, item_name: "งานทาสีอาคาร (2 ชั้น)",
    line_note: null, item_sku: null, item_type: "service",
    unit: "ตร.ม.", unit_price: 120, quantity: 400, base_quantity: 400,
    discount_percent: 0, discount_amount: 0, qty_carton: null, carton_unit: null,
    source_document_id: null, source_line_item_id: null,
    source_delivered_qty: null, source_unit_price: null,
    image_url: null,
    line_total: 48000, sort_order: 2, created_at: now,
  },
] as unknown as DocumentLineItem[];

const qtSubtotal = 83000;
const qtDocument: Document = {
  ...documentData,
  id: "doc-qt",
  doc_type: "quotation",
  doc_number: "QT-2026-09-001",
  issue_date: "2026-09-02",
  due_date: null,
  wht_rate: 0,
  wht_amount: 0,
  subtotal: qtSubtotal,
  vat_amount: Math.round(qtSubtotal * 7) / 100,
  total_amount: qtSubtotal + Math.round(qtSubtotal * 7) / 100,
  net_payable: qtSubtotal + Math.round(qtSubtotal * 7) / 100,
  note: null,
};

const qtData = (template: HtmlPrintTemplate): PrintDocumentData => ({
  ...data(template),
  document: qtDocument,
  lineItems: qtLines,
  invoiceDeliveryNotes: [],
  lineDeliveryNoteMap: {},
  showInlineDeliveryNotes: false,
});

const dnData = (template: HtmlPrintTemplate): PrintDocumentData => ({
  ...data(template),
  document: dnDocumentData,
  lineItems: dnDraftLines,
  invoiceDeliveryNotes: dnLinks,
  lineDeliveryNoteMap: dnLineDeliveryNoteMap as PrintDocumentData["lineDeliveryNoteMap"],
  showInlineDeliveryNotes: true,
});


const params = new URLSearchParams(window.location.search);
const rawTemplate = params.get("template");
const template: HtmlPrintTemplate =
  rawTemplate === "classic" ? "classic"
  : rawTemplate === "classic_v2" ? "classic_v2"
  : "modern";
const copyType: CopyType =
  params.get("copyType") === "copy" ? "copy" : "original";
const docVariant =
  params.get("doc") === "many" ? "many"
  : params.get("doc") === "dn" ? "dn"
  : params.get("doc") === "qt" ? "qt"
  : "base";
const appendixOn = params.get("appendix") === "1";
const fontScalePreset = params.get("fontScale");
const pageModeParam = params.get("pageMode");
const pageMode =
  pageModeParam === "first" || pageModeParam === "continuation" || pageModeParam === "last"
    ? pageModeParam
    : "single";
const baseData = docVariant === "many" ? manyData(template) : docVariant === "dn" ? dnData(template) : docVariant === "qt" ? qtData(template) : data(template);
// โหมดอ้างอิง (classic V2):
//   refCollapse=1 → pass the refCollapse prop — DN reference table replaces
//                   the items table (the PDF-export path, เหมือนใบวางบิล)
//   refCollapse=lines → collapse each DN group to one items-table row via the
//                   real collapseDeliveryNoteGroups (kept for lib regression)
const refCollapseParam = params.get("refCollapse");
const refCollapseProp =
  refCollapseParam === "1" && template === "classic_v2" &&
  baseData.document.doc_type === "invoice" && baseData.invoiceDeliveryNotes.length > 0;
const collapsedLineItems =
  refCollapseParam === "lines" && template === "classic_v2"
    ? collapseDeliveryNoteGroups(baseData.lineItems, (marker) => {
        const key = marker.source_document_id || "";
        const dnRef = key
          ? baseData.invoiceDeliveryNotes.find((dn) => dn.delivery_note_id === key)
          : undefined;
        return dnRef?.issue_date ? formatBuddhistDate(dnRef.issue_date) : null;
      })
    : null;
const activeBaseData = collapsedLineItems
  ? { ...baseData, lineItems: collapsedLineItems }
  : baseData;
if (fontScalePreset) {
  activeBaseData.clientProfile = {
    ...activeBaseData.clientProfile,
    classic_v2_font_scale: fontScalePreset,
  };
}
if (params.get("noCompanyName") === "1") {
  activeBaseData.clientProfile = {
    ...activeBaseData.clientProfile,
    show_company_name: false,
  };
}
if (params.get("logoLayout") === "above") {
  activeBaseData.clientProfile = {
    ...activeBaseData.clientProfile,
    logo_layout: "above",
  };
}
const docFontScale = params.get("docFontScale");
if (docFontScale) {
  activeBaseData.document = { ...activeBaseData.document, print_font_scale: docFontScale };
}
const typeDoc = params.get("typeDoc");
const typeItems = params.get("typeItems");
const typeNum = params.get("typeNum");
const typeThead = params.get("typeThead");
if (typeDoc) {
  activeBaseData.document = { ...activeBaseData.document, doc_type: typeDoc as Document["doc_type"] };
  if (typeItems || typeNum || typeThead) {
    activeBaseData.clientProfile = {
      ...activeBaseData.clientProfile,
      classic_v2_type_font_scales: {
        [typeDoc]: {
          ...(typeItems ? { items: typeItems } : {}),
          ...(typeNum ? { num: typeNum } : {}),
          ...(typeThead ? { thead: typeThead } : {}),
        },
      },
    };
  }
}
if (params.get("hideEn") === "1") {
  activeBaseData.clientProfile = {
    ...activeBaseData.clientProfile,
    classic_v2_hide_english_labels: true,
  };
}
if (params.get("compactSig") === "1") {
  activeBaseData.clientProfile = {
    ...activeBaseData.clientProfile,
    classic_v2_compact_signature: true,
  };
}
const activeData = appendixOn
  ? { ...activeBaseData, document: { ...activeBaseData.document, dn_appendix: true } }
  : activeBaseData;

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
          <PrintDocumentClassicV2 data={activeData} copyType={copyType} pageMode={pageMode} refCollapse={refCollapseProp} />
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
