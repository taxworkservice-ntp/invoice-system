import jsPDF from "jspdf";
import type { Document, DocumentLineItem, BillingNoteInvoice, ClientProfile, Customer, DocumentType } from "../types";
import { DOC_TYPE_SHORT, PAYMENT_METHOD_LABELS } from "../constants";
import { documentTypeLabel } from "./docLabels";
import { round2 } from "./tax";
import { loadThaiFont } from "./fonts";
import { thaiNumberToWords } from "./thaiNumberToWords";

const MARGIN = 15;
const CONTENT_W = 180;
const CONTENT_RIGHT = MARGIN + CONTENT_W;
const PAGE_W = 210;
const PAGE_H = 297;
const FOOTER_RESERVED = 50;
const LEFT_INFO_W = 88;
const META_LABEL_X = CONTENT_RIGHT - 42;
const META_VALUE_X = CONTENT_RIGHT;
const SUMMARY_BOX_W = 80;
const SUMMARY_BOX_X = CONTENT_RIGHT - SUMMARY_BOX_W;

interface TemplateStyle {
  name: string;
  accent: string;
  accentLight: string;
  dark: string;
  medium: string;
  light: string;
  subtle: string;
  divider: string;
  headerBg: string;
  rowAlt: string;
  titleSize: number;
  headerPattern: "solid" | "line" | "clean";
  showDocBorder: boolean;
  docBorderColor: string;
}

const TEMPLATES: Record<string, TemplateStyle> = {
  classic: {
    name: "คลาสสิก",
    accent: "#378ADD",
    accentLight: "#E6F1FB",
    dark: "#1A1A18",
    medium: "#444444",
    light: "#888888",
    subtle: "#AAAAAA",
    divider: "#CCCCCC",
    headerBg: "#F7F6F3",
    rowAlt: "#FAFAFA",
    titleSize: 14,
    headerPattern: "clean",
    showDocBorder: false,
    docBorderColor: "#CCCCCC",
  },
  modern: {
    name: "โมเดิร์น",
    accent: "#5B6B7F",
    accentLight: "#F4F6F8",
    dark: "#2C3E50",
    medium: "#5D6D7E",
    light: "#95A5A6",
    subtle: "#BDC3C7",
    divider: "#ECF0F1",
    headerBg: "#FFFFFF",
    rowAlt: "#FBFCFC",
    titleSize: 16,
    headerPattern: "line",
    showDocBorder: true,
    docBorderColor: "#ECF0F1",
  },

};

