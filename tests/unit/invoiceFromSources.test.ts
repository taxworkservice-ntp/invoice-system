import { describe, expect, it } from "vitest";
import {
  buildInvoiceLineRecords,
  buildInvoicePreview,
  invoiceLineNet,
  type InvoiceSource,
} from "../../src/lib/invoiceFromSources";

function source(id: string, overrides: Partial<InvoiceSource> = {}): InvoiceSource {
  return {
    id,
    refItemName: `ใบส่งของ ${id} วันที่: 1 ต.ค. 69`,
    refLineNote: null,
    detailHeaderName: `ใบส่งของ ${id}`,
    detailHeaderNote: "วันที่ส่งของ: 1 ต.ค. 69",
    lines: [],
    ...overrides,
  };
}

describe("invoiceLineNet", () => {
  it("applies percent discounts before amount discounts", () => {
    expect(invoiceLineNet({ unit_price: 100, quantity: 3, discount_percent: 10 })).toBe(270);
    expect(invoiceLineNet({ unit_price: 100, quantity: 3, discount_amount: 25 })).toBe(275);
    expect(invoiceLineNet({ unit_price: 100, quantity: 0 })).toBe(0);
  });
});

describe("buildInvoiceLineRecords", () => {
  const sources: InvoiceSource[] = [
    source("DN-1", {
      lines: [
        {
          source_line_item_id: "line-1",
          item_name: "กล่อง A",
          unit: "กล่อง",
          unit_price: 100,
          quantity: 2,
          source_delivered_qty: 10,
          source_unit_price: 90,
        },
        {
          source_line_item_id: "line-2",
          item_name: "กล่อง B",
          unit_price: 50,
          quantity: 1.5,
          discount_percent: 10,
        },
        { source_line_item_id: "zero", item_name: "ไม่ต้องออกบิล", unit_price: 999, quantity: 0 },
      ],
    }),
    source("DN-2", {
      lines: [
        { source_line_item_id: "line-3", item_name: "ค่าขนส่ง", unit_price: 300, quantity: 1 },
      ],
    }),
    source("DN-EMPTY"),
  ];
  const manual = [{ item_name: "ค่าติดตั้ง", unit: "ครั้ง", unit_price: 500, quantity: 1 }];

  it("builds one line per source in reference mode plus manual lines", () => {
    const records = buildInvoiceLineRecords({ mode: "reference", sources, manualLines: manual });

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      item_name: "ใบส่งของ DN-1 วันที่: 1 ต.ค. 69",
      quantity: 1,
      unit: "",
      unit_price: 267.5,
      line_total: 267.5,
      source_document_id: "DN-1",
      source_line_item_id: null,
      sort_order: 0,
    });
    expect(records[1]).toMatchObject({
      item_name: "ใบส่งของ DN-2 วันที่: 1 ต.ค. 69",
      unit_price: 300,
      source_document_id: "DN-2",
      sort_order: 1,
    });
    expect(records[2]).toMatchObject({
      item_name: "ค่าติดตั้ง",
      source_document_id: null,
      line_total: 500,
      sort_order: 2,
    });
  });

  it("builds a group marker and item rows in detail mode", () => {
    const records = buildInvoiceLineRecords({ mode: "detail", sources, manualLines: manual });

    expect(records).toHaveLength(6);
    expect(records[0]).toMatchObject({
      item_name: "ใบส่งของ DN-1",
      quantity: 0,
      unit_price: 0,
      line_note: "วันที่ส่งของ: 1 ต.ค. 69",
    });
    expect(records[1]).toMatchObject({
      item_name: "กล่อง A",
      quantity: 2,
      line_total: 200,
      source_delivered_qty: 10,
      source_unit_price: 90,
    });
    expect(records[2]).toMatchObject({ item_name: "กล่อง B", line_total: 67.5 });
    expect(records[3]).toMatchObject({ item_name: "ใบส่งของ DN-2", quantity: 0 });
    expect(records[4]).toMatchObject({ item_name: "ค่าขนส่ง", line_total: 300 });
    expect(records[5]).toMatchObject({ item_name: "ค่าติดตั้ง", line_total: 500 });
  });

  it("keeps the same billable total in both modes", () => {
    const sum = (records: ReturnType<typeof buildInvoiceLineRecords>) =>
      records
        .filter((record) => !(record.quantity === 0 && record.unit_price === 0))
        .reduce((total, record) => total + record.line_total, 0);

    const detail = buildInvoiceLineRecords({ mode: "detail", sources, manualLines: manual });
    const reference = buildInvoiceLineRecords({ mode: "reference", sources, manualLines: manual });
    expect(sum(detail)).toBeCloseTo(sum(reference), 6);
  });
});

describe("buildInvoicePreview", () => {
  const sources: InvoiceSource[] = [
    source("DN-1", {
      lines: [
        {
          source_line_item_id: "l1",
          item_name: "กล่อง A",
          unit: "กล่อง",
          unit_price: 100,
          quantity: 2,
        },
        { source_line_item_id: "l2", item_name: "กล่อง B", unit_price: 50, quantity: 1 },
      ],
    }),
    source("DN-2", {
      lines: [{ source_line_item_id: "l3", item_name: "ค่าขนส่ง", unit_price: 300, quantity: 1 }],
    }),
  ];
  const manual = [{ item_name: "ค่าติดตั้ง", unit_price: 500, quantity: 1 }];

  it("groups detail rows under their source and hides the marker", () => {
    const records = buildInvoiceLineRecords({ mode: "detail", sources, manualLines: manual });
    const preview = buildInvoicePreview(records, "detail");

    expect(preview.mode).toBe("detail");
    if (preview.mode !== "detail") return;
    expect(preview.rowCount).toBe(4);
    expect(preview.groups.map((group) => group.label)).toEqual([
      "ใบส่งของ DN-1",
      "ใบส่งของ DN-2",
      "รายการเพิ่มเติม",
    ]);
    expect(preview.groups[0].rows.map((row) => row.name)).toEqual(["กล่อง A", "กล่อง B"]);
    expect(preview.groups[0].rows[0].total).toBe(200);
    expect(preview.groups[2].rows[0].isManual).toBe(true);
  });

  it("lists one row per source plus manual rows in reference mode", () => {
    const records = buildInvoiceLineRecords({ mode: "reference", sources, manualLines: manual });
    const preview = buildInvoicePreview(records, "reference");

    expect(preview.mode).toBe("reference");
    if (preview.mode !== "reference") return;
    expect(preview.rowCount).toBe(3);
    expect(preview.rows.map((row) => row.name)).toEqual([
      "ใบส่งของ DN-1 วันที่: 1 ต.ค. 69",
      "ใบส่งของ DN-2 วันที่: 1 ต.ค. 69",
      "ค่าติดตั้ง",
    ]);
    expect(preview.rows[2].isManual).toBe(true);
  });
});
