/**
 * Ref-mode invoices (created from delivery notes / quotations) persist a
 * zero-qty group-header row per source document so print templates can
 * render grouped output ("ใบส่งของ DN-..."). Those rows are print markers,
 * not real items — consumers that display or copy item lists must skip them.
 *
 * Two signatures exist:
 * - On invoices: lineage present (source_document_id, no source_line_item_id)
 *   — but ONLY when the row carries no money. Ref-mode invoices store their
 *   billed total on exactly this row shape (qty >= 1, price = group total),
 *   so those rows are real billable lines, not markers.
 * - On copies that strip lineage (e.g. credit notes): marker name + zero amounts
 */
export function isRefSummaryLine(item: {
  item_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  source_document_id?: string | null;
  source_line_item_id?: string | null;
}): boolean {
  const zeroAmount =
    Number(item.quantity) === 0 && Number(item.unit_price) === 0;
  if (item.source_document_id && !item.source_line_item_id) return zeroAmount;
  return (
    zeroAmount &&
    /^(ใบส่งของ|ใบเสนอราคา)\s/.test(item.item_name || "")
  );
}