export interface PDFData {
  document: Document;
  lineItems: DocumentLineItem[];
  billingNoteInvoices: BillingNoteInvoice[];
  clientProfile: ClientProfile;
  customer: Customer;
  referenceDoc?: Document;
  logoImage?: string | null;
}

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatAmount(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDatePDF(isoDate: string): string {
  if (!isoDate) return "-";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

function getTemplate(data: PDFData): TemplateStyle {
  const tpl = data.clientProfile.pdf_template || "classic";
  return TEMPLATES[tpl] || TEMPLATES.classic;
}

function drawDivider(doc: jsPDF, y: number, style: TemplateStyle, full: boolean = true): void {
  doc.setDrawColor(style.divider);
  doc.setLineWidth(0.1);
  if (full) {
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  }
}

function drawSectionLabel(doc: jsPDF, label: string, x: number, y: number, align: "left" | "right" = "left"): void {
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(8);
  doc.setTextColor("#888888");
  doc.text(label, x, y, { align });
}

function drawMetaRow(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
  style: TemplateStyle,
  options?: {
    labelX?: number;
    valueX?: number;
    valueFont?: "normal" | "bold";
    valueSize?: number;
    gapAfter?: number;
  },
): number {
  const labelX = options?.labelX ?? META_LABEL_X;
  const valueX = options?.valueX ?? META_VALUE_X;
  const gapAfter = options?.gapAfter ?? 5;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  doc.text(label, labelX, y, { align: "right" });

  doc.setFont("Sarabun", options?.valueFont ?? "normal");
  doc.setFontSize(options?.valueSize ?? 8);
  doc.setTextColor(style.dark);
  doc.text(value, valueX, y, { align: "right" });

  return y + gapAfter;
}

function drawSummaryRow(
  doc: jsPDF,
  label: string,
  value: string,
  labelX: number,
  valueX: number,
  y: number,
  style: TemplateStyle,
  valueFont: "normal" | "bold" = "normal",
  valueSize: number = 8,
): number {
  const textY = y + 2;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  doc.text(label, labelX, textY);

  doc.setFont("Sarabun", valueFont);
  doc.setFontSize(valueSize);
  doc.setTextColor(style.dark);
  doc.text(value, valueX, textY, { align: "right" });

  return y + 8;
}

function checkPageBreak(doc: jsPDF, currentY: number, neededHeight: number): number {
  if (currentY + neededHeight > PAGE_H - FOOTER_RESERVED) {
    doc.addPage();
    return MARGIN;
  }
  return currentY;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function convertLogoToPDF(logoUrl: string): Promise<string | null> {
  if (logoUrl.startsWith("http")) {
    return fetch(logoUrl)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
      )
      .catch(() => null);
  }

  return import("./r2").then(({ getR2PresignedUrl }) =>
    getR2PresignedUrl(logoUrl)
      .then((url) => fetch(url))
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
      )
      .catch(() => null)
  );
}

function drawDocBorder(doc: jsPDF, style: TemplateStyle, startY: number, endY: number): void {
  if (!style.showDocBorder) return;
  doc.setDrawColor(style.docBorderColor);
  doc.setLineWidth(0.3);
  const s = 5;
  doc.rect(MARGIN - s, startY - 2, CONTENT_W + s * 2, endY - startY + 4, "D");
}

// ── ZONE 1: HEADER ──
async function drawHeader(doc: jsPDF, data: PDFData, startY: number): Promise<number> {
  const { clientProfile, document, logoImage } = data;
  const style = getTemplate(data);
  let y = startY;
  const metaLabelX = MARGIN + CONTENT_W - 42;
  const metaValueX = MARGIN + CONTENT_W;

  let logoDataUrl: string | null = logoImage || null;
  if (!logoDataUrl && clientProfile.logo_url) {
    logoDataUrl = await convertLogoToPDF(clientProfile.logo_url);
  }

  const label = documentTypeLabel(document.doc_type, document.vat_registered);

  // ── Decorative header bar (solid template only) ──
  if (style.headerPattern === "solid") {
    const barH = 24;
    doc.setFillColor(style.headerBg);
    doc.rect(MARGIN - 4, y, CONTENT_W + 8, barH, "F");
    y += 3;

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", MARGIN + 2, y, 20, 16);
      } catch {}
    }

    doc.setFont("Sarabun", "bold");
    doc.setFontSize(logoDataUrl ? 11 : 12);
    doc.setTextColor("#FFFFFF");
    doc.text(
      clientProfile.company_name_th,
      logoDataUrl ? MARGIN + 26 : MARGIN + 4,
      y + 8
    );

    doc.setFont("Sarabun", "bold");
    doc.setFontSize(style.titleSize);
    doc.setTextColor("#FFFFFF");
    doc.text(label.thai, MARGIN + CONTENT_W - 4, y + 9, { align: "right" });

    y += barH - 1;
    y += 6;
  }

  // ── Logo (classic / modern) ──
  if (style.headerPattern !== "solid" && logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", MARGIN, y, 25, 20);
    } catch {}
    y += 22;
  }

  // ── Left column: company info ──
  const leftX = MARGIN;
  let leftY = (style.headerPattern !== "solid" && logoDataUrl) ? y - 2 : y;

  // For solid template, skip company name (already shown in bar) but show rest
  const showLeftCompany = style.headerPattern !== "solid";

  if (showLeftCompany) {
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(logoDataUrl ? 11 : style.titleSize);
    doc.setTextColor(style.dark);
    doc.text(clientProfile.company_name_th, leftX, leftY);
    leftY += logoDataUrl ? 6 : 8;

    if (clientProfile.company_name_en) {
      doc.setFont("Sarabun", "normal");
      doc.setFontSize(logoDataUrl ? 9 : 10);
      doc.setTextColor(style.medium);
      doc.text(clientProfile.company_name_en, leftX, leftY);
      leftY += 5;
    }
  }

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);

  if (clientProfile.address) {
    const lines = doc.splitTextToSize(clientProfile.address, 90);
    doc.text(lines, leftX, leftY);
    leftY += lines.length * 4;
  }

  if (clientProfile.tax_id) {
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(style.dark);
    doc.text(`เลขประจำตัวผู้เสียภาษี: ${clientProfile.tax_id}`, leftX, leftY);
    leftY += 6;
  } else if ((document.doc_type === "invoice" || document.doc_type === "tax_invoice_receipt") && document.vat_registered) {
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#C0392B");
    doc.text("เลขผู้เสียภาษี: [กรุณาตั้งค่า]", leftX, leftY);
    leftY += 6;
  }

  if (clientProfile.phone) {
    doc.text(clientProfile.phone, leftX, leftY);
    leftY += 5;
  }

  // ── Right column: document meta ──
  let rightY = startY;

  if (style.headerPattern === "line") {
    doc.setDrawColor(style.accent);
    doc.setLineWidth(1);
    doc.line(MARGIN + CONTENT_W - 55, rightY, MARGIN + CONTENT_W, rightY);
    rightY += 3;
  }

  // Doc type label (skip for solid — already in bar)
  if (style.headerPattern !== "solid") {
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(style.titleSize + 2);
    doc.setTextColor(style.dark);
    doc.text(label.thai, MARGIN + CONTENT_W, rightY, { align: "right" });
    rightY += 8;

    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(style.light);
    doc.text(label.en, MARGIN + CONTENT_W, rightY, { align: "right" });
    rightY += 4;

    if (document.doc_type === "delivery_note") {
      doc.setFont("Sarabun", "bold");
      doc.setFontSize(8);
      doc.setTextColor("#C0392B");
      doc.text("NOT A TAX INVOICE", MARGIN + CONTENT_W, rightY, { align: "right" });
      rightY += 5;
    }
    rightY += 5;
  }

  if (document.doc_number) {
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(8);
    doc.setTextColor(style.medium);
    doc.text("เลขที่:", MARGIN + CONTENT_W - 45, rightY, { align: "right" });
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(9);
    doc.setTextColor(style.dark);
    doc.text(document.doc_number, MARGIN + CONTENT_W, rightY, { align: "right" });
    rightY += 6;
  }

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  doc.text("วันที่:", MARGIN + CONTENT_W - 35, rightY, { align: "right" });
  doc.text(formatDatePDF(document.issue_date), MARGIN + CONTENT_W, rightY, { align: "right" });
  rightY += 5;

  switch (document.doc_type) {
    case "quotation":
      if (document.due_date) {
        doc.text("วันหมดอายุ:", MARGIN + CONTENT_W - 35, rightY, { align: "right" });
        doc.text(formatDatePDF(document.due_date), MARGIN + CONTENT_W, rightY, { align: "right" });
        rightY += 5;
      }
      break;
    case "invoice":
      if (document.due_date) {
        doc.text("ครบกำหนด:", MARGIN + CONTENT_W - 35, rightY, { align: "right" });
        doc.text(formatDatePDF(document.due_date), MARGIN + CONTENT_W, rightY, { align: "right" });
        rightY += 5;
      }
      break;
    case "billing_note":
      if (document.due_date) {
        doc.text("ครบกำหนดชำระ:", MARGIN + CONTENT_W - 35, rightY, { align: "right" });
        doc.text(formatDatePDF(document.due_date), MARGIN + CONTENT_W, rightY, { align: "right" });
        rightY += 5;
      }
      break;
    case "receipt":
      if (document.paid_at) {
        doc.text("วันที่รับเงิน:", MARGIN + CONTENT_W - 35, rightY, { align: "right" });
        doc.text(formatDatePDF(document.paid_at), MARGIN + CONTENT_W, rightY, { align: "right" });
        rightY += 5;
      }
      break;
    case "credit_note":
      if (data.referenceDoc?.doc_number) {
        doc.text("อ้างอิง:", MARGIN + CONTENT_W - 35, rightY, { align: "right" });
        doc.text(data.referenceDoc.doc_number, MARGIN + CONTENT_W, rightY, { align: "right" });
        rightY += 5;
      }
      break;
  }

  const headerBottom = Math.max(leftY, rightY);
  y = headerBottom + 3;

  // ── Divider between header and body ──
  if (style.headerPattern === "solid") {
    doc.setDrawColor(style.accent);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 4;
  } else {
    drawDivider(doc, y, style);
    y += 3;
  }
  return y;
}

