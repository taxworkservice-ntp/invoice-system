export function formatCurrency(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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