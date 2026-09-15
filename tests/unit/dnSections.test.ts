import { describe, expect, it } from "vitest";
import {
  buildDnBlocks,
  buildDnSectionPlan,
  buildDnSoHeaderPlan,
  DN_SECTION_TAG,
  filterDnRefMarkers,
  filterDnRenderLines,
  getDnLineSectionMap,
  getDnSectionDisplayNumbers,
  getDnSectionHeaders,
  getDnSectionMarkersWithoutChildren,
  getLegacyDnHeaderForConversion,
  isDnSectionMarker,
  joinDnSectionHeaders,
  planDnRows,
  resolveSectionSoHeader,
  splitDnSectionHeaders,
  type DnRefMap,
} from "../../src/lib/dnGroups";
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

function marker(id: string, header: string): DocumentLineItem {
  return line({
    id,
    item_name: header,
    line_note: DN_SECTION_TAG,
    unit_price: 0,
    quantity: 0,
    line_total: 0,
  });
}

describe("section marker predicate", () => {
  it("accepts qty-0 price-0 sourceless tagged lines only", () => {
    expect(isDnSectionMarker(marker("m", "SO1"))).toBe(true);
    // Tag may share the note with other text on its own line.
    expect(isDnSectionMarker({ ...marker("m2", "SO1"), line_note: `note\n${DN_SECTION_TAG}` })).toBe(true);
    expect(isDnSectionMarker(line({ id: "a" }))).toBe(false);
    expect(isDnSectionMarker({ ...marker("m3", "SO1"), quantity: 1 })).toBe(false);
    expect(isDnSectionMarker({ ...marker("m4", "SO1"), unit_price: 5 })).toBe(false);
    expect(
      isDnSectionMarker({ ...marker("m5", "SO1"), source_document_id: "dn-1" }),
    ).toBe(false);
    expect(isDnSectionMarker({ ...marker("m6", "SO1"), line_note: "[USAGE_BILL]" })).toBe(false);
    expect(isDnSectionMarker({ ...marker("m7", "SO1"), line_note: null })).toBe(false);
  });
});

describe("section header extraction", () => {
  it("returns ordered non-empty headers, skipping lines and blank markers", () => {
    const lines = [
      line({ id: "l1" }),
      marker("m1", "  SO1 Part no.2  "),
      line({ id: "l2" }),
      marker("m2", "   "),
      marker("m3", "SO2"),
    ];
    expect(getDnSectionHeaders(lines)).toEqual(["SO1 Part no.2", "SO2"]);
  });
});