// ── ZONE 2: CUSTOMER ──
function drawCustomer(doc: jsPDF, data: PDFData, startY: number): number {
  const { document, customer } = data;
  const style = getTemplate(data);
  const isTaxInvoiceDoc = (document.doc_type === "invoice" || document.doc_type === "tax_invoice_receipt") && document.vat_registered;

  let y = startY;

  drawSectionLabel(doc, "ลูกค้า / Bill To", MARGIN, y);
  y += 6;

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(10);
  doc.setTextColor(style.dark);
  doc.text(customer.name, MARGIN, y);
  y += 6;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);

  if (customer.tax_id) {
    doc.text(`เลขผู้เสียภาษี: ${customer.tax_id}`, MARGIN, y);
    y += 5;
  } else if (isTaxInvoiceDoc) {
    doc.text("เลขผู้เสียภาษี: -", MARGIN, y);
    y += 5;
  }

  if (customer.address) {
    const lines = doc.splitTextToSize(customer.address, CONTENT_W);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4;
  }

  if (customer.phone) {
    doc.text(customer.phone, MARGIN, y);
    y += 5;
  }

  y += 5;
  drawDivider(doc, y, style);
  return y + 3;
}

// ── ZONE 3: REFERENCE ──
function drawReference(doc: jsPDF, data: PDFData, startY: number): number {
  const { document } = data;
  const style = getTemplate(data);
  let y = startY;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);

  if (document.doc_type === "delivery_note" && data.referenceDoc?.doc_number) {
    doc.text("อ้างอิงใบแจ้งหนี้:", MARGIN, y);
    doc.setFont("Sarabun", "bold");
    doc.setTextColor(style.dark);
    doc.text(data.referenceDoc.doc_number, MARGIN + 40, y);
  } else if (document.doc_type === "credit_note" && data.referenceDoc?.doc_number) {
    doc.text("อ้างอิงใบแจ้งหนี้เดิม:", MARGIN, y);
    doc.setFont("Sarabun", "bold");
    doc.setTextColor(style.dark);
    doc.text(data.referenceDoc.doc_number, MARGIN + 45, y);
  } else {
    return startY;
  }

  y += 8;
  drawDivider(doc, y, style);
  return y + 3;
}

// ── ZONE 4: ITEMS TABLE ──
function drawTableHeader(
  doc: jsPDF,
  y: number,
  columns: { x: number; w: number; label: string; align?: string }[],
  style: TemplateStyle
): number {
  const rowH = 8;

  if (style.headerPattern === "solid") {
    doc.setFillColor(hexToRgb(style.accentLight)[0], hexToRgb(style.accentLight)[1], hexToRgb(style.accentLight)[2]);
    doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
  } else if (style.headerPattern === "line") {
    doc.setDrawColor(style.divider);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
  } else {
    doc.setFillColor(247, 246, 243);
    doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
  }

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);

  for (const col of columns) {
    const x = col.align === "right" ? col.x + col.w
      : col.align === "center" ? col.x + col.w / 2
      : col.x + 2;
    doc.text(col.label, x, y + 5.5, {
      align: (col.align || "left") as "left" | "center" | "right" | "justify",
    });
  }

  return y + rowH;
}

