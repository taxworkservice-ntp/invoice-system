import { describe, it, expect } from "vitest";
import { isRefSummaryLine } from "../../src/lib/refSummary";

/**
 * Locks the ref-summary marker classification, using the exact row shapes
 * found on real deals:
 *  - DL-2026-00298: detail-mode invoice = zero-amount group header + real
 *    detail rows carrying full lineage.
 *  - DL-2026-00309: ref-mode invoice = a single lineage row (source_document_id
 *    set, source_line_item_id null) that CARRIES THE BILLED TOTAL. It must not
 *    be classified as a marker — otherwise the credit-note form shows no item
 *    lines and receipts printed via a billing note lose their item table.
 */
describe("isRefSummaryLine", () => {
  it("marks zero-amount group headers on detail-mode invoices", () => {
    expect(
      isRefSummaryLine({
        item_name: "ใบส่งของ DN-2026-08-019",
        quantity: 0,
        unit_price: 0,
        source_document_id: "dn-id",
        source_line_item_id: null,
      }),
    ).toBe(true);
  });

  it("keeps real detail rows with full lineage", () => {
    expect(
      isRefSummaryLine({
        item_name: "บริการพิมพ์ฉลาก (ต่อ 100 ฉลาก)",
        quantity: 1,
        unit_price: 650,
        source_document_id: "dn-id",
        source_line_item_id: "dn-line-id",
      }),
    ).toBe(false);
  });

  it("keeps ref-mode money rows (lineage without a source line id)", () => {
    // The DL-2026-00309 bug: this row IS the invoice's billed amount.
    expect(
      isRefSummaryLine({
        item_name: "ใบส่งของ DN-2026-08-026",
        quantity: 1,
        unit_price: 120,
        source_document_id: "dn-id",
        source_line_item_id: null,
      }),
    ).toBe(false);
  });

  it("marks stripped-copy markers (no lineage, marker name, zero amounts)", () => {
    expect(
      isRefSummaryLine({
        item_name: "ใบเสนอราคา QT-2026-08-001",
        quantity: 0,
        unit_price: 0,
        source_document_id: null,
        source_line_item_id: null,
      }),
    ).toBe(true);
  });

  it("keeps plain product/service rows", () => {
    expect(
      isRefSummaryLine({
        item_name: "ค่าบริการ",
        quantity: 2,
        unit_price: 50,
        source_document_id: null,
        source_line_item_id: null,
      }),
    ).toBe(false);
  });

  it("keeps stripped copies that carry money even with a marker-like name", () => {
    expect(
      isRefSummaryLine({
        item_name: "ใบส่งของ DN-2026-08-026",
        quantity: 1,
        unit_price: 120,
        source_document_id: null,
        source_line_item_id: null,
      }),
    ).toBe(false);
  });
});
