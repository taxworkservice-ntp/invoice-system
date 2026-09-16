import { formatBuddhistDate } from "./dates";

const currencyFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(n: number): string {
  return currencyFormatter.format(n);
}

/**
 * Split a single-line ref item name ("DO-2026-09-003 วันที่: 1 ก.ย. 2569")
 * into its main part and date suffix so templates can render the date
 * smaller. Returns null when the pattern is absent (normal item names).
 * Only splits on " วันที่: " with a leading space, so "วันที่ส่งของ: …"
 * notes never match.
 */
export function splitRefDateSuffix(name: string | null | undefined): {
  main: string;
  date: string;
} | null {
  if (!name) return null;
  const sep = " วันที่: ";
  const i = name.lastIndexOf(sep);
  if (i < 0) return null;
  const main = name.slice(0, i).trim();
  const date = name.slice(i + sep.length).trim();
  if (!main || !date) return null;
  return { main, date };
}

export interface PaymentDetailLike {
  payment_method?: string | null;
  payment_detail?: {
    cheque_no?: string | null;
    cheque_bank?: string | null;
    cheque_date?: string | null;
  } | null;
}

/**
 * Payment-method text for printed documents, including cheque reference
 * details when present: "เช็คธนาคาร · เลขที่ 0098765 · ธ.กรุงไทย · ลงวันที่ ..."
 */
export function paymentMethodText(
  methodLabel: string,
  doc: PaymentDetailLike,
): string {
  const detail = doc.payment_detail;
  if (doc.payment_method !== "cheque" || !detail?.cheque_no) return methodLabel;
  const parts = [
    `${methodLabel} ${detail.cheque_no}`,
    detail.cheque_bank || null,
    detail.cheque_date ? `ลงวันที่ ${detail.cheque_date}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export interface ReceiptPaymentRow {
  label: string;
  value: string;
  /** Rendered as a highlighted badge (the payment method). */
  emphasize?: boolean;
}

function isIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * Labeled payment rows for the receipt signature-band box (Classic V2).
 * Method-aware: cheque rows appear for cheques only, the receiving-account
 * row for transfers only — every other document keeps the flat
 * `paymentLines` list untouched. Pure + unit-tested.
 */
export function buildReceiptPaymentRows(input: {
  methodLabel?: string | null;
  isCheque?: boolean;
  isTransfer?: boolean;
  chequeNo?: string | null;
  chequeBank?: string | null;
  chequeDate?: string | null;
  bankAccountLine?: string | null;
  amountReceived?: number | null;
  whtCertificateNo?: string | null;
  issueDate?: string | null;
}): ReceiptPaymentRow[] {
  // Labels carry their trailing " :" (info-box convention) so renderers print
  // them verbatim.
  const rows: ReceiptPaymentRow[] = [];
  if (input.methodLabel) {
    rows.push({ label: "วิธีชำระเงิน :", value: input.methodLabel, emphasize: true });
  }
  if (input.isCheque) {
    const no = (input.chequeNo || "").trim();
    if (no) rows.push({ label: "เลขที่เช็ค :", value: no });
    const bank = (input.chequeBank || "").trim();
    if (bank) rows.push({ label: "ธนาคาร :", value: bank });
    const rawDate = (input.chequeDate || "").trim();
    if (rawDate) {
      const shown = isIsoDate(rawDate) ? formatBuddhistDate(rawDate) : rawDate;
      const postdated =
        isIsoDate(rawDate) &&
        isIsoDate(input.issueDate) &&
        rawDate > (input.issueDate as string);
      rows.push({
        label: "ลงวันที่ :",
        value: postdated ? `${shown} (เช็คธนาคารลงวันที่ล่วงหน้า)` : shown,
      });
    }
  }
  if (input.isTransfer && input.bankAccountLine) {
    rows.push({ label: "เข้าบัญชี :", value: input.bankAccountLine });
  }
  if (input.amountReceived != null) {
    rows.push({ label: "จำนวนเงินที่รับ :", value: formatCurrency(input.amountReceived) });
  }
  const wht = (input.whtCertificateNo || "").trim();
  if (wht) rows.push({ label: "หัก ณ ที่จ่าย :", value: `เลขที่ ${wht}` });
  return rows;
}

export function sanitizeFilename(name: string, fallback = "doc"): string {
  const s = name
    .replace(/\s+/g, "_")
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/_+/g, "_")
    .replace(/^[_.\s]+|[_.\s]+$/g, "")
    .trim();
  if (!s || s === "." || s === "..") return fallback;
  return s;
}