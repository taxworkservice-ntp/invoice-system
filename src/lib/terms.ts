// Terms are fully user-owned: blank setting = no terms printed.
export function splitTerms(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Doc types with their own closing-terms slot — the tabs Settings › เอกสาร
 * shows for หมายเหตุ (REMARK).
 *
 * Delivery notes are included: they print the remark too (a space's terms and
 * delivery conditions are as relevant there as anywhere). Their slot works like
 * every other type's — text in the tab wins, a blank tab suppresses the remark
 * on delivery notes only, and an untouched tab inherits the legacy
 * workspace-wide text so nothing changes until someone decides otherwise.
 */
export const TERMS_DOC_TYPES = [
  "quotation",
  "invoice",
  "billing_note",
  "receipt",
  "delivery_note",
  "credit_note",
  "debit_note",
] as const;

/**
 * Per-type closing terms with legacy fallback: the type's own text wins
 * (empty string = hide on that type); a missing map falls back to the old
 * workspace-global text so mid-migration prints never change.
 */
export function resolveTermsByType(
  byType: Record<string, string> | null | undefined,
  globalTerms: string | null | undefined,
  docType: string,
): string[] {
  if (byType && Object.prototype.hasOwnProperty.call(byType, docType)) {
    return splitTerms(byType[docType]);
  }
  return splitTerms(globalTerms);
}