function drawItemsTable(doc: jsPDF, data: PDFData, startY: number): number {
  const { document, lineItems, billingNoteInvoices } = data;
  const style = getTemplate(data);
  let y = startY;

  if (document.doc_type === "billing_note" || document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") {
    const cols = [
      { x: MARGIN, w: 10, label: "ลำดับ", align: "center" as const },
      { x: MARGIN + 10, w: 45, label: "เลขที่ใบแจ้งหนี้" },
      { x: MARGIN + 55, w: 30, label: "วันที่", align: "center" as const },
      { x: MARGIN + 85, w: 30, label: "ราคาก่อน VAT", align: "right" as const },
      { x: MARGIN + 115, w: 25, label: "VAT", align: "right" as const },
      { x: MARGIN + 140, w: 40, label: "รวม", align: "right" as const },
    ];

    y = drawTableHeader(doc, y, cols, style);
    const items = billingNoteInvoices.length > 0 ? billingNoteInvoices : [];

    for (let i = 0; i < items.length; i++) {
      const inv = items[i];
      y = checkPageBreak(doc, y, 7);
      if (y === MARGIN) y = drawTableHeader(doc, y, cols, style);

      if (i % 2 === 1) {
        doc.setFillColor(style.rowAlt);
        doc.rect(MARGIN, y, CONTENT_W, 7, "F");
      }

      doc.setFont("Sarabun", "normal");
      doc.setFontSize(8);
      doc.setTextColor(style.dark);

      doc.text(String(i + 1), cols[0].x + cols[0].w / 2, y + 5, { align: "center" });
      doc.text(inv.invoice_number, cols[1].x + 2, y + 5);
      doc.text(inv.issue_date ? formatDatePDF(inv.issue_date) : "-", cols[2].x + cols[2].w / 2, y + 5, { align: "center" });
      doc.text(formatAmount(inv.subtotal), cols[3].x + cols[3].w, y + 5, { align: "right" });
      doc.text(formatAmount(inv.vat_amount), cols[4].x + cols[4].w, y + 5, { align: "right" });
      doc.text(formatAmount(inv.total_amount), cols[5].x + cols[5].w, y + 5, { align: "right" });

      doc.setDrawColor(style.divider);
      doc.setLineWidth(0.05);
      doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7);
      y += 7;
    }
    return y;
  }

  const isDeliveryNote = document.doc_type === "delivery_note";

  const cols = isDeliveryNote
    ? [
        { x: MARGIN, w: 10, label: "ลำดับ", align: "center" as const },
        { x: MARGIN + 10, w: 110, label: "รายการ" },
        { x: MARGIN + 120, w: 30, label: "จำนวน", align: "center" as const },
        { x: MARGIN + 150, w: 30, label: "หน่วย", align: "center" as const },
      ]
    : [
        { x: MARGIN, w: 10, label: "ลำดับ", align: "center" as const },
        { x: MARGIN + 10, w: 75, label: "รายการ" },
        { x: MARGIN + 85, w: 20, label: "จำนวน", align: "center" as const },
        { x: MARGIN + 105, w: 15, label: "หน่วย", align: "center" as const },
        { x: MARGIN + 120, w: 25, label: "ราคา/หน่วย", align: "right" as const },
        { x: MARGIN + 145, w: 35, label: "จำนวนเงิน", align: "right" as const },
      ];

  y = drawTableHeader(doc, y, cols, style);
  let subtotalSum = 0;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const itemLabel =
      item.discount_amount > 0
        ? `${item.item_name}\nDiscount ${formatAmount(item.discount_amount)} (${item.discount_percent || 0}%)`
        : item.item_name;
    const descLines = doc.splitTextToSize(itemLabel, cols[1].w - 4);
    const rowH = Math.max(7, descLines.length * 4 + 2);
    y = checkPageBreak(doc, y, rowH);
    if (y === MARGIN) y = drawTableHeader(doc, y, cols, style);

    if (i % 2 === 1) {
      doc.setFillColor(style.rowAlt);
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
    }

    doc.setFont("Sarabun", "normal");
    doc.setFontSize(8);
    doc.setTextColor(style.dark);

    doc.text(String(i + 1), cols[0].x + cols[0].w / 2, y + 5, { align: "center" });

    doc.text(descLines, cols[1].x + 2, y + 5);

    if (isDeliveryNote) {
      doc.text(String(item.quantity), cols[2].x + cols[2].w / 2, y + 5, { align: "center" });
      doc.text(item.unit, cols[3].x + cols[3].w / 2, y + 5, { align: "center" });
    } else {
      doc.text(String(item.quantity), cols[2].x + cols[2].w / 2, y + 5, { align: "center" });
      doc.text(item.unit, cols[3].x + cols[3].w / 2, y + 5, { align: "center" });
      doc.text(formatAmount(item.unit_price), cols[4].x + cols[4].w, y + 5, { align: "right" });
      doc.text(formatAmount(item.line_total), cols[5].x + cols[5].w, y + 5, { align: "right" });
    }

    doc.setDrawColor(style.divider);
    doc.setLineWidth(0.05);
    doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
    y += rowH;
    subtotalSum += item.line_total || 0;
  }

  if (lineItems.length > 0 && !isDeliveryNote) {
    y = checkPageBreak(doc, y, 7);
    const [r, g, b] = style.headerPattern === "solid" ? hexToRgb(style.accentLight) : [247, 246, 243];
    doc.setFillColor(r, g, b);
    doc.rect(MARGIN, y, CONTENT_W, 7, "F");
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(8);
    doc.setTextColor(style.dark);
    doc.text("รวม", MARGIN + 2, y + 5);
    doc.text(formatAmount(subtotalSum), MARGIN + CONTENT_W, y + 5, { align: "right" });
    y += 7;
  }

  return y;
}

