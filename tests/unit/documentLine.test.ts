import { describe, expect, it } from "vitest";
import {
  cartonSaveQuantities,
  countPendingPriceReviews,
  countReviewableLines,
  findNextPendingPriceReview,
  hasCartonOption,
  isCartonUnitSelected,
  isPriceReviewRequired,
  isReviewableLine,
  lineBaseQuantity,
  pendingPriceReviewLines,
  priceDeviation,
  suggestedUnitPrice,
  type PriceReviewLine,
} from "../../src/lib/documentLine";

function line(overrides: Partial<PriceReviewLine> = {}): PriceReviewLine {
  return {
    isSectionMarker: false,
    item_name: "สินค้า",
    price_confirmed: false,
    ...overrides,
  };
}

describe("units and cartons", () => {
  it("detects a carton option only when both the unit and the factor exist", () => {
    expect(hasCartonOption({ quantity: 1, unit: "ลัง", carton_unit: "ลัง", qty_per_carton: 12 })).toBe(
      true,
    );
    expect(hasCartonOption({ quantity: 1, unit: "ชิ้น", carton_unit: null, qty_per_carton: 12 })).toBe(
      false,
    );
    expect(hasCartonOption({ quantity: 1, unit: "ลัง", carton_unit: "ลัง", qty_per_carton: 0 })).toBe(
      false,
    );
  });

  it("converts quantity to base units only while the carton unit is selected", () => {
    const byCarton = { quantity: 2, unit: "ลัง", carton_unit: "ลัง", qty_per_carton: 12 };
    const byPiece = { quantity: 2, unit: "ชิ้น", carton_unit: "ลัง", qty_per_carton: 12 };

    expect(isCartonUnitSelected(byCarton)).toBe(true);
    expect(isCartonUnitSelected(byPiece)).toBe(false);
    expect(lineBaseQuantity(byCarton)).toBe(24);
    expect(lineBaseQuantity(byPiece)).toBe(2);
  });

  it("converts a catalog price to the line's unit", () => {
    expect(suggestedUnitPrice(10, "ชิ้น", "ลัง", 12)).toBe(10);
    expect(suggestedUnitPrice(10, "ลัง", "ลัง", 12)).toBe(120);
    expect(suggestedUnitPrice(10, "ลัง", null, null)).toBe(10);
  });
});

describe("priceDeviation", () => {
  const base = { baseUnitPrice: 100, unit: "ชิ้น", warnPct: 10 };

  it("stays quiet inside the threshold and reports the expected price outside it", () => {
    expect(priceDeviation({ ...base, unitPrice: 108 })).toBeNull(); // 8% off
    expect(priceDeviation({ ...base, unitPrice: 120 })).toBe(100); // 20% off
    expect(priceDeviation({ ...base, unitPrice: 80 })).toBe(100); // 20% off, below
  });

  it("is disabled by warnPct <= 0", () => {
    expect(priceDeviation({ ...base, unitPrice: 999, warnPct: 0 })).toBeNull();
    expect(priceDeviation({ ...base, unitPrice: 999, warnPct: -5 })).toBeNull();
  });

  it("never fires without both prices (free-text lines, empty rows)", () => {
    expect(priceDeviation({ ...base, unitPrice: 999, baseUnitPrice: null })).toBeNull();
    expect(priceDeviation({ ...base, unitPrice: 0 })).toBeNull();
    expect(priceDeviation({ ...base, unitPrice: 999, baseUnitPrice: 0 })).toBeNull();
  });

  it("compares against the carton price when the line is sold by carton", () => {
    // Catalog ฿10/piece, sold by the carton of 12 → expected ฿120.
    const cartonLine = {
      baseUnitPrice: 10,
      unit: "ลัง",
      cartonUnit: "ลัง",
      qtyPerCarton: 12,
      warnPct: 10,
    };
    expect(priceDeviation({ ...cartonLine, unitPrice: 120 })).toBeNull();
    expect(priceDeviation({ ...cartonLine, unitPrice: 300 })).toBe(120);
  });
});

describe("cartonSaveQuantities", () => {
  const carton = { cartonUnit: "ลัง", qtyPerCarton: 12 };

  it("returns pieces for stock and cartons for the paper", () => {
    expect(cartonSaveQuantities({ quantity: 3, unit: "ลัง", ...carton })).toEqual({
      baseQuantity: 36,
      qtyCarton: 3,
      cartonUnit: "ลัง",
    });
  });

  it("returns null when the line is not sold by the carton", () => {
    expect(cartonSaveQuantities({ quantity: 3, unit: "ชิ้น", ...carton })).toBeNull();
    expect(cartonSaveQuantities({ quantity: 3, unit: "ลัง", cartonUnit: null })).toBeNull();
    expect(cartonSaveQuantities({ quantity: 3, unit: "ลัง", cartonUnit: "ลัง", qtyPerCarton: 0 })).toBeNull();
  });

  it("rounds the carton count and multiplies exactly", () => {
    expect(cartonSaveQuantities({ quantity: 1.5, unit: "ลัง", ...carton })).toEqual({
      baseQuantity: 18,
      qtyCarton: 1.5,
      cartonUnit: "ลัง",
    });
  });
});

describe("price review policy", () => {  it("requires review only when the workspace opted in and prices exist", () => {
    expect(isPriceReviewRequired({ requireDnPriceReview: true, isBlankForm: false })).toBe(true);
    expect(isPriceReviewRequired({ requireDnPriceReview: false, isBlankForm: false })).toBe(false);
    expect(isPriceReviewRequired({ requireDnPriceReview: true, isBlankForm: true })).toBe(false);
  });

  it("treats markers as never reviewable, and unnamed rows per caller policy", () => {
    const marker = line({ isSectionMarker: true, item_name: "กลุ่ม SO" });
    const unnamed = line({ item_name: "   " });

    expect(isReviewableLine(marker)).toBe(false);
    expect(isReviewableLine(unnamed)).toBe(false); // deal form: named only
    expect(isReviewableLine(unnamed, { namedOnly: false })).toBe(true); // quotation DN
  });

  it("counts reviewable vs pending lines", () => {
    const lines = [
      line(), // named, unconfirmed
      line({ price_confirmed: true }),
      line({ item_name: "" }),
      line({ isSectionMarker: true, item_name: "หัวข้อ" }),
    ];

    expect(countReviewableLines(lines)).toBe(2);
    expect(countPendingPriceReviews(lines)).toBe(1);
    expect(countReviewableLines(lines, { namedOnly: false })).toBe(3);
    expect(countPendingPriceReviews(lines, { namedOnly: false })).toBe(2);
  });

  it("finds the first pending line for the 'go to next' jump", () => {
    const first = line({ item_name: "A" });
    const second = line({ item_name: "B" });
    const lines = [line({ price_confirmed: true }), line({ isSectionMarker: true, item_name: "SO-1" }), first, second];

    expect(findNextPendingPriceReview(lines)).toBe(first);
    expect(findNextPendingPriceReview(lines.slice(0, 2))).toBeNull();
    expect(pendingPriceReviewLines(lines)).toEqual([first, second]);
  });
});
