import { describe, expect, it } from "vitest";
import { matchesDocumentQuery } from "../../src/lib/documentSearch";
import type { Document } from "../../src/types";

const doc = {
  doc_number: "INV-2026-0042",
  note: "ชำระภายใน 30 วัน",
  customer_po_number: "PO-7788",
  task_name: "ติดตั้งระบบ",
  customer: { name: "บริษัท สมชาย จำกัด" },
  line_items: [
    { item_name: "ค่าบริการติดตั้ง" },
    { item_name: "อะไหล่ปั๊มน้ำ" },
  ],
} as unknown as Document;

describe("matchesDocumentQuery", () => {
  it("matches everything on an empty query", () => {
    expect(matchesDocumentQuery(doc, "   ")).toBe(true);
  });

  it("matches the document number case-insensitively", () => {
    expect(matchesDocumentQuery(doc, "inv-2026")).toBe(true);
  });

  it("matches the customer name", () => {
    expect(matchesDocumentQuery(doc, "สมชาย")).toBe(true);
  });

  it("matches the note, PO and task fields", () => {
    expect(matchesDocumentQuery(doc, "30 วัน")).toBe(true);
    expect(matchesDocumentQuery(doc, "PO-7788")).toBe(true);
    expect(matchesDocumentQuery(doc, "ติดตั้งระบบ")).toBe(true);
  });

  it("matches line item names", () => {
    expect(matchesDocumentQuery(doc, "ปั๊มน้ำ")).toBe(true);
  });

  it("requires every term to match (AND)", () => {
    expect(matchesDocumentQuery(doc, "สมชาย ปั๊มน้ำ")).toBe(true);
    expect(matchesDocumentQuery(doc, "สมชาย ไม่มีจริง")).toBe(false);
  });
});