// ── ZONE 5: TAX SUMMARY ──
function drawTaxSummary(doc: jsPDF, data: PDFData, startY: number): number {
  const { document } = data;
  const style = getTemplate(data);
  let y = startY + 4;
  y = checkPageBreak(doc, y, estimateTaxSummaryHeight(document));

  const boxX = MARGIN + 100;
  const boxW = 80;
  const rightX = boxX + boxW - 3;
  const labelX = boxX + 3;
  const isTaxInvoiceDoc = (document.doc_type === "invoice" || document.doc_type === "tax_invoice_receipt") && document.vat_registered;
  const boxHeight = estimateTaxSummaryHeight(document) - 4;

  doc.setFillColor(250, 250, 250);
  doc.rect(boxX, y - 4, boxW, boxHeight, "F");
  doc.setDrawColor(style.divider);
  doc.setLineWidth(0.12);
  doc.rect(boxX, y - 4, boxW, boxHeight, "D");

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);

  if (document.vat_registered && document.doc_type !== "delivery_note") {
    doc.setTextColor(style.medium);
    doc.text(isTaxInvoiceDoc ? "ราคาสินค้า/บริการ (ก่อน VAT)" : "ราคารวม (Subtotal)", labelX, y);
    doc.setTextColor(style.dark);
    doc.text(`฿ ${formatAmount(document.subtotal)}`, rightX, y, { align: "right" });
    y += 5;

    if (document.discount_amount > 0) {
      y = drawSummaryRow(
        doc,
        `Discount ${document.discount_percent || 0}%`,
        `-เธฟ ${formatAmount(document.discount_amount)}`,
        labelX,
        rightX,
        y,
        style,
      );
    }

    if (document.vat_amount > 0) {
      doc.setTextColor(style.medium);
      doc.text(isTaxInvoiceDoc ? `ภาษีมูลค่าเพิ่ม ${document.vat_rate}%` : `VAT ${document.vat_rate}%`, labelX, y);
      doc.setTextColor(style.dark);
      doc.text(`฿ ${formatAmount(document.vat_amount)}`, rightX, y, { align: "right" });
      y += 6;
    }

    doc.setDrawColor(style.divider);
    doc.setLineWidth(0.1);
    doc.line(labelX, y - 4, rightX, y - 4);
  }

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  doc.text(isTaxInvoiceDoc ? "รวมทั้งสิ้น (รวม VAT)" : "รวมทั้งสิ้น (Total)", labelX, y);
  doc.setTextColor(style.dark);
  doc.text(`฿ ${formatAmount(document.total_amount)}`, rightX, y, { align: "right" });
  y += 6;

  if (document.wht_amount > 0) {
    doc.setTextColor(style.medium);
    doc.text(`หัก ณ ที่จ่าย ${document.wht_rate}% (WHT)`, labelX, y);
    doc.setTextColor(style.dark);
    doc.text(`-฿ ${formatAmount(document.wht_amount)}`, rightX, y, { align: "right" });
    y += 6;

    doc.setDrawColor(style.divider);
    doc.setLineWidth(0.1);
    doc.line(labelX, y - 4, rightX, y - 4);

    doc.setFont("Sarabun", "bold");
    doc.setFontSize(10);
    doc.setTextColor(style.dark);
    doc.text("ยอดที่ต้องชำระ (Net Payable)", labelX, y);
    doc.text(`฿ ${formatAmount(document.net_payable)}`, rightX, y, { align: "right" });
    y += 7;
  }

  if (document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") {
    y += 3;
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(8);
    doc.setTextColor(style.medium);
    if (document.payment_method) {
      doc.text(`ช่องทางรับเงิน: ${PAYMENT_METHOD_LABELS[document.payment_method] || document.payment_method}`, MARGIN, y);
      y += 5;
    }
    if (document.wht_certificate_no) {
      doc.text(`เลขที่ใบหัก ณ ที่จ่าย: ${document.wht_certificate_no}`, MARGIN, y);
      y += 5;
    }
    if (document.amount_received != null) {
      doc.text(`จำนวนเงินที่รับ: ฿ ${formatAmount(document.amount_received)}`, MARGIN, y);
      y += 5;
    }
  }

  y += 5;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  const targetAmount =
    (document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") && document.amount_received
      ? document.amount_received
      : document.net_payable || document.total_amount;
  doc.text(`จำนวนเงิน (ตัวอักษร): ${thaiNumberToWords(round2(targetAmount))}`, MARGIN, y);
  y += 6;

  return y;
}

async function drawHeaderConsistent(doc: jsPDF, data: PDFData, startY: number): Promise<number> {
  const { clientProfile, document, logoImage } = data;
  const style = getTemplate(data);
  let y = startY;

  let logoDataUrl: string | null = logoImage || null;
  if (!logoDataUrl && clientProfile.logo_url) {
    logoDataUrl = await convertLogoToPDF(clientProfile.logo_url);
  }

  const label = documentTypeLabel(document.doc_type, document.vat_registered);

  if (style.headerPattern === "solid") {
    const barH = 24;
    doc.setFillColor(style.headerBg);
    doc.rect(MARGIN - 4, y, CONTENT_W + 8, barH, "F");
    y += 3;

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", MARGIN + 2, y, 20, 16);
      } catch {}
    }

    doc.setFont("Sarabun", "bold");
    doc.setFontSize(logoDataUrl ? 11 : 12);
    doc.setTextColor("#FFFFFF");
    doc.text(clientProfile.company_name_th, logoDataUrl ? MARGIN + 26 : MARGIN + 4, y + 8);

    doc.setFont("Sarabun", "bold");
    doc.setFontSize(style.titleSize);
    doc.setTextColor("#FFFFFF");
    doc.text(label.thai, CONTENT_RIGHT - 4, y + 9, { align: "right" });

    y += barH + 5;
  }

  if (style.headerPattern !== "solid" && logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", MARGIN, y, 25, 20);
    } catch {}
    y += 22;
  }

  const leftX = MARGIN;
  let leftY = style.headerPattern !== "solid" && logoDataUrl ? y - 2 : y;

  if (style.headerPattern !== "solid") {
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(logoDataUrl ? 11 : style.titleSize);
    doc.setTextColor(style.dark);
    doc.text(clientProfile.company_name_th, leftX, leftY);
    leftY += logoDataUrl ? 6 : 8;

    if (clientProfile.company_name_en) {
      doc.setFont("Sarabun", "normal");
      doc.setFontSize(logoDataUrl ? 9 : 10);
      doc.setTextColor(style.medium);
      doc.text(clientProfile.company_name_en, leftX, leftY);
      leftY += 5;
    }
  }

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);

  if (clientProfile.address) {
    const lines = doc.splitTextToSize(clientProfile.address, LEFT_INFO_W);
    doc.text(lines, leftX, leftY);
    leftY += lines.length * 4;
  }

  if (clientProfile.tax_id) {
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(style.dark);
    doc.text(`เลขประจำตัวผู้เสียภาษี: ${clientProfile.tax_id}`, leftX, leftY);
    leftY += 6;
  } else if ((document.doc_type === "invoice" || document.doc_type === "tax_invoice_receipt") && document.vat_registered) {
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#C0392B");
    doc.text("เลขผู้เสียภาษี: [กรุณาตั้งค่า]", leftX, leftY);
    leftY += 6;
  }

  if (clientProfile.phone) {
    doc.text(clientProfile.phone, leftX, leftY);
    leftY += 5;
  }

  let rightY = startY;
  if (style.headerPattern === "line") {
    doc.setDrawColor(style.accent);
    doc.setLineWidth(1);
    doc.line(CONTENT_RIGHT - 55, rightY, CONTENT_RIGHT, rightY);
    rightY += 3;
  }

  if (style.headerPattern !== "solid") {
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(style.titleSize + 2);
    doc.setTextColor(style.dark);
    doc.text(label.thai, CONTENT_RIGHT, rightY, { align: "right" });
    rightY += 8;

    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(style.light);
    doc.text(label.en, CONTENT_RIGHT, rightY, { align: "right" });
    rightY += 4;

    if (document.doc_type === "delivery_note") {
      doc.setFont("Sarabun", "bold");
      doc.setFontSize(8);
      doc.setTextColor("#C0392B");
      doc.text("NOT A TAX INVOICE", CONTENT_RIGHT, rightY, { align: "right" });
      rightY += 5;
    }
    rightY += 5;
  }

  if (document.doc_number) {
    rightY = drawMetaRow(doc, "เลขที่:", document.doc_number, rightY, style, {
      valueFont: "bold",
      valueSize: 9,
      gapAfter: 6,
    });
  }

  rightY = drawMetaRow(doc, "วันที่:", formatDatePDF(document.issue_date), rightY, style);

  if (document.doc_type === "quotation" && document.due_date) {
    rightY = drawMetaRow(doc, "วันหมดอายุ:", formatDatePDF(document.due_date), rightY, style);
  }
  if (document.doc_type === "invoice" && document.due_date) {
    rightY = drawMetaRow(doc, "ครบกำหนด:", formatDatePDF(document.due_date), rightY, style);
  }
  if (document.doc_type === "billing_note" && document.due_date) {
    rightY = drawMetaRow(doc, "ครบกำหนดชำระ:", formatDatePDF(document.due_date), rightY, style);
  }
  if ((document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") && document.paid_at) {
    rightY = drawMetaRow(doc, "วันที่รับเงิน:", formatDatePDF(document.paid_at), rightY, style);
  }
  if (document.doc_type === "credit_note" && data.referenceDoc?.doc_number) {
    rightY = drawMetaRow(doc, "อ้างอิง:", data.referenceDoc.doc_number, rightY, style);
  }

  y = Math.max(leftY, rightY) + 3;
  if (style.headerPattern === "solid") {
    doc.setDrawColor(style.accent);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, CONTENT_RIGHT, y);
    y += 4;
  } else {
    drawDivider(doc, y, style);
    y += 3;
  }

  return y;
}

