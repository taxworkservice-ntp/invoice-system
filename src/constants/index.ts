import type { WhtRate, DocumentType, DocumentStatus } from "../types";

export const DOC_TYPE_LABELS: Record<DocumentType, { th: string; en: string }> = {
  quotation: { th: "ใบเสนอราคา", en: "Quotation" },
  invoice: { th: "ใบแจ้งหนี้", en: "Invoice" },
  tax_invoice_receipt: { th: "ใบกำกับภาษี/ใบเสร็จรับเงิน", en: "Tax Invoice / Receipt" },
  billing_note: { th: "ใบวางบิล", en: "Billing Note" },
  receipt: { th: "ใบเสร็จรับเงิน", en: "Receipt" },
  delivery_note: { th: "ใบส่งของ", en: "Delivery Note" },
  credit_note: { th: "ใบลดหนี้", en: "Credit Note" },
  debit_note: { th: "ใบเพิ่มหนี้", en: "Debit Note" },
};

export const DOC_TYPE_NOTES: Partial<Record<DocumentType, string>> = {
  invoice: "สำหรับธุรกิจที่จดทะเบียน VAT ใบแจ้งหนี้นี้ทำหน้าที่เป็นใบกำกับภาษี (ต้องแสดง VAT)",
};

export const DOC_TYPE_SHORT: Record<DocumentType, string> = {
  quotation: "QT",
  invoice: "INV",
  tax_invoice_receipt: "TIR",
  billing_note: "BN",
  receipt: "RC",
  delivery_note: "DN",
  credit_note: "CN",
  debit_note: "DB",
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  converted: "แปลงแล้ว",
  in_billing: "รอวางบิล",
  paid: "ชำระแล้ว",
  partially_paid: "ชำระบางส่วน",
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
  partially_paid: { bg: "bg-amber-100", text: "text-amber-700" },
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
  debit_note: { bg: "bg-amber-100", text: "text-amber-700" },
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
  { value: "large", label: "ใหญ่ (แทนชื่อบริษัท)", px: 200 },
];

export const ASSET_SCALE_OPTIONS: { value: string; label: string; mult: number }[] = [
  { value: "small", label: "เล็ก", mult: 0.75 },
  { value: "medium", label: "ปกติ", mult: 1 },
  { value: "large", label: "ใหญ่", mult: 1.25 },
];

export const ASSET_SCALE_MULT: Record<string, number> = Object.fromEntries(
  ASSET_SCALE_OPTIONS.map((option) => [option.value, option.mult]),
);

export const CLASSIC_V2_FONT_SCALE_OPTIONS: { value: string; label: string; mult: number }[] = [
  { value: "small", label: "เล็ก", mult: 0.9 },
  { value: "normal", label: "ปกติ", mult: 1 },
  { value: "large", label: "ใหญ่", mult: 1.1 },
  { value: "xlarge", label: "ใหญ่มาก", mult: 1.2 },
  // 1.2 (ใหญ่มาก) + 20%
  { value: "xxlarge", label: "ใหญ่มากพิเศษ", mult: 1.44 },
];

export const CLASSIC_V2_FONT_SCALE_MULT: Record<string, number> = Object.fromEntries(
  CLASSIC_V2_FONT_SCALE_OPTIONS.map((option) => [option.value, option.mult]),
);

/** Multiplier for a classic_v2_font_scale preset value; defaults to 1 (ปกติ). */
export function getClassicV2FontScaleMult(value?: string | null): number {
  return CLASSIC_V2_FONT_SCALE_MULT[value ?? "normal"] ?? 1;
}

export type ClassicV2SectionFontKey = "header" | "items" | "totals" | "footer";

/** Preset value meaning "follow the global classic_v2_font_scale". */
export const CLASSIC_V2_SECTION_INHERIT = "inherit";

export const CLASSIC_V2_SECTION_FONT_KEYS: ClassicV2SectionFontKey[] = [
  "header",
  "items",
  "totals",
  "footer",
];

/**
 * Effective multiplier for one Classic V2 section: an explicit preset wins,
 * otherwise the section follows the global font scale.
 */
export function getClassicV2SectionScaleMult(
  section: ClassicV2SectionFontKey,
  sectionScales: Record<string, string> | null | undefined,
  globalMult: number,
): number {
  const value = sectionScales?.[section];
  if (!value || value === CLASSIC_V2_SECTION_INHERIT) return globalMult;
  return CLASSIC_V2_FONT_SCALE_MULT[value] ?? globalMult;
}

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
    value: "billing_note",
    label: "รวมใบแจ้งหนี้เพื่อออกใบวางบิล",
  },
];

export const SETTINGS_TABS = [
  { label: "ข้อมูลบริษัท", path: "/settings/company" },
  { label: "รูปแบบเอกสาร", path: "/settings/documents" },
  { label: "ภาษี", path: "/settings/tax" },
  { label: "เลขที่เอกสาร", path: "/settings/numbering" },
  { label: "สต็อก", path: "/settings/stock" },
  { label: "บัญชี", path: "/settings/account" },
  { label: "เงินเดือน", path: "/settings/payroll" },
  { label: "ทีมงาน", path: "/settings/team" },
];

export const BOTTOM_NAV_ITEMS = [
  { label: "หน้าขาย", path: "/home" },
  { label: "เอกสาร", path: "/documents" },
  { label: "สินค้า", path: "/catalog" },
  { label: "ลูกค้า", path: "/customers" },
  { label: "เงินเดือน", path: "/payroll" },
  { label: "รายงาน", path: "/reports" },
  { label: "หัก ณ ที่จ่าย", path: "/wht" },
  { label: "ดาวน์โหลด", path: "/download-center" },
  { label: "ตั้งค่า", path: "/settings" },
];
