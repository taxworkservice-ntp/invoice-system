import type { DocumentType } from "../types";

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