function drawCustomerCleanConsistent(doc: jsPDF, data: PDFData, startY: number): number {
  const { document, customer, clientProfile } = data;
  const style = getTemplate(data);
  const isInvoice = document.doc_type === "invoice" || document.doc_type === "billing_note" || document.doc_type === "tax_invoice_receipt";
  const isTaxInvoiceDoc = (document.doc_type === "invoice" || document.doc_type === "tax_invoice_receipt") && document.vat_registered;

  const leftX = MARGIN;
  const rightX = CONTENT_RIGHT;
  let leftY = startY;
  let rightY = startY;

  drawSectionLabel(doc, "ลูกค้า / Bill To", leftX, leftY);
  if (isInvoice) {
    drawSectionLabel(doc, "รายละเอียดเอกสาร / Document Details", rightX, rightY, "right");
  }
  leftY += 6;
  rightY += 6;

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(10);
  doc.setTextColor(style.dark);
  doc.text(customer.name, leftX, leftY);
  leftY += 6;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);

  if (customer.tax_id) {
    doc.text(`เลขผู้เสียภาษี: ${customer.tax_id}`, leftX, leftY);
    leftY += 5;
  } else if (isTaxInvoiceDoc) {
    doc.text("เลขผู้เสียภาษี: -", leftX, leftY);
    leftY += 5;
  }

  if (customer.address) {
    const lines = doc.splitTextToSize(customer.address, LEFT_INFO_W);
    doc.text(lines, leftX, leftY);
    leftY += lines.length * 4;
  }

  if (customer.phone) {
    doc.text(customer.phone, leftX, leftY);
    leftY += 5;
  }

  if (isInvoice) {
    if (document.doc_number) {
      rightY = drawMetaRow(doc, "เลขที่:", document.doc_number, rightY, style, {
        valueFont: "bold",
        valueSize: 9,
      });
    }
    rightY = drawMetaRow(doc, "วันที่:", formatDatePDF(document.issue_date), rightY, style);
    if (document.due_date) {
      rightY = drawMetaRow(doc, "ครบกำหนด:", formatDatePDF(document.due_date), rightY, style);
    }

    if (clientProfile.company_name_th) {
      doc.setFont("Sarabun", "bold");
      doc.setFontSize(9);
      doc.setTextColor(style.dark);
      doc.text(clientProfile.company_name_th, rightX, rightY, { align: "right" });
      rightY += 5;
    }

    if (clientProfile.tax_id) {
      doc.setFont("Sarabun", "normal");
      doc.setFontSize(8);
      doc.setTextColor(style.medium);
      doc.text(`เลขผู้เสียภาษี: ${clientProfile.tax_id}`, rightX, rightY, { align: "right" });
      rightY += 5;
    }
  }

  const bottomY = Math.max(leftY, rightY) + 5;
  drawDivider(doc, bottomY, style);
  return bottomY + 3;
}

function drawReferenceConsistent(doc: jsPDF, data: PDFData, startY: number): number {
  const { document } = data;
  const style = getTemplate(data);

  let label = "";
  let value = "";
  if (document.doc_type === "delivery_note" && data.referenceDoc?.doc_number) {
    label = "อ้างอิงใบแจ้งหนี้:";
    value = data.referenceDoc.doc_number;
  } else if (document.doc_type === "credit_note" && data.referenceDoc?.doc_number) {
    label = "อ้างอิงใบแจ้งหนี้เดิม:";
    value = data.referenceDoc.doc_number;
  } else {
    return startY;
  }

  let y = startY;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  doc.text(label, MARGIN, y);

  doc.setFont("Sarabun", "bold");
  doc.setTextColor(style.dark);
  doc.text(value, MARGIN + 48, y);

  y += 8;
  drawDivider(doc, y, style);
  return y + 3;
}

