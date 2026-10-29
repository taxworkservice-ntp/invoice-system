import { isRefSummaryLine } from "./refSummary";

/**
 * Shared line-shape rules for invoices created from delivery notes or
 * quotations.
 *
 * The presentation mode is chosen once, at confirmation time, and is encoded
 * entirely in the saved line records:
 *  - detail    → one group-header row (qty 0) per source + one row per item
 *  - reference → one row per source carrying the source total (qty 1)
 *
 * Both invoice forms use this builder so the confirmation preview and the
 * database payload can never drift apart.
 */
export type InvoicePresentationMode = "detail" | "reference";

const EPS = 1e-9;

export interface InvoiceInputLine {
  source_document_id?: string | null;
  source_line_item_id?: string | null;
  item_name: string;
  line_note?: string | null;
  item_sku?: string | null;
  item_type?: string | null;
  unit?: string;
  unit_price: number;
  quantity: number;
  base_quantity?: number | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  qty_carton?: number | null;
  carton_unit?: string | null;
  source_delivered_qty?: number;
  source_unit_price?: number;
}

export interface InvoiceSource {
  id: string;
  /** Name shown in reference mode (one printed line per source). */
  refItemName: string;
  /** Optional note printed under the reference line. */
  refLineNote: string | null;
  /** Group heading printed in detail mode. */
  detailHeaderName: string;
  detailHeaderNote: string | null;
  lines: InvoiceInputLine[];
}

export interface InvoiceLineRecord {
  item_id: null;
  item_name: string;
  line_note: string | null;
  item_sku: string | null;
  item_type: string;
  unit: string;
  unit_price: number;
  quantity: number;
  base_quantity: number | null;
  discount_percent: number;
  discount_amount: number;
  qty_carton: number | null;
  carton_unit: string | null;
  line_total: number;
  source_document_id: string | null;
  source_line_item_id: string | null;
  source_delivered_qty?: number;
  source_unit_price?: number;
  sort_order: number;
}

export interface InvoicePreviewRow {
  key: string;
  name: string;
  note: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  total: number;
  isManual: boolean;
}

export interface InvoicePreviewGroup {
  key: string;
  label: string;
  meta: string | null;
  rows: InvoicePreviewRow[];
  total: number;
}

export type InvoicePreview =
  | { mode: "detail"; groups: InvoicePreviewGroup[]; rowCount: number }
  | { mode: "reference"; rows: InvoicePreviewRow[]; rowCount: number };

/** Net line amount before VAT — the one formula all invoice surfaces share. */
export function invoiceLineNet(line: {
  unit_price: number;
  quantity: number;
  discount_percent?: number | null;
  discount_amount?: number | null;
}): number {
  const base = (Number(line.unit_price) || 0) * (Number(line.quantity) || 0);
  const discount =
    Number(line.discount_percent) > 0
      ? (base * Number(line.discount_percent)) / 100
      : Number(line.discount_amount) || 0;
  return Math.max(0, base - discount);
}

function billable(lines: InvoiceInputLine[]): InvoiceInputLine[] {
  return lines.filter((line) => Number(line.quantity) > EPS);
}

function recordForSourceLine(
  source: InvoiceSource,
  line: InvoiceInputLine,
  sortOrder: number,
): InvoiceLineRecord {
  return {
    item_id: null,
    item_name: line.item_name,
    line_note: line.line_note || null,
    item_sku: line.item_sku || null,
    item_type: line.item_type || "product",
    unit: line.unit || "ชิ้น",
    unit_price: Number(line.unit_price) || 0,
    quantity: Number(line.quantity) || 0,
    base_quantity: line.base_quantity ?? null,
    discount_percent: Number(line.discount_percent) || 0,
    discount_amount: Number(line.discount_amount) || 0,
    qty_carton: line.qty_carton ?? null,
    carton_unit: line.carton_unit || null,
    line_total: invoiceLineNet(line),
    source_document_id: source.id,
    source_line_item_id: line.source_line_item_id || null,
    source_delivered_qty: line.source_delivered_qty,
    source_unit_price: line.source_unit_price,
    sort_order: sortOrder,
  };
}