describe("multi-section row plan", () => {
  it("numbers each section G / G.j with a continuous top sequence", () => {
    const lines = [
      marker("m1", "SO1"),
      line({ id: "l1" }),
      line({ id: "l2", item_name: "งานปั้ม" }),
      marker("m2", "SO2"),
      line({ id: "l3" }),
    ];
    const plan = buildDnSectionPlan(lines, {});
    expect(plan.map((p) => p.number)).toEqual(["1.1", "1.2", "2.1"]);
    expect(plan[0].header).toMatchObject({ g: 1, number: "", soHeader: "SO1" });
    expect(plan[1].header).toBeNull();
    expect(plan[2].header).toMatchObject({ g: 2, number: "", soHeader: "SO2" });
    // Boundary between sections breathes; document end does not trail.
    expect(plan[1].spacerAfter).toBe(true);
    expect(plan[2].spacerAfter).toBe(false);
    // No sum footers inside marker sections.
    expect(plan.every((p) => p.footerAfter === null)).toBe(true);
  });

  it("keeps unmarked runs on today's auto-grouping with shared numbering", () => {
    const lines = [
      line({ id: "l0" }),
      marker("m1", "SO1"),
      line({ id: "l1" }),
    ];
    const plan = buildDnSectionPlan(lines, {});
    expect(plan.map((p) => p.number)).toEqual(["1", "2.1"]);
    expect(plan[1].header).toMatchObject({ g: 2, soHeader: "SO1" });
  });

  it("auto-groups source runs inside unmarked segments only", () => {
    const lines = [
      line({ id: "l1", source_document_id: "dn-1", source_line_item_id: "s1" }),
      line({ id: "l2", source_document_id: "dn-1", source_line_item_id: "s2" }),
      marker("m1", "SO1"),
      // Sourced lines under a marker stay flat — no nested G.j.k.
      line({ id: "l3", source_document_id: "dn-2", source_line_item_id: "s3" }),
      line({ id: "l4", source_document_id: "dn-2", source_line_item_id: "s4" }),
    ];
    const refMap: DnRefMap = {
      l1: { number: "DN-1", issue_date: null, kind: "delivery_note" },
      l2: { number: "DN-1", issue_date: null, kind: "delivery_note" },
      l3: { number: "DN-2", issue_date: null, kind: "delivery_note" },
      l4: { number: "DN-2", issue_date: null, kind: "delivery_note" },
    };
    const plan = buildDnSectionPlan(lines, refMap);
    expect(plan.map((p) => p.number)).toEqual(["1.1", "1.2", "2.1", "2.2"]);
    expect(plan[0].header).toMatchObject({ g: 1, number: "DN-1" });
    expect(plan[2].header).toMatchObject({ g: 2, number: "", soHeader: "SO1" });
  });

  it("ignores blank markers and drops trailing/duplicate markers", () => {
    const lines = [
      marker("m1", "   "),
      line({ id: "l1" }),
      marker("m2", "SO1"),
      marker("m3", "SO2"),
      line({ id: "l2" }),
      marker("m4", "SO-trailing"),
    ];
    const plan = buildDnSectionPlan(lines, {});
    // Blank marker: no section. m2 superseded by m3 (empty run). Trailing
    // marker has no lines — all vanish without a trace.
    expect(plan.map((p) => p.number)).toEqual(["1", "2.1"]);
    expect(plan[1].header).toMatchObject({ g: 2, soHeader: "SO2" });
  });

  it("is byte-identical to the legacy plan when no markers exist", () => {
    const lines = [
      line({ id: "l1", source_document_id: "dn-1", source_line_item_id: "s1" }),
      line({ id: "l2", source_document_id: "dn-1", source_line_item_id: "s2" }),
      line({ id: "l3" }),
    ];
    const refMap: DnRefMap = {
      l1: { number: "DN-1", issue_date: null, kind: "delivery_note" },
      l2: { number: "DN-1", issue_date: null, kind: "delivery_note" },
    };
    expect(buildDnSectionPlan(lines, refMap)).toEqual(planDnRows(buildDnBlocks(lines, refMap)));
  });
});

describe("legacy single-header conversion", () => {
  it("returns trimmed text only when a header exists and no markers do", () => {
    const lines = [line({ id: "l1" })];
    expect(getLegacyDnHeaderForConversion(lines, "  SO1 Part no.2  ")).toBe("SO1 Part no.2");
    expect(getLegacyDnHeaderForConversion(lines, null)).toBeNull();
    expect(getLegacyDnHeaderForConversion(lines, "   ")).toBeNull();
    expect(getLegacyDnHeaderForConversion([marker("m", "SO9"), ...lines], "SO1")).toBeNull();
  });

  it("a converted single marker prints exactly like the legacy whole-doc header", () => {
    const lines = [line({ id: "l1" }), line({ id: "l2", item_name: "งานปั้ม" })];
    const legacy = buildDnSoHeaderPlan(lines, "SO1");
    const converted = buildDnSectionPlan([marker("m", "SO1"), ...lines], {});
    expect(converted.map((p) => p.number)).toEqual(legacy.map((p) => p.number));
    expect(converted.map((p) => p.header)).toEqual(legacy.map((p) => p.header));
    expect(converted.map((p) => [p.footerAfter, p.spacerAfter])).toEqual(
      legacy.map((p) => [p.footerAfter, p.spacerAfter]),
    );
  });
});

