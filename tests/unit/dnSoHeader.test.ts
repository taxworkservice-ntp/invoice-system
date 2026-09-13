import { describe, expect, it } from "vitest";
import {
  buildDnBlocks,
  buildDnSoHeaderPlan,
  getDnSoHeaderText,
  planDnRows,
  type DnRefMap,
} from "../../src/lib/dnGroups";
import { estimateLineItemHeight } from "../../src/lib/printRowHeight";
import { normalizeSoHeader } from "../../src/lib/print";
import type { DocumentLineItem } from "../../src/types";

function line(overrides: Partial<DocumentLineItem> & { id: string }): DocumentLineItem {
  return {
    document_id: "doc-1",
    user_id: "user-1",
    item_id: null,
    item_name: "งานเคลือบ",
    line_note: null,
    item_sku: null,
    item_type: "service",
    unit: "ชิ้น",
    unit_price: 100,
    quantity: 1,
    base_quantity: null,
    discount_percent: 0,
    discount_amount: 0,
    qty_carton: null,
    carton_unit: null,
    source_document_id: null,
    source_line_item_id: null,
    source_delivered_qty: null,
    source_unit_price: null,
    image_url: null,
    line_total: 100,
    hide_amounts_on_print: false,
    sort_order: 0,
    created_at: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

describe("SO group header predicate (opt-in, 5% case)", () => {
  it("collapses to null for non-DN docs and blank text", () => {
    expect(getDnSoHeaderText("invoice", "SO1")).toBeNull();
    expect(getDnSoHeaderText("delivery_note", null)).toBeNull();
    expect(getDnSoHeaderText("delivery_note", "   ")).toBeNull();
    expect(getDnSoHeaderText("delivery_note", "  SO7944758301/Z033248905  ")).toBe(
      "SO7944758301/Z033248905",
    );
  });

  it("normalizeSoHeader agrees on empty means no header", () => {
    expect(normalizeSoHeader(undefined)).toBeNull();
    expect(normalizeSoHeader("  ")).toBeNull();
    expect(normalizeSoHeader(" SO1 ")).toBe("SO1");
  });
});

describe("DN single-group plan", () => {
  const lines = [line({ id: "l1" }), line({ id: "l2", item_name: "งานปั้ม" })];

  it("numbers every line 1.x with one SO-only header", () => {
    const plan = buildDnSoHeaderPlan(lines, "SO1 Part no.2");
    expect(plan.map((p) => p.number)).toEqual(["1.1", "1.2"]);
    expect(plan[0].header).toMatchObject({ g: 1, number: "", soHeader: "SO1 Part no.2" });
    expect(plan[1].header).toBeNull();
    // No sum footer (DN amounts usually hidden), no spacers (one group).
    expect(plan.every((p) => p.footerAfter === null && !p.spacerAfter)).toBe(true);
  });

  it("takes precedence over source grouping inputs", () => {
    // Even lines carrying quotation back-refs stay in the single SO group —
    // an explicitly typed header wins on the DN itself.
    const sourced = lines.map((l) => ({ ...l, source_document_id: "qt-1", source_line_item_id: `src-${l.id}` }));
    const plan = buildDnSoHeaderPlan(sourced, "SO1");
    expect(plan.map((p) => p.number)).toEqual(["1.1", "1.2"]);
  });
});

describe("invoice group carries the frozen snapshot", () => {
  it("threads soHeader from refMap to the header payload", () => {
    const lines = [
      line({ id: "l1", source_document_id: "dn-1", source_line_item_id: "s1" }),
      line({ id: "l2", source_document_id: "dn-1", source_line_item_id: "s2" }),
    ];
    const refMap: DnRefMap = {
      l1: { number: "DN-1", issue_date: null, kind: "delivery_note", soHeader: "SO1" },
      l2: { number: "DN-1", issue_date: null, kind: "delivery_note", soHeader: "SO1" },
    };
    const plan = planDnRows(buildDnBlocks(lines, refMap));
    expect(plan.map((p) => p.number)).toEqual(["1.1", "1.2"]);
    expect(plan[0].header).toMatchObject({ g: 1, number: "DN-1", soHeader: "SO1" });
  });

  it("blank snapshots stay single-line headers", () => {
    const lines = [line({ id: "l1", source_document_id: "dn-1", source_line_item_id: "s1" })];
    const refMap: DnRefMap = {
      l1: { number: "DN-1", issue_date: null, kind: "delivery_note", soHeader: "  " },
    };
    const plan = planDnRows(buildDnBlocks(lines, refMap));
    expect(plan[0].header?.soHeader).toBeNull();
  });
});

describe("pagination reserve for the SO second line", () => {
  const item = line({ id: "l1" });

  it("charges nothing when the header is absent", () => {
    const base = estimateLineItemHeight(item, "classic_v2", { hasDnGroupBand: true });
    expect(estimateLineItemHeight(item, "classic_v2", { hasDnGroupBand: true, dnGroupSoHeader: null })).toBe(base);
    expect(estimateLineItemHeight(item, "classic_v2", { hasDnGroupBand: true, dnGroupSoHeader: "  " })).toBe(base);
  });

  it("charges at least one extra text line when present, more when wrapped", () => {
    const base = estimateLineItemHeight(item, "classic_v2", { hasDnGroupBand: true });
    const one = estimateLineItemHeight(item, "classic_v2", { hasDnGroupBand: true, dnGroupSoHeader: "SO1" });
    expect(one).toBeGreaterThan(base);
    const long = estimateLineItemHeight(item, "classic_v2", {
      hasDnGroupBand: true,
      dnGroupSoHeader: `SO7944758301/Z033248905 Part no.25120021 (เห็ด) ${"รายละเอียดเพิ่มเติม ".repeat(10)}`,
    });
    expect(long).toBeGreaterThan(one);
  });

  it("never charges modern templates", () => {
    const base = estimateLineItemHeight(item, "modern");
    expect(estimateLineItemHeight(item, "modern", { dnGroupSoHeader: "SO1" })).toBe(base);
  });
});
