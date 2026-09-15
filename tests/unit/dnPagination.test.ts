import { describe, expect, it } from "vitest";
import { buildDnSectionPlan, DN_SECTION_TAG } from "../../src/lib/dnGroups";
import { estimateLineItemHeight } from "../../src/lib/printRowHeight";
import { paginateRows, type ClassicV2FontScales } from "../../src/lib/pagination";
import type { DocumentLineItem as Line } from "../../src/types";

function line(overrides: Partial<Line> & { id: string }): Line {
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

function marker(id: string, header: string): Line {
  return line({
    id,
    item_name: header,
    line_note: DN_SECTION_TAG,
    unit_price: 0,
    quantity: 0,
    line_total: 0,
  });
}

// Mirrors the workspace profile that triggered the bug: a delivery note at
// items = xxlarge (1.6), num = pt:10, thead = large, header_info = pt:9.5,
// with compact signature and a full page header.
const DN_SCALES: ClassicV2FontScales = {
  header: 1.2,
  header_company: 1.2,
  header_title: 1,
  header_info: 9.5 / 7.5,
  items: 1.6,
  num: 10 / 7.5,
  thead: 1.2,
  totals: 1.2,
  totals_net: 1.2,
  payment: 1.2,
  terms: 1.2,
  footer: 1.2,
};
const META_RESERVE_MM = 15.6;
const SPACE_BONUS = { first: 5.5, firstMulti: 0, continuation: 0, last: 5.5 };

const NOTE =
  "สี / ฟอยล์: ฟอยล์ทองด้าน\nขนาดใบพิมพ์ กว้าง x ยาว: 33 x 44 มม.\nตำแหน่ง: กลางปก\nวัสดุ: อาร์ตการ์ด 260g";

type Unit = {
  item: Line;
  hasHeader: boolean;
  hasFooterAfter: boolean;
  hasSpacerAfter: boolean;
  soHeader: string | null;
};

/** The exact repro shape: two items, each led by its own SO section header. */
function dnUnits(): Unit[] {
  const lines = [
    marker("m1", "SO7944758301/Z033248905 Part no.25120021 (เห็ด)"),
    line({ id: "a", item_name: "เคลือบด้าน / เคลือบเงา (Lamination)", line_note: NOTE }),
    marker("m2", "SO7948302/Z033248906 Part no.25120022 (เห็ด)"),
    line({ id: "b", item_name: "เจาะรู + ติดตาไก่", line_note: NOTE }),
  ];
  return buildDnSectionPlan(lines, {}).map((entry) => ({
    item: entry.item,
    hasHeader: entry.header !== null,
    hasFooterAfter: entry.footerAfter !== null,
    hasSpacerAfter: entry.spacerAfter,
    soHeader: entry.header?.soHeader ?? null,
  }));
}

function estimate(unit: Unit): number {
  return (
    estimateLineItemHeight(unit.item, "classic_v2", {
      fontScale: DN_SCALES.items,
      numScale: DN_SCALES.num,
      hideDeliveryAmounts: false,
      hasDnGroupBand: unit.hasHeader || unit.hasFooterAfter,
      dnGroupSoHeader: unit.soHeader,
    }) + (unit.hasSpacerAfter ? 3 : 0)
  );
}

describe("classic V2 DN pagination", () => {
  it("keeps a hidden-amount 2-row DN on one page when the totals block is not reserved", () => {
    const batches = paginateRows(dnUnits(), "classic_v2", "line_items", {
      estimateHeight: estimate,
      fontScale: DN_SCALES,
      extraReserveMm: META_RESERVE_MM,
      continuationFullHeader: true,
      spaceBonusMm: SPACE_BONUS,
      reserveTotalsBlock: false,
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].mode).toBe("single");
    expect(batches[0].items).toHaveLength(2);
  });

  it("still splits when the unrendered totals block is reserved (regression guard)", () => {
    const batches = paginateRows(dnUnits(), "classic_v2", "line_items", {
      estimateHeight: estimate,
      fontScale: DN_SCALES,
      extraReserveMm: META_RESERVE_MM,
      continuationFullHeader: true,
      spaceBonusMm: SPACE_BONUS,
    });
    expect(batches.map((batch) => batch.mode)).toEqual(["first", "last"]);
  });
});

describe("classic V2 DN group-band height", () => {
  const item = line({ id: "a", item_name: "งานเคลือบ", line_note: null });

  it("charges a fixed padding + one scaled text line (unchanged at scale 1)", () => {
    const noBandAt1 = estimateLineItemHeight(item, "classic_v2", { fontScale: 1 });
    const bandAt1 = estimateLineItemHeight(item, "classic_v2", {
      fontScale: 1,
      hasDnGroupBand: true,
    });
    expect(bandAt1 - noBandAt1).toBeCloseTo(6.5, 5);

    const noBand = estimateLineItemHeight(item, "classic_v2", { fontScale: 1.6 });
    const band = estimateLineItemHeight(item, "classic_v2", {
      fontScale: 1.6,
      hasDnGroupBand: true,
    });
    expect(band - noBand).toBeCloseTo(3.1 + 3.4 * 1.6, 5);
  });
});