function recordForManualLine(line: InvoiceInputLine, sortOrder: number): InvoiceLineRecord {
  return {
    item_id: null,
    item_name: line.item_name,
    line_note: line.line_note || null,
    item_sku: line.item_sku || null,
    item_type: line.item_type || "product",
    unit: line.unit || "ชิ้น",
    unit_price: Number(line.unit_price) || 0,
    quantity: Number(line.quantity) || 0,
    base_quantity: line.base_quantity ?? null,
    discount_percent: Number(line.discount_percent) || 0,
    discount_amount: Number(line.discount_amount) || 0,
    qty_carton: line.qty_carton ?? null,
    carton_unit: line.carton_unit || null,
    line_total: invoiceLineNet(line),
    source_document_id: null,
    source_line_item_id: null,
    sort_order: sortOrder,
  };
}

/**
 * Build the exact `p_lines` payload for `create_invoice_from_sources`.
 * Sources with no billable lines are skipped, matching the old per-form
 * behaviour; manual lines are appended after every source.
 */
export function buildInvoiceLineRecords({
  mode,
  sources,
  manualLines,
}: {
  mode: InvoicePresentationMode;
  sources: InvoiceSource[];
  manualLines: InvoiceInputLine[];
}): InvoiceLineRecord[] {
  const records: InvoiceLineRecord[] = [];
  let sortOrder = 0;

  for (const source of sources) {
    const lines = billable(source.lines);
    if (lines.length === 0) continue;

    if (mode === "reference") {
      const total = lines.reduce((sum, line) => sum + invoiceLineNet(line), 0);
      records.push({
        item_id: null,
        item_name: source.refItemName,
        line_note: source.refLineNote,
        item_sku: null,
        item_type: "service",
        unit: "",
        unit_price: total,
        quantity: 1,
        base_quantity: null,
        discount_percent: 0,
        discount_amount: 0,
        qty_carton: null,
        carton_unit: null,
        line_total: total,
        source_document_id: source.id,
        source_line_item_id: null,
        sort_order: sortOrder++,
      });
      continue;
    }

    // Detail mode: the zero-qty marker is the printed group heading.
    records.push({
      item_id: null,
      item_name: source.detailHeaderName,
      line_note: source.detailHeaderNote,
      item_sku: null,
      item_type: "service",
      unit: "",
      unit_price: 0,
      quantity: 0,
      base_quantity: null,
      discount_percent: 0,
      discount_amount: 0,
      qty_carton: null,
      carton_unit: null,
      line_total: 0,
      source_document_id: source.id,
      source_line_item_id: null,
      sort_order: sortOrder++,
    });

    for (const line of lines) {
      records.push(recordForSourceLine(source, line, sortOrder++));
    }
  }

  for (const line of billable(manualLines)) {
    records.push(recordForManualLine(line, sortOrder++));
  }

  return records;
}

function previewRow(record: InvoiceLineRecord): InvoicePreviewRow {
  return {
    key: `${record.source_document_id ?? "manual"}:${record.sort_order}`,
    name: record.item_name,
    note: record.line_note,
    quantity: record.quantity,
    unit: record.unit,
    unitPrice: record.unit_price,
    discountPercent: record.discount_percent,
    total: record.line_total,
    isManual: record.source_document_id === null,
  };
}

/**
 * Convert saved-shape records into the confirmation preview. Detail mode
 * hides the zero-qty group markers behind a group heading; reference mode is
 * a flat one-row-per-source list plus manual lines.
 */
export function buildInvoicePreview(
  records: InvoiceLineRecord[],
  mode: InvoicePresentationMode,
): InvoicePreview {
  if (mode === "reference") {
    const rows = records.map(previewRow);
    return { mode, rows, rowCount: rows.length };
  }

  const groups: InvoicePreviewGroup[] = [];
  let current: InvoicePreviewGroup | null = null;

  for (const record of records) {
    if (isRefSummaryLine(record)) {
      current = {
        key: record.source_document_id ?? `group-${record.sort_order}`,
        label: record.item_name,
        meta: record.line_note,
        rows: [],
        total: 0,
      };
      groups.push(current);
      continue;
    }

    if (record.source_document_id === null) {
      let manual = groups.find((group) => group.key === "manual");
      if (!manual) {
        manual = { key: "manual", label: "รายการเพิ่มเติม", meta: null, rows: [], total: 0 };
        groups.push(manual);
      }
      manual.rows.push(previewRow(record));
      manual.total += record.line_total;
      continue;
    }

    if (!current || current.key !== record.source_document_id) {
      current = {
        key: record.source_document_id,
        label: "รายการ",
        meta: null,
        rows: [],
        total: 0,
      };
      groups.push(current);
    }
    current.rows.push(previewRow(record));
    current.total += record.line_total;
  }

  const rowCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return { mode, groups, rowCount };
}
