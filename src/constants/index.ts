import type { WhtRate, DocumentType, DocumentStatus } from "../types";

export const DOC_TYPE_LABELS: Record<DocumentType, { th: string; en: string }> = {
  quotation: { th: "ใบเสนอราคา", en: "Quotation" },
  invoice: { th: "ใบแจ้งหนี้", en: "Invoice" },
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

export const LOGO_SIZE_OPTIONS: { value: string; label: string; px: number; mm: string; desc: string }[] = [
  { value: "small", label: "เล็ก", px: 48, mm: "~13มม.", desc: "ตราสัญลักษณ์สี่เหลี่ยม" },
  { value: "square", label: "มาตรฐาน", px: 64, mm: "~17มม.", desc: "ค่าเริ่มต้น — สมดุลกับชื่อบริษัท" },
  { value: "medium", label: "กลาง", px: 96, mm: "~25มม.", desc: "โลโก้ตัวอักษรแนวนอนให้อ่านชัด" },
  { value: "rectangle", label: "ใหญ่", px: 128, mm: "~34มม.", desc: "โลโก้ตัวอักษรกว้าง" },
  { value: "large", label: "แบนเนอร์", px: 312, mm: "~83มม.", desc: "ใช้ร่วมกับการปิดชื่อบริษัท" },
];

/** Default logo size for new workspaces. */
export const LOGO_DEFAULT_SIZE = "square";

/**
 * Width in px for a stored logo_size. Covers legacy values:
 * "full" (old seed) maps to rectangle. Unknown/null falls back to 64.
 */
export function getLogoPx(logoSize?: string | null): number {
  if (logoSize === "full") return 128;
  return LOGO_SIZE_OPTIONS.find((o) => o.value === logoSize)?.px ?? 64;
}

export const ASSET_SCALE_OPTIONS: { value: string; label: string; mult: number }[] = [
  { value: "small", label: "เล็ก", mult: 0.75 },
  { value: "medium", label: "ปกติ", mult: 1 },
  { value: "large", label: "ใหญ่", mult: 1.25 },
];

export const ASSET_SCALE_MULT: Record<string, number> = Object.fromEntries(
  ASSET_SCALE_OPTIONS.map((option) => [option.value, option.mult]),
);

/** Base pt of the main reading text (item description body) — the reference for all labels. */
export const CLASSIC_V2_BASE_FONT_PT = 7.5;
export const CLASSIC_V2_MIN_FONT_PT = 6;
export const CLASSIC_V2_MAX_FONT_PT = 13.5;

/** Prefix for per-slot custom sizes stored as `pt:<number>`. */
export const CLASSIC_V2_CUSTOM_PT_PREFIX = "pt:";

export const CLASSIC_V2_FONT_SCALE_OPTIONS: { value: string; label: string; mult: number }[] = [
  { value: "small", label: "6pt", mult: 0.8 },
  { value: "normal", label: "7.5pt", mult: 1 },
  { value: "large", label: "9pt", mult: 1.2 },
  { value: "xlarge", label: "10.5pt", mult: 1.4 },
  { value: "xxlarge", label: "12pt", mult: 1.6 },
  { value: "xxxlarge", label: "13pt", mult: 13 / CLASSIC_V2_BASE_FONT_PT },
];

export const CLASSIC_V2_FONT_SCALE_MULT: Record<string, number> = Object.fromEntries(
  CLASSIC_V2_FONT_SCALE_OPTIONS.map((option) => [option.value, option.mult]),
);

/** Multiplier for a preset value or a custom `pt:<number>` string; defaults to 1 (ปกติ). */
export function getClassicV2FontScaleMult(value?: string | null): number {
  if (!value) return 1;
  if (value.startsWith(CLASSIC_V2_CUSTOM_PT_PREFIX)) {
    const pt = parseFloat(value.slice(CLASSIC_V2_CUSTOM_PT_PREFIX.length));
    if (!Number.isFinite(pt)) return 1;
    return (
      Math.min(CLASSIC_V2_MAX_FONT_PT, Math.max(CLASSIC_V2_MIN_FONT_PT, pt)) /
      CLASSIC_V2_BASE_FONT_PT
    );
  }
  return CLASSIC_V2_FONT_SCALE_MULT[value] ?? 1;
}

/** Sentinel stored on a document meaning "follow the workspace default". */
export const DOCUMENT_FONT_SCALE_DEFAULT = "default";

export type ClassicV2SectionFontKey =
  | "header"
  | "header_company"
  | "header_title"
  | "header_info"
  | "items"
  | "num"
  | "thead"
  | "totals"
  | "totals_net"
  | "payment"
  | "footer";

/** Preset value meaning "follow the workspace default". */
export const CLASSIC_V2_SECTION_INHERIT = "inherit";

export const CLASSIC_V2_SECTION_FONT_KEYS: ClassicV2SectionFontKey[] = [
  "header",
  "header_company",
  "header_title",
  "header_info",
  "items",
  "num",
  "thead",
  "totals",
  "totals_net",
  "payment",
  "footer",
];

/**
 * Sub-slot → parent slot. A sub-slot refines one visual part of its parent's
 * fixed block; when unset it resolves to the parent slot, which in turn
 * resolves to the global scale — so keys absent from stored jsonb render
 * exactly as before this refinement shipped.
 */
export const CLASSIC_V2_SUB_SLOT_PARENT: Partial<Record<ClassicV2SectionFontKey, ClassicV2SectionFontKey>> = {
  header_company: "header",
  header_title: "header",
  header_info: "header",
  totals_net: "totals",
  payment: "totals",
};

/** Default workspace section-scale state — every slot follows its parent. */
export const CLASSIC_V2_DEFAULT_SECTION_SCALES: Record<ClassicV2SectionFontKey, string> =
  Object.fromEntries(CLASSIC_V2_SECTION_FONT_KEYS.map((key) => [key, CLASSIC_V2_SECTION_INHERIT])) as Record<
    ClassicV2SectionFontKey,
    string
  >;

/** Keys of the ตารางรายการ (items table) sub-group. */
export const CLASSIC_V2_ITEMS_TABLE_ROWS: { key: ClassicV2SectionFontKey; label: string }[] = [
  { key: "items", label: "ชื่อสินค้า/คำอธิบาย" },
  { key: "num", label: "ตัวเลข/จำนวน" },
  { key: "thead", label: "หัวตาราง/คอลัมน์" },
];

/**
 * Sub-rows rendered indented beneath their parent slot in Settings
 * (รูปแบบเอกสาร > ขนาดตัวอักษร คลาสสิก V2).
 */
export const CLASSIC_V2_SECTION_SUB_ROWS: Partial<
  Record<ClassicV2SectionFontKey, { key: ClassicV2SectionFontKey; label: string }[]>
> = {
  header: [
    { key: "header_company", label: "ชื่อบริษัท/ที่อยู่" },
    { key: "header_title", label: "ชื่อเอกสาร/ตราสำเนา" },
    { key: "header_info", label: "กล่องข้อมูล/ลูกค้า" },
  ],
  totals: [
    { key: "totals_net", label: "ยอดรวมสุดท้าย" },
    { key: "payment", label: "ข้อมูลการชำระเงิน" },
  ],
};

/** Short parent names used in sub-row inherit labels ("ตามส่วนหัว (9pt)"). */
export const CLASSIC_V2_SECTION_PARENT_LABELS: Record<
  "header" | "totals",
  string
> = { header: "ส่วนหัว", totals: "ยอดรวม" };

/**
 * Multiplier for one Classic V2 section: an explicit workspace preset wins,
 * otherwise a sub-slot follows its parent slot, which follows the global
 * font scale.
 */
export function getClassicV2SectionScaleMult(
  section: ClassicV2SectionFontKey,
  sectionScales: Record<string, string> | null | undefined,
  globalMult: number,
): number {
  for (
    let slot: ClassicV2SectionFontKey | undefined = section;
    slot;
    slot = CLASSIC_V2_SUB_SLOT_PARENT[slot]
  ) {
    const value = sectionScales?.[slot];
    if (value && value !== CLASSIC_V2_SECTION_INHERIT) return getClassicV2FontScaleMult(value);
  }
  return globalMult;
}

/** Document types that can have their own font-scale overrides (classic V2). */
export type ClassicV2TypeFontKey =
  | "quotation"
  | "invoice"
  | "billing_note"
  | "receipt"
  | "delivery_note"
  | "credit_note"
  | "debit_note";

export const CLASSIC_V2_TYPE_FONT_KEYS: ClassicV2TypeFontKey[] = [
  "quotation",
  "invoice",
  "billing_note",
  "receipt",
  "delivery_note",
  "credit_note",
  "debit_note",
];

/** Key inside a per-type override object for the whole-document scale. */
export const CLASSIC_V2_TYPE_GLOBAL_KEY = "global";

/** Fixed height (mm) of the billing-note cheque-date strip — reserved from first/last page budgets. */
export const CLASSIC_V2_CHEQUE_STRIP_RESERVE_MM = 7;

/**
 * Height (mm) of one optional document-meta row (ชื่องาน / JOB NAME,
 * เลขที่ใบสั่งซื้อ / PO NO.) in the classic V2 info band — measured 6.35mm at
 * ปกติ, rounded up; scales with the header section. Reserved from first/last
 * page budgets when the field is filled so dense pages never overflow A4.
 */
export const CLASSIC_V2_META_ROW_RESERVE_MM = 6.5;

/**
 * Measured vertical savings (mm) of the classic V2 compact-layout settings —
 * returned to the row budgets as fixed-block deltas (measured on the print
 * fixture; rounded down so budgets stay conservative):
 *  - HIDE_EN_META_ROW: each info-band meta row (TH+EN stacked → TH only)
 *  - HIDE_EN_THEAD: the items-table head row
 *  - HIDE_EN_SIG: signature box titles/roles (TH+EN stacked → TH only)
 *  - COMPACT_SIG: the whole signature band in ลายเซ็นกระชับ mode
 */
export const CLASSIC_V2_HIDE_EN_META_ROW_MM = 1.8;
export const CLASSIC_V2_HIDE_EN_THEAD_MM = 2.2;
export const CLASSIC_V2_HIDE_EN_SIG_MM = 3;
export const CLASSIC_V2_COMPACT_SIG_MM = 5.5;

/**
 * Effective classic V2 global scale for one document — precedence:
 * per-document override → per-document-type global → workspace profile preset.
 */
export function getClassicV2EffectiveFontScaleMult(
  documentValue: string | null | undefined,
  typeGlobalValue: string | null | undefined,
  profileValue: string | null | undefined,
): number {
  const preset =
    documentValue && documentValue !== DOCUMENT_FONT_SCALE_DEFAULT
      ? documentValue
      : typeGlobalValue && typeGlobalValue !== CLASSIC_V2_SECTION_INHERIT
        ? typeGlobalValue
        : profileValue;
  return getClassicV2FontScaleMult(preset);
}

/**
 * Effective classic V2 section scale for one document — precedence, walking
 * the sub-slot → parent chain within each scope first:
 * per-type section override → per-type parent override → workspace section
 * scale → workspace parent scale → the document's effective global scale.
 */
export function getClassicV2EffectiveSectionScaleMult(
  section: ClassicV2SectionFontKey,
  typeSectionScales: Record<string, string> | null | undefined,
  sectionScales: Record<string, string> | null | undefined,
  globalMult: number,
): number {
  for (const levels of [typeSectionScales, sectionScales]) {
    for (
      let slot: ClassicV2SectionFontKey | undefined = section;
      slot;
      slot = CLASSIC_V2_SUB_SLOT_PARENT[slot]
    ) {
      const value = levels?.[slot];
      if (value && value !== CLASSIC_V2_SECTION_INHERIT) return getClassicV2FontScaleMult(value);
    }
  }
  return globalMult;
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
