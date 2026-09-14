// Terms are fully user-owned: blank setting = no terms printed.
export function splitTerms(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Doc types with their own closing-terms slot (delivery notes never print terms). */
export const TERMS_DOC_TYPES = [
  "quotation",
  "invoice",
  "billing_note",
  "receipt",
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
