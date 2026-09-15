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
const SPACE_BONUS = { first: 5.5, firstMulti: 0, continuation: 0, last: 5.5 };
// ชื่อโครงการ + PO NO. filled (the reported DN carried both).
const META_RESERVE_MM = 15.6;

const NOTE4 =
  "สี / ฟอยล์: ฟอยล์ทองด้าน\nขนาดใบพิมพ์ กว้าง x ยาว: 33 x 44 มม.\nตำแหน่ง: กลางปก\nวัสดุ: อาร์ตการ์ด 260g";
const NOTE3 = NOTE4.split("\n").slice(0, 3).join("\n");

type Unit = {
  item: Line;
  hasHeader: boolean;
  hasFooterAfter: boolean;
  hasSpacerAfter: boolean;
  soHeader: string | null;
  headerHasRefLine: boolean;
};

/** Two items, each led by its own SO section header (the reported shape). */
function dnUnits(): Unit[] {
  return buildDnSectionPlan(
    [
      marker("m1", "SO7944758301/Z033248905 Part no.25120021 (เห็ด)"),
      line({ id: "a", item_name: "เคลือบด้าน / เคลือบเงา (Lamination)", line_note: NOTE4 }),
      marker("m2", "SO7948302/Z033248906 Part no.25120022 (เห็ด)"),
      line({ id: "b", item_name: "เจาะรู + ติดตาไก่", line_note: NOTE3 }),
    ],
    {},
  ).map((entry) => ({
    item: entry.item,
    hasHeader: entry.header !== null,
    hasFooterAfter: entry.footerAfter !== null,
    hasSpacerAfter: entry.spacerAfter,
    soHeader: entry.header?.soHeader ?? null,
    headerHasRefLine: !!entry.header?.number,
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

function paginate(reserveTotalsBlock: boolean) {
  return paginateRows(dnUnits(), "classic_v2", "line_items", {
    estimateHeight: estimate,
    fontScale: DN_SCALES,
    extraReserveMm: META_RESERVE_MM,
    continuationFullHeader: true,
    spaceBonusMm: SPACE_BONUS,
    reserveTotalsBlock,
  });
}

describe("classic V2 DN pagination", () => {
  it("keeps a hidden-amount 2-row DN with section headers on one page", () => {
    // The phantom totals reserve (a block a hidden-amount DN never draws) is
    // what used to push this onto a second page.
    const batches = paginate(false);
    expect(batches).toHaveLength(1);
    expect(batches[0].mode).toBe("single");
    expect(batches[0].items).toHaveLength(2);
  });

  it("still splits when the unrendered totals block is reserved (guard)", () => {
    expect(paginate(true).map((batch) => batch.mode)).toEqual(["first", "last"]);
  });
});

describe("classic V2 DN group-band height", () => {
  const item = line({ id: "a", item_name: "งานเคลือบ", line_note: null });

  it("charges a fixed padding + one scaled text line (non-DN unchanged)", () => {
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

// --- Calibrated DN estimator (notes + band scoped to delivery notes) ---

function dn107Units(): Unit[] {
  return buildDnSectionPlan(
    [
      marker("m1", "SO...1111"),
      line({ id: "a", item_name: "เคลือบด้าน", line_note: NOTE3 }),
      marker("m2", "SO...1222"),
      line({ id: "b", item_name: "เจาะรู", line_note: NOTE4 }),
      marker("m3", "SO...3333"),
      line({ id: "c", item_name: "เคลือบเงา", line_note: NOTE4 }),
    ],
    {},
  ).map((entry) => ({
    item: entry.item,
    hasHeader: entry.header !== null,
    hasFooterAfter: entry.footerAfter !== null,
    hasSpacerAfter: entry.spacerAfter,
    soHeader: entry.header?.soHeader ?? null,
    headerHasRefLine: !!entry.header?.number,
  }));
}

function estimateDn(unit: Unit, compact = false): number {
  return (
    estimateLineItemHeight(unit.item, "classic_v2", {
      fontScale: DN_SCALES.items,
      numScale: DN_SCALES.num,
      hideDeliveryAmounts: false,
      hasDnGroupBand: unit.hasHeader || unit.hasFooterAfter,
      dnGroupSoHeader: unit.soHeader,
      dnGroupHasRefLine: unit.headerHasRefLine,
      dnNotes: true,
      compactDn: compact,
    }) + (unit.hasSpacerAfter ? (compact ? 2.2 : 3) : 0)
  );
}

describe("calibrated DN metrics", () => {
  it("fits the 3-section DN-2026-09-107 (3-4 line notes) on one page", () => {
    const batches = paginateRows(dn107Units(), "classic_v2", "line_items", {
      estimateHeight: (unit) => estimateDn(unit),
      fontScale: DN_SCALES,
      continuationFullHeader: true,
      spaceBonusMm: SPACE_BONUS,
      reserveTotalsBlock: false,
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].mode).toBe("single");
    expect(batches[0].items).toHaveLength(3);
  });

  it("fits the same DN with compact spacing plus the measured fixed-block bonus", () => {
    const batches = paginateRows(dn107Units(), "classic_v2", "line_items", {
      estimateHeight: (unit) => estimateDn(unit, true),
      fontScale: DN_SCALES,
      continuationFullHeader: true,
      // compactSig 5.5 + compact-DN fixed 7.5 / 7 / 1.5 / 2
      spaceBonusMm: { first: 13, firstMulti: 7, continuation: 1.5, last: 7.5 },
      reserveTotalsBlock: false,
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].items).toHaveLength(3);
  });

  // Measured by `node scripts/print-layout-measure.mjs` (Chrome, real CSS).
  // The estimator is deliberately an upper bound: never lower a metric below
  // these without re-measuring, or pages can clip.
  const MEASURED = [
    { scale: 1, item0: 6.7, item4: 18.65, bandSo: 5.91, bandSo2: 8.89 },
    { scale: 1.6, item0: 8.76, item4: 27.58, bandSo: 7.69, bandSo2: 12.46 },
  ];
  const MEASURED_COMPACT = [
    { scale: 1, item0: 5.64, item4: 16.95, bandSo: 5.48, bandSo2: 8.24 },
    { scale: 1.6, item0: 7.54, item4: 25.43, bandSo: 7.13, bandSo2: 11.53 },
  ];
  const itemWith = (id: string, notes: number) =>
    line({
      id,
      item_name: "งานเคลือบ",
      line_note: notes ? NOTE4.split("\n").slice(0, notes).join("\n") : null,
    });

  for (const [label, rows, compact] of [
    ["", MEASURED, false],
    [" (compact)", MEASURED_COMPACT, true],
  ] as const) {
    for (const measured of rows) {
      it(`stays an upper bound on measured heights at scale ${measured.scale}${label}`, () => {
        const base = {
          fontScale: measured.scale,
          numScale: measured.scale,
          dnNotes: true,
          compactDn: compact,
        } as const;
        expect(
          estimateLineItemHeight(itemWith("p", 0), "classic_v2", base),
        ).toBeGreaterThanOrEqual(measured.item0);
        expect(
          estimateLineItemHeight(itemWith("n", 4), "classic_v2", base),
        ).toBeGreaterThanOrEqual(measured.item4);
        const band = (soHeader: string) =>
          estimateLineItemHeight(line({ id: "b", item_name: "x" }), "classic_v2", {
            ...base,
            hasDnGroupBand: true,
            dnGroupSoHeader: soHeader,
            dnGroupHasRefLine: false,
          });
        expect(band("SO1")).toBeGreaterThanOrEqual(measured.bandSo);
        expect(band("SO1\nSO2")).toBeGreaterThanOrEqual(measured.bandSo2);
      });
    }
  }
});