describe("section header freeze encoding", () => {
  it("joins blank-filtered with newlines and splits back losslessly", () => {
    const joined = joinDnSectionHeaders(["  SO1  ", "", null, undefined, "SO2"]);
    expect(joined).toBe("SO1\nSO2");
    expect(splitDnSectionHeaders(joined)).toEqual(["SO1", "SO2"]);
    expect(splitDnSectionHeaders(null)).toEqual([]);
    expect(splitDnSectionHeaders("  ")).toEqual([]);
    // Legacy " / "-joined values stay one printable line (history untouched).
    expect(splitDnSectionHeaders("SO1 / SO2")).toEqual(["SO1 / SO2"]);
  });
});

describe("invoice section groups (one group per DN section)", () => {
  const sectionLines = [
    line({ id: "l1", source_document_id: "dn-1", source_line_item_id: "s1" }),
    line({ id: "l2", source_document_id: "dn-1", source_line_item_id: "s2" }),
    line({ id: "l3", source_document_id: "dn-1", source_line_item_id: "s3" }),
    line({ id: "l4", source_document_id: "dn-1", source_line_item_id: "s4" }),
  ];
  const sectionRef = (section: number | null, soHeader: string | null): DnRefMap[string] => ({
    number: "DN-2026-09-099",
    issue_date: "2026-09-13",
    kind: "delivery_note",
    soHeader,
    section,
  });

  it("getDnLineSectionMap mirrors the plan's run-splitting", () => {
    const dnLines = [
      line({ id: "u0" }),
      marker("m1", "SO1"),
      line({ id: "l1" }),
      line({ id: "l2" }),
      marker("mBlank", "   "),
      line({ id: "u1" }),
      marker("m2", "SO2"),
      line({ id: "l3" }),
    ];
    const map = getDnLineSectionMap(dnLines);
    expect(map.get("u0")).toBeNull();
    expect(map.get("l1")).toBe(0);
    expect(map.get("l2")).toBe(0);
    // Blank marker ends the run without starting one.
    expect(map.get("u1")).toBeNull();
    expect(map.get("l3")).toBe(1);
    expect(map.has("m1")).toBe(false);
  });

  it("resolveSectionSoHeader picks the section entry, legacy stays whole", () => {
    const frozen = "SO1\nSO2";
    expect(resolveSectionSoHeader(frozen, 0)).toBe("SO1");
    expect(resolveSectionSoHeader(frozen, 1)).toBe("SO2");
    expect(resolveSectionSoHeader(frozen, 9)).toBe(frozen);
    expect(resolveSectionSoHeader(frozen, null)).toBe(frozen);
    expect(resolveSectionSoHeader("SO1", null)).toBe("SO1");
    expect(resolveSectionSoHeader(null, 0)).toBeNull();
    expect(resolveSectionSoHeader("  ", 0)).toBeNull();
  });

  it("splits one DN into one group per section with continuous numbering", () => {
    const refMap: DnRefMap = {
      l1: sectionRef(0, "SO1"),
      l2: sectionRef(0, "SO1"),
      l3: sectionRef(1, "SO2"),
      l4: sectionRef(1, "SO2"),
    };
    const plan = planDnRows(buildDnBlocks(sectionLines, refMap));
    expect(plan.map((p) => p.number)).toEqual(["1.1", "1.2", "2.1", "2.2"]);
    expect(plan[0].header).toMatchObject({ g: 1, number: "DN-2026-09-099", soHeader: "SO1" });
    expect(plan[2].header).toMatchObject({ g: 2, number: "DN-2026-09-099", soHeader: "SO2" });
    expect(plan[1].spacerAfter).toBe(true);
    expect(plan[3].spacerAfter).toBe(false);
  });

  it("null sections keep the legacy single group byte-identical", () => {
    const refMap: DnRefMap = {
      l1: sectionRef(null, "SO1 / SO2"),
      l2: sectionRef(null, "SO1 / SO2"),
      l3: sectionRef(null, "SO1 / SO2"),
      l4: sectionRef(null, "SO1 / SO2"),
    };
    const plan = planDnRows(buildDnBlocks(sectionLines, refMap));
    expect(plan.map((p) => p.number)).toEqual(["1.1", "1.2", "1.3", "1.4"]);
    expect(plan[0].header).toMatchObject({ g: 1, soHeader: "SO1 / SO2" });
  });

  it("ungrouped lines form their own group keeping the whole frozen text", () => {
    const refMap: DnRefMap = {
      l1: sectionRef(null, "SO1\nSO2"),
      l2: sectionRef(0, "SO1"),
      l3: sectionRef(0, "SO1"),
      l4: sectionRef(1, "SO2"),
    };
    const plan = planDnRows(buildDnBlocks(sectionLines, refMap));
    expect(plan.map((p) => p.number)).toEqual(["1.1", "2.1", "2.2", "3.1"]);
  });
});

