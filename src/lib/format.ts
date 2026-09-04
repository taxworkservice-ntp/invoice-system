export function formatCurrency(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
 * details when present: "เช็ค · เลขที่ 0098765 · ธ.กรุงไทย · ลงวันที่ ..."
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

export function sanitizeFilename(name: string, fallback = "doc"): string {
  let s = name
    .replace(/\s+/g, "_")
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/_+/g, "_")
    .replace(/^[_.\s]+|[_.\s]+$/g, "")
    .trim();
  if (!s || s === "." || s === "..") return fallback;
  return s;
}