function drawTaxSummaryConsistent(doc: jsPDF, data: PDFData, startY: number): number {
  const { document } = data;
  const style = getTemplate(data);
  let y = startY + 4;
  y = checkPageBreak(doc, y, estimateTaxSummaryHeight(document));

  const boxX = SUMMARY_BOX_X;
  const boxW = SUMMARY_BOX_W;
  const rightX = boxX + boxW - 3;
  const labelX = boxX + 3;
  const isTaxInvoiceDoc = (document.doc_type === "invoice" || document.doc_type === "tax_invoice_receipt") && document.vat_registered;
  const boxHeight = estimateTaxSummaryHeight(document) - 4;

  doc.setFillColor(250, 250, 250);
  doc.rect(boxX, y - 4, boxW, boxHeight, "F");
  doc.setDrawColor(style.divider);
  doc.setLineWidth(0.12);
  doc.rect(boxX, y - 4, boxW, boxHeight, "D");

  if (document.vat_registered && document.doc_type !== "delivery_note") {
    y = drawSummaryRow(
      doc,
      isTaxInvoiceDoc ? "ราคาสินค้า/บริการ (ก่อน VAT)" : "ราคารวม (Subtotal)",
      `฿ ${formatAmount(document.subtotal)}`,
      labelX,
      rightX,
      y,
      style,
    );

    if (document.vat_amount > 0) {
      y = drawSummaryRow(
        doc,
        isTaxInvoiceDoc ? `ภาษีมูลค่าเพิ่ม ${document.vat_rate}%` : `VAT ${document.vat_rate}%`,
        `฿ ${formatAmount(document.vat_amount)}`,
        labelX,
        rightX,
        y,
        style,
      );
    }

    doc.setDrawColor(style.divider);
    doc.setLineWidth(0.1);
    doc.line(labelX, y - 4, rightX, y - 4);
  }

  y = drawSummaryRow(
    doc,
    isTaxInvoiceDoc ? "รวมทั้งสิ้น (รวม VAT)" : "รวมทั้งสิ้น (Total)",
    `฿ ${formatAmount(document.total_amount)}`,
    labelX,
    rightX,
    y,
    style,
  );

  if (document.wht_amount > 0) {
    y = drawSummaryRow(
      doc,
      `หัก ณ ที่จ่าย ${document.wht_rate}% (WHT)`,
      `-฿ ${formatAmount(document.wht_amount)}`,
      labelX,
      rightX,
      y,
      style,
    );

    doc.setDrawColor(style.divider);
    doc.setLineWidth(0.1);
    doc.line(labelX, y - 4, rightX, y - 4);

    y = drawSummaryRow(
      doc,
      "ยอดที่ต้องชำระ (Net Payable)",
      `฿ ${formatAmount(document.net_payable)}`,
      labelX,
      rightX,
      y,
      style,
      "bold",
      10,
    );
    y += 2;
  }

  if (document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") {
    y += 3;
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(8);
    doc.setTextColor(style.medium);
    if (document.payment_method) {
      doc.text(`ช่องทางรับเงิน: ${PAYMENT_METHOD_LABELS[document.payment_method] || document.payment_method}`, MARGIN, y);
      y += 5;
    }
    if (document.wht_certificate_no) {
      doc.text(`เลขที่ใบหัก ณ ที่จ่าย: ${document.wht_certificate_no}`, MARGIN, y);
      y += 5;
    }
    if (document.amount_received != null) {
      doc.text(`จำนวนเงินที่รับ: ฿ ${formatAmount(document.amount_received)}`, MARGIN, y);
      y += 5;
    }
  }

  y += 5;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  const targetAmount =
    (document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") && document.amount_received
      ? document.amount_received
      : document.net_payable || document.total_amount;
  doc.text(`จำนวนเงิน (ตัวอักษร): ${thaiNumberToWords(round2(targetAmount))}`, MARGIN, y);
  return y + 6;
}

// ── ZONE 6: NOTES ──
function drawNotes(doc: jsPDF, note: string, startY: number, style: TemplateStyle): number {
  let y = startY + 3;
  const lines = doc.splitTextToSize(note, CONTENT_W);
  const truncated = lines.length > 3;
  const visibleLines = lines.slice(0, 3);
  y = checkPageBreak(doc, y, visibleLines.length * 4 + 12);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  doc.text("หมายเหตุ:", MARGIN, y);
  y += 5;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(style.medium);
  doc.text(visibleLines, MARGIN, y);
  y += visibleLines.length * 4;
  if (truncated) {
    doc.setTextColor(style.light);
    doc.text("(อ่านต่อในหมายเหตุของเอกสาร)", MARGIN, y);
    y += 5;
  }
  y += 5;
  return y;
}

function estimateTaxSummaryHeight(document: Document): number {
  let height = 26;

  if (document.vat_registered && document.doc_type !== "delivery_note") {
    height += document.vat_amount > 0 ? 18 : 10;
    if (document.discount_amount > 0) height += 5;
  }

  if (document.wht_amount > 0) {
    height += 18;
  }

  if (document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") {
    if (document.payment_method) height += 5;
    if (document.wht_certificate_no) height += 5;
    if (document.amount_received != null) height += 5;
    height += 3;
  }

  return height;
}

// ── ZONE 7: FOOTER ──
function drawFooter(doc: jsPDF, data: PDFData): void {
  const { document } = data;
  const style = getTemplate(data);
  const pageCount = doc.getNumberOfPages();

  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const footerY = PAGE_H - 45;
    if (p !== pageCount) continue;

    const isInvoiceStyleFooter = document.doc_type === "invoice" || document.doc_type === "billing_note" || document.doc_type === "tax_invoice_receipt";
    const sigWidth = isInvoiceStyleFooter ? 70 : 50;
    const spacing = isInvoiceStyleFooter ? CONTENT_W - sigWidth * 2 : (CONTENT_W - sigWidth * 3) / 2;

    const drawSigBlock = (x: number, label: string) => {
      doc.setDrawColor(style.divider);
      doc.setLineWidth(0.12);
      doc.line(x, footerY, x + sigWidth, footerY);

      doc.setFont("Sarabun", "normal");
      doc.setFontSize(8);
      doc.setTextColor(style.medium);
      doc.text(label, x + sigWidth / 2, footerY + 5, { align: "center" });

      doc.setTextColor(style.subtle);
      doc.text("(................................)", x + sigWidth / 2, footerY + 10, { align: "center" });
      doc.text("วันที่ / Date: ............", x + sigWidth / 2, footerY + 15, { align: "center" });
    };

    drawSigBlock(MARGIN, "ผู้รับเงิน / Received by");
    drawSigBlock(MARGIN + sigWidth + spacing, "ผู้จ่ายเงิน / Paid by");
    drawSigBlock(MARGIN + (sigWidth + spacing) * 2, "ผู้อนุมัติ / Approved by");

    if (document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") {
      const stampX = MARGIN + CONTENT_W - 45;
      doc.setDrawColor(style.subtle);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([2, 2], 0);
      doc.rect(stampX, footerY + 22, 40, 20, "D");
      doc.setLineDashPattern([], 0);
      doc.setFont("Sarabun", "normal");
      doc.setFontSize(8);
      doc.setTextColor(style.subtle);
      doc.text("ประทับตราบริษัท", stampX + 20, footerY + 32, { align: "center" });
    }
  }
}

