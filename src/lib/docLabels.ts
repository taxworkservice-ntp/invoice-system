import type { Document, DocumentType } from "../types";

export function invoiceLabel(vatRegistered: boolean): {
  thai: string;
  en: string;
  short: string;
} {
  if (vatRegistered) {
    return {
      thai: "ใบกำกับภาษี",
      en: "Tax Invoice",
      short: "TAX INV",
    };
  }
  return {
    thai: "ใบแจ้งหนี้",
    en: "Invoice",
    short: "INV",
  };
}

/**
 * Fixed printed-title presets for a Thai tax invoice (ใบกำกับภาษี) that also
 * serves as another document. PRINT-ONLY: the document's `doc_type` stays
 * "invoice" everywhere (lists, reports, status) — only the header wording
 * changes. Presets (not free text) keep the legal label leading and consistent.
 */
export const PRINT_TITLE_PRESETS = {
  tax_invoice_delivery: {
    thai: "ใบกำกับภาษี/ใบส่งของ",
    en: "Tax Invoice / Delivery Note",
  },
  tax_invoice_invoice: {
    thai: "ใบกำกับภาษี/ใบแจ้งหนี้",
    en: "Tax Invoice / Invoice",
  },
  tax_invoice_delivery_invoice: {
    thai: "ใบกำกับภาษี/ใบส่งของ/ใบแจ้งหนี้",
    en: "Tax Invoice / Delivery Note / Invoice",
  },
  tax_invoice_receipt: {
    thai: "ใบกำกับภาษี/ใบเสร็จรับเงิน",
    en: "Tax Invoice / Receipt",
  },
} as const;

export type PrintTitleVariant = keyof typeof PRINT_TITLE_PRESETS;

export function isPrintTitleVariant(value: unknown): value is PrintTitleVariant {
  return typeof value === "string" && value in PRINT_TITLE_PRESETS;
}

/**
 * Remember the last printed-title selection per browser so a new tax invoice
 * defaults to it (like the copy/ref-mode preferences). Only the choice matters
 * — the value is still stored per document.
 */
const PRINT_TITLE_STORAGE_KEY = "invoice-system.print-title-variant";

export function readLastPrintTitleVariant(): string {
  if (typeof window === "undefined") return "";
  const value = window.localStorage.getItem(PRINT_TITLE_STORAGE_KEY) || "";
  return isPrintTitleVariant(value) ? value : "";
}

export function writeLastPrintTitleVariant(value: string): void {
  if (typeof window === "undefined") return;
  if (isPrintTitleVariant(value)) {
    window.localStorage.setItem(PRINT_TITLE_STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(PRINT_TITLE_STORAGE_KEY);
  }
}

/** A VAT-registered invoice is a tax invoice (ใบกำกับภาษี). */
export function isTaxInvoice(
  doc: Pick<Document, "doc_type" | "vat_registered">,
): boolean {
  return doc.doc_type === "invoice" && doc.vat_registered === true;
}

/**
 * Printed header title. Uses the document's `print_title_variant` preset for
 * tax invoices; every other case falls back to the standard type label. This
 * is the ONLY place the override applies — never use it for in-app lists.
 */
export function printTitle(
  doc: Pick<Document, "doc_type" | "vat_registered" | "print_title_variant">,
): { thai: string; en: string } {
  if (isTaxInvoice(doc) && doc.print_title_variant) {
    const preset = PRINT_TITLE_PRESETS[doc.print_title_variant as PrintTitleVariant];
    if (preset) return { thai: preset.thai, en: preset.en };
  }
  return documentTypeLabel(doc.doc_type, doc.vat_registered);
}

export function documentTypeLabel(
  docType: DocumentType,
  vatRegistered: boolean,
): { thai: string; en: string } {
  switch (docType) {
    case "invoice":
      return invoiceLabel(vatRegistered);
    case "quotation":
      return { thai: "ใบเสนอราคา", en: "Quotation" };
    case "billing_note":
      return { thai: "ใบวางบิล", en: "Billing Note" };
    case "receipt":
      return { thai: "ใบเสร็จรับเงิน", en: "Receipt" };
    case "delivery_note":
      return { thai: "ใบส่งของ", en: "Delivery Note" };
    case "credit_note":
      return { thai: "ใบลดหนี้", en: "Credit Note" };
    default:
      return { thai: docType, en: docType };
  }
}