describe("marker stripping", () => {
  it("filterDnRenderLines drops markers but keeps ordinary lines", () => {
    const normal = line({ id: "l1" });
    const zeroQty = line({ id: "l2", quantity: 0, unit_price: 0, line_total: 0 });
    const lines = [normal, marker("m", "SO1"), zeroQty];
    expect(filterDnRenderLines(lines).map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("filterDnRefMarkers keeps section markers for the row plan", () => {
    // Wiring invariant: the plan input must retain markers (they become
    // headers) while the rendered table drops them. Planning from
    // filterDnRenderLines output would silently lose every section.
    const lines = [marker("m", "SO1"), line({ id: "l1" })];
    expect(filterDnRefMarkers(lines).map((l) => l.id)).toEqual(["m", "l1"]);
    const plan = buildDnSectionPlan(filterDnRefMarkers(lines), {});
    expect(plan.map((p) => p.number)).toEqual(["1.1"]);
    expect(plan[0].header).toMatchObject({ g: 1, soHeader: "SO1" });
    expect(buildDnSectionPlan(filterDnRenderLines(lines), {}).map((p) => p.number)).toEqual(["1"]);
  });
});

describe("form display numbering", () => {
  const formLine = (id: string, isSectionMarker = false, item_name = id) => ({
    id,
    isSectionMarker,
    item_name,
  });

  it("numbers sections G and children G.j; ungrouped lines keep the top counter", () => {
    const lines = [
      formLine("a"),
      formLine("m1", true, "SO1"),
      formLine("b"),
      formLine("c"),
      formLine("m2", true, "SO2"),
      formLine("d"),
      formLine("e"),
    ];
    const numbers = getDnSectionDisplayNumbers(lines);
    // "e" trails the last section, so it stays a child (3.2) — only a blank
    // marker or the end of list can end a section without a new heading.
    expect([...numbers.values()]).toEqual(["1", "2", "2.1", "2.2", "3", "3.1", "3.2"]);
  });

  it("a blank marker ends the section without consuming a number", () => {
    const lines = [
      formLine("m1", true, "SO1"),
      formLine("a"),
      formLine("m2", true, "   "),
      formLine("b"),
    ];
    const numbers = getDnSectionDisplayNumbers(lines);
    expect(numbers.get("m1")).toBe("1");
    expect(numbers.get("a")).toBe("1.1");
    expect(numbers.has("m2")).toBe(false);
    expect(numbers.get("b")).toBe("2");
  });

  it("degrades to a plain sequence with no markers", () => {
    const numbers = getDnSectionDisplayNumbers([formLine("a"), formLine("b")]);
    expect([...numbers.values()]).toEqual(["1", "2"]);
  });
});

describe("headings without children", () => {
  const formLine = (id: string, isSectionMarker = false, item_name = id) => ({
    id,
    isSectionMarker,
    item_name,
  });

  it("flags a non-blank heading with no item lines before the next heading/end", () => {
    const lines = [
      formLine("m1", true, "SO1"),
      formLine("a"),
      formLine("m2", true, "SO2"),
      formLine("m3", true, "SO3"),
      formLine("b"),
    ];
    const empty = getDnSectionMarkersWithoutChildren(lines);
    expect(empty.has("m1")).toBe(false);
    expect(empty.has("m2")).toBe(true);
    expect(empty.has("m3")).toBe(false);
  });

  it("ignores blank headings (blank text is handled by save validation)", () => {
    const empty = getDnSectionMarkersWithoutChildren([formLine("m", true, "")]);
    expect(empty.size).toBe(0);
  });
});
