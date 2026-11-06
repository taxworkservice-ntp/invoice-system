import { describe, expect, it } from "vitest";
import { isReferenceModeInvoice } from "../../src/lib/refSummary";

const sourceLine = (overrides: Record<string, unknown> = {}) => ({
  quantity: 1,
  unit_price: 1070,
  line_total: 1070,
  source_document_id: "doc-1",
  source_line_item_id: null,
  ...overrides,
});

describe("isReferenceModeInvoice", () => {
  it("detects a reference-mode invoice", () => {
    expect(isReferenceModeInvoice({ doc_type: "invoice" }, [sourceLine()])).toBe(true);
  });

  it("ignores manual lines when deciding", () => {
    expect(
      isReferenceModeInvoice({ doc_type: "invoice" }, [
        sourceLine(),
        {
          quantity: 2,
          unit_price: 50,
          line_total: 100,
          source_document_id: null,
          source_line_item_id: null,
        },
      ]),
    ).toBe(true);
  });

  it("rejects a detail-mode invoice with source line items", () => {
    expect(
      isReferenceModeInvoice({ doc_type: "invoice" }, [
        sourceLine({ quantity: 1, source_line_item_id: "line-1" }),
      ]),
    ).toBe(false);
  });

  it("rejects a detail-mode group header plus items", () => {
    expect(
      isReferenceModeInvoice({ doc_type: "invoice" }, [
        sourceLine({ quantity: 0, unit_price: 0, line_total: 0 }),
        sourceLine({ source_line_item_id: "line-1" }),
      ]),
    ).toBe(false);
  });

  it("is only for invoices", () => {
    expect(isReferenceModeInvoice({ doc_type: "billing_note" }, [sourceLine()])).toBe(false);
  });

  it("rejects a manual-only invoice", () => {
    expect(
      isReferenceModeInvoice({ doc_type: "invoice" }, [
        {
          quantity: 1,
          unit_price: 100,
          line_total: 100,
          source_document_id: null,
          source_line_item_id: null,
        },
      ]),
    ).toBe(false);
  });
});