function drawFooterClean(doc: jsPDF, data: PDFData): void {
  const { document } = data;
  const style = getTemplate(data);
  const pageCount = doc.getNumberOfPages();

  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    if (p !== pageCount) continue;

    const footerY = PAGE_H - 45;
    const isInvoiceStyleFooter = document.doc_type === "invoice" || document.doc_type === "billing_note" || document.doc_type === "tax_invoice_receipt";
    const sigWidth = isInvoiceStyleFooter ? 70 : 50;
    const spacing = isInvoiceStyleFooter ? CONTENT_W - sigWidth * 2 : (CONTENT_W - sigWidth * 3) / 2;

    const drawSigBlock = (x: number, label: string) => {
      doc.setDrawColor(style.divider);
      doc.setLineWidth(0.12);
      doc.line(x, footerY, x + sigWidth, footerY);

      doc.setFont("Sarabun", "normal");
      doc.setFontSize(8);
      doc.setTextColor(style.medium);
      doc.text(label, x + sigWidth / 2, footerY + 5, { align: "center" });

      doc.setTextColor(style.subtle);
      doc.text("(................................)", x + sigWidth / 2, footerY + 10, { align: "center" });
      doc.text("วันที่ / Date: ............", x + sigWidth / 2, footerY + 15, { align: "center" });
    };

    if (isInvoiceStyleFooter) {
      drawSigBlock(MARGIN, "ผู้รับเงิน / Received by");
      drawSigBlock(MARGIN + sigWidth + spacing, "ผู้อนุมัติ / Approved by");
      continue;
    }

    drawSigBlock(MARGIN, "ผู้รับเงิน / Received by");
    drawSigBlock(MARGIN + sigWidth + spacing, "ผู้จ่ายเงิน / Paid by");
    drawSigBlock(MARGIN + (sigWidth + spacing) * 2, "ผู้อนุมัติ / Approved by");

    if (document.doc_type === "receipt" || document.doc_type === "tax_invoice_receipt") {
      const stampX = MARGIN + CONTENT_W - 45;
      doc.setDrawColor(style.subtle);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([2, 2], 0);
      doc.rect(stampX, footerY + 22, 40, 20, "D");
      doc.setLineDashPattern([], 0);
      doc.setFont("Sarabun", "normal");
      doc.setFontSize(8);
      doc.setTextColor(style.subtle);
      doc.text("ประทับตราบริษัท", stampX + 20, footerY + 32, { align: "center" });
    }
  }
}

function drawPageNumbers(doc: jsPDF, style: TemplateStyle): void {
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(7);
    doc.setTextColor(style.light);
    doc.text(`หน้า ${p} / ${pageCount}`, PAGE_W / 2, PAGE_H - 10, { align: "center" });
  }
}

// ── MAIN GENERATION ──
export async function generatePDF(data: PDFData): Promise<jsPDF> {
  const tpl = data.clientProfile.pdf_template || "classic";
  if (tpl !== "modern" && tpl !== "classic") return generatePDF({ ...data, clientProfile: { ...data.clientProfile, pdf_template: "classic" } });

  const style = getTemplate(data);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await loadThaiFont(doc);
  doc.setFont("Sarabun");

  const headerStartY = style.headerPattern === "solid" ? MARGIN - 6 : MARGIN;
  let y = MARGIN;
  y = await drawHeaderConsistent(doc, data, y);
  y = drawCustomer(doc, data, y);

  if (needsReference(data.document.doc_type)) {
    y = drawReferenceConsistent(doc, data, y);
  }

  y = drawItemsTable(doc, data, y);
  y += 3;

  if (hasTax(data.document.doc_type)) {
    y = drawTaxSummaryConsistent(doc, data, y);
    y += 2;
  }

  if (data.document.note) {
    y = drawNotes(doc, data.document.note, y, style);
  }

  drawDocBorder(doc, style, headerStartY, y);
  drawFooterClean(doc, data);
  drawPageNumbers(doc, style);

  return doc;
}

export async function generatePDFBlob(data: PDFData): Promise<Blob> {
  const doc = await generatePDF(data);
  return doc.output("blob") as Blob;
}

export function downloadPDF(data: PDFData, doc: jsPDF): void {
  const short = DOC_TYPE_SHORT[data.document.doc_type];
  const datePart = data.document.issue_date
    ? data.document.issue_date.replace(/-/g, "")
    : new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${short}-${data.document.doc_number || "doc"}-${datePart}.pdf`;
  doc.save(filename);
}

function needsReference(type: DocumentType): boolean {
  return type === "delivery_note" || type === "credit_note";
}

function hasTax(type: DocumentType): boolean {
  return type !== "delivery_note";
}

