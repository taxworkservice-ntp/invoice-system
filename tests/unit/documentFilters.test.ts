import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  countActiveFilters,
  matchesDocumentFilters,
  sortDocuments,
  type DocumentFilters,
} from "../../src/lib/documentFilters";
import type { Document, DocumentStatus, DocumentType } from "../../src/types";

const TODAY = "2026-09-16";

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    customer_id: "cust-1",
    doc_type: "invoice" as DocumentType,
    status: "sent" as DocumentStatus,
    doc_number: "INV-2026-0001",
    issue_date: "2026-09-01",
    due_date: "2026-09-06",
    vat_registered: true,
    vat_rate: 7,
    wht_rate: 0,
    wht_amount: 0,
    subtotal: 1000,
    total_amount: 1070,
    net_payable: 1070,
    note: null,
    customer_po_number: null,
    task_name: null,
    payment_method: null,
    line_items: [{ item_name: "ค่าบริการ", item_sku: "SVC-01" }],
    customer: { name: "บริษัท สมชาย จำกัด" },
    ...overrides,
  } as unknown as Document;
}

function withFilters(patch: Partial<DocumentFilters>): DocumentFilters {
  return { ...EMPTY_FILTERS, ...patch };
}

describe("matchesDocumentFilters — amount", () => {
  it("rejects amounts below the minimum", () => {
    const doc = makeDoc({ net_payable: 500 });
    expect(matchesDocumentFilters(doc, withFilters({ amountMin: 1000 }), TODAY)).toBe(false);
  });

  it("rejects amounts above the maximum", () => {
    const doc = makeDoc({ net_payable: 5000 });
    expect(matchesDocumentFilters(doc, withFilters({ amountMax: 1000 }), TODAY)).toBe(false);
  });

  it("accepts an amount inside the range", () => {
    const doc = makeDoc({ net_payable: 1500 });
    expect(matchesDocumentFilters(doc, withFilters({ amountMin: 1000, amountMax: 2000 }), TODAY)).toBe(true);
  });

  it("uses the reference value for delivery notes", () => {
    const doc = makeDoc({ doc_type: "delivery_note", total_amount: 900, net_payable: 0, status: "sent" });
    expect(matchesDocumentFilters(doc, withFilters({ amountMin: 500 }), TODAY)).toBe(true);
  });
});

describe("matchesDocumentFilters — aging", () => {
  it.each([
    ["0-30", "2026-09-06"],
    ["31-60", "2026-08-10"],
    ["61-90", "2026-07-15"],
    ["90+", "2026-05-01"],
  ] as const)("buckets %s for due %s", (bucket, due) => {
    const doc = makeDoc({ due_date: due });
    expect(matchesDocumentFilters(doc, withFilters({ aging: bucket }), TODAY)).toBe(true);
  });

  it("does not bucket a due date into the wrong range", () => {
    const doc = makeDoc({ due_date: "2026-09-06" });
    expect(matchesDocumentFilters(doc, withFilters({ aging: "31-60" }), TODAY)).toBe(false);
  });

  it("matches due-soon within 7 days", () => {
    const doc = makeDoc({ due_date: "2026-09-20" });
    expect(matchesDocumentFilters(doc, withFilters({ aging: "due-soon" }), TODAY)).toBe(true);
  });

  it("ignores aging for non-collectible documents", () => {
    const doc = makeDoc({ status: "draft", due_date: "2026-05-01" });
    expect(matchesDocumentFilters(doc, withFilters({ aging: "90+" }), TODAY)).toBe(false);
  });
});

describe("matchesDocumentFilters — fields", () => {
  it("filters by customer", () => {
    const doc = makeDoc({ customer_id: "cust-9" });
    expect(matchesDocumentFilters(doc, withFilters({ customerId: "cust-9" }), TODAY)).toBe(true);
    expect(matchesDocumentFilters(doc, withFilters({ customerId: "cust-1" }), TODAY)).toBe(false);
  });

  it("filters by item name or SKU", () => {
    const doc = makeDoc();
    expect(matchesDocumentFilters(doc, withFilters({ item: "ค่าบริการ" }), TODAY)).toBe(true);
    expect(matchesDocumentFilters(doc, withFilters({ item: "svc-01" }), TODAY)).toBe(true);
    expect(matchesDocumentFilters(doc, withFilters({ item: "ไม่มีอยู่" }), TODAY)).toBe(false);
  });

  it("filters by payment method, VAT and WHT flags", () => {
    const doc = makeDoc({ payment_method: "cash", vat_registered: true, wht_rate: 3, wht_amount: 30 });
    expect(matchesDocumentFilters(doc, withFilters({ method: "cash" }), TODAY)).toBe(true);
    expect(matchesDocumentFilters(doc, withFilters({ method: "cheque" }), TODAY)).toBe(false);
    expect(matchesDocumentFilters(doc, withFilters({ vatOnly: true }), TODAY)).toBe(true);
    expect(matchesDocumentFilters(doc, withFilters({ whtOnly: true }), TODAY)).toBe(true);
    expect(matchesDocumentFilters(makeDoc({ wht_rate: 0, wht_amount: 0 }), withFilters({ whtOnly: true }), TODAY)).toBe(false);
  });

  it("still honours the free-text query", () => {
    const doc = makeDoc();
    expect(matchesDocumentFilters(doc, withFilters({ q: "สมชาย" }), TODAY)).toBe(true);
    expect(matchesDocumentFilters(doc, withFilters({ q: "ไม่มีจริง" }), TODAY)).toBe(false);
  });
});

describe("sortDocuments", () => {
  const low = makeDoc({ id: "a", net_payable: 100, issue_date: "2026-09-01", due_date: "2026-09-30" });
  const high = makeDoc({ id: "b", net_payable: 900, issue_date: "2026-09-05", due_date: "2026-09-10" });
  const mid = makeDoc({ id: "c", net_payable: 500, issue_date: "2026-09-03", due_date: null });

  it("sorts newest first by default", () => {
    expect(sortDocuments([low, high, mid], "newest").map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by amount", () => {
    expect(sortDocuments([low, high, mid], "amount_desc").map((d) => d.id)).toEqual(["b", "c", "a"]);
    expect(sortDocuments([low, high, mid], "amount_asc").map((d) => d.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by soonest due date, pushing undated last", () => {
    expect(sortDocuments([low, high, mid], "due_soonest").map((d) => d.id)).toEqual(["b", "a", "c"]);
  });
});

describe("countActiveFilters", () => {
  it("counts only non-default filters", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters(withFilters({ q: "x", aging: "90+", vatOnly: true }))).toBe(3);
  });
});
