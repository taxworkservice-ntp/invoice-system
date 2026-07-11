import type { WhtRate, DocumentType, DocumentStatus } from "../types";

export const DOC_TYPE_LABELS: Record<DocumentType, { th: string; en: string }> = {
  quotation: { th: "ใบเสนอราคา", en: "Quotation" },
  invoice: { th: "ใบแจ้งหนี้", en: "Invoice" },
  tax_invoice_receipt: { th: "ใบกำกับภาษี/ใบเสร็จรับเงิน", en: "Tax Invoice / Receipt" },
  billing_note: { th: "ใบวางบิล", en: "Billing Note" },
  receipt: { th: "ใบเสร็จรับเงิน", en: "Receipt" },
  delivery_note: { th: "ใบส่งของ", en: "Delivery Note" },
  credit_note: { th: "ใบลดหนี้", en: "Credit Note" },
};

export const DOC_TYPE_SHORT: Record<DocumentType, string> = {
  quotation: "QT",
  invoice: "INV",
  tax_invoice_receipt: "TIR",
  billing_note: "BN",
  receipt: "RC",
  delivery_note: "DN",
  credit_note: "CN",
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  converted: "แปลงแล้ว",
  in_billing: "รอวางบิล",
  paid: "ชำระแล้ว",
  overdue: "เกินกำหนด",
  voided: "ยกเลิก",
  generated: "ออกแล้ว",
  issued: "ออกแล้ว",
};

export const STATUS_COLORS: Record<DocumentStatus, { bg: string; text: string }> = {
  draft: { bg: "bg-draft-bg", text: "text-draft-text" },
  sent: { bg: "bg-sent-bg", text: "text-sent-text" },
  converted: { bg: "bg-voided-bg", text: "text-voided-text" },
  in_billing: { bg: "bg-sent-bg", text: "text-sent-text" },
  paid: { bg: "bg-paid-bg", text: "text-paid-text" },
  overdue: { bg: "bg-overdue-bg", text: "text-overdue-text" },
  voided: { bg: "bg-voided-bg", text: "text-voided-text" },
  generated: { bg: "bg-paid-bg", text: "text-paid-text" },
  issued: { bg: "bg-paid-bg", text: "text-paid-text" },
};

export const DOC_TYPE_COLORS: Record<DocumentType, { bg: string; text: string }> = {
  quotation: { bg: "bg-purple-100", text: "text-purple-700" },
  invoice: { bg: "bg-blue-100", text: "text-blue-700" },
  tax_invoice_receipt: { bg: "bg-emerald-100", text: "text-emerald-700" },
  billing_note: { bg: "bg-orange-100", text: "text-orange-700" },
  receipt: { bg: "bg-green-100", text: "text-green-700" },
  delivery_note: { bg: "bg-teal-100", text: "text-teal-700" },
  credit_note: { bg: "bg-red-100", text: "text-red-700" },
};

export const CHIP_COLORS = [
  "bg-blue-50 text-blue-700",
  "bg-green-50 text-green-700",
  "bg-purple-50 text-purple-700",
  "bg-amber-50 text-amber-700",
  "bg-pink-50 text-pink-700",
  "bg-teal-50 text-teal-700",
];

export const WHT_RATE_OPTIONS: { value: WhtRate; label: string }[] = [
  { value: "0", label: "ไม่มี" },
  { value: "1", label: "1%" },
  { value: "2", label: "2%" },
  { value: "3", label: "3%" },
  { value: "5", label: "5%" },
];

export const VAT_DEFAULT = 7.0;

export const PDF_TEMPLATE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: "modern", label: "โมเดิร์น", desc: "ดีไซน์บางเบา เส้นสีอ่อน ดูทันสมัย" },
];

export const LOGO_SIZE_OPTIONS: { value: string; label: string; px: number }[] = [
  { value: "square", label: "สี่เหลี่ยมจัตุรัส", px: 64 },
  { value: "rectangle", label: "สี่เหลี่ยมผืนผ้า", px: 128 },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "เงินสด",
  bank_transfer: "โอนเงิน",
  cheque: "เช็ค",
};

export const NEW_DEAL_OPTIONS = [
  {
    value: "quotation",
    label: "เริ่มด้วยใบเสนอราคา",
  },
  {
    value: "invoice",
    label: "ออกใบแจ้งหนี้ทันที",
  },
  {
    value: "tax_invoice_receipt",
    label: "รับเงินแล้ว ออกใบกำกับภาษี/ใบเสร็จรับเงินเลย",
  },
  {
    value: "billing_note",
    label: "รวมใบแจ้งหนี้เพื่อออกใบวางบิล",
  },
];

export const BOTTOM_NAV_ITEMS = [
  { label: "หน้างานขาย", path: "/home" },
  { label: "เอกสาร", path: "/documents" },
  { label: "ศูนย์ดาวน์โหลด", path: "/download-center" },
  { label: "รายงาน", path: "/reports" },
  { label: "WHT", path: "/wht" },
  { label: "สินค้า", path: "/catalog" },
  { label: "ลูกค้า", path: "/customers" },
  { label: "ตั้งค่า", path: "/settings" },
];
