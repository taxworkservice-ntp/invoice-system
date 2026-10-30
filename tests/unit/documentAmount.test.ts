import { describe, expect, it } from "vitest";
import { getDocumentAmount } from "../../src/lib/documentAmount";

const base = {
  id: "doc-1",
  total_amount: 1070,
  net_payable: 1000,
};

describe("getDocumentAmount", () => {
  it("uses total_amount for quotations, invoices and delivery notes", () => {
    expect(getDocumentAmount({ ...base, doc_type: "quotation" })).toBe(1070);
    expect(getDocumentAmount({ ...base, doc_type: "invoice" })).toBe(1070);
    expect(getDocumentAmount({ ...base, doc_type: "delivery_note" })).toBe(1070);
  });

  it("uses net_payable for billing notes and receipts", () => {
    expect(getDocumentAmount({ ...base, doc_type: "billing_note" })).toBe(1000);
    expect(getDocumentAmount({ ...base, doc_type: "receipt" })).toBe(1000);
  });
});
