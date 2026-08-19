import type { ReceiptInputBasis } from "./tax";

const STORAGE_KEY = "invoice-system.receipt-input-basis";

export function getReceiptInputBasisPreference(): ReceiptInputBasis {
  if (typeof window === "undefined") return "pre_tax";
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "gross" || value === "net_cash" || value === "pre_tax"
    ? value
    : "pre_tax";
}

export function setReceiptInputBasisPreference(basis: ReceiptInputBasis) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, basis);
  }
}
