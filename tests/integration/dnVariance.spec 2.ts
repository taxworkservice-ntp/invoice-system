import { describe, it, expect } from "vitest";
import { hasDnVariance, getDnVarianceParts } from "../../src/lib/dnVariance";

describe("dnVariance", () => {
  it("detects reduced quantity", () => {
    expect(
      hasDnVariance({
        deliveredQty: 10,
        billedQty: 8,
        unit: "piece",
        dnUnitPrice: 100,
        unitPrice: 100,
      }),
    ).toBe(true);
  });

  it("detects changed price", () => {
    expect(
      hasDnVariance({
        deliveredQty: 10,
        billedQty: 10,
        unit: "piece",
        dnUnitPrice: 100,
        unitPrice: 90,
      }),
    ).toBe(true);
  });

  it("no variance when equal", () => {
    expect(
      hasDnVariance({
        deliveredQty: 10,
        billedQty: 10,
        unit: "piece",
        dnUnitPrice: 100,
        unitPrice: 100,
      }),
    ).toBe(false);
  });

  it("builds qty-only and price-only parts", () => {
    const qty = getDnVarianceParts({
      deliveredQty: 10,
      billedQty: 8,
      unit: "piece",
      dnUnitPrice: 100,
      unitPrice: 100,
      dnDocNumber: "DN-1",
    });
    expect(qty).toEqual(["อ้างอิง DN-1: ส่ง 10 piece / เรียกเก็บ 8 piece"]);

    const price = getDnVarianceParts({
      deliveredQty: 10,
      billedQty: 10,
      unit: "piece",
      dnUnitPrice: 100,
      unitPrice: 90,
    });
    expect(price).toEqual(["ราคาปรับจาก 100.00 เป็น 90.00 บาท"]);

    const both = getDnVarianceParts({
      deliveredQty: 10,
      billedQty: 8,
      unit: "piece",
      dnUnitPrice: 100,
      unitPrice: 90,
    });
    expect(both.length).toBe(2);
  });
});
