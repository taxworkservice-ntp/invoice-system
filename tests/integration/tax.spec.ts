import { describe, it, expect } from "vitest";
import { calculateTax } from "../../src/lib/tax";
import type { TaxLineInput } from "../../src/lib/tax";

const line = (unit_price: number, quantity: number, discount_percent = 0): TaxLineInput => ({
  unit_price,
  quantity,
  discount_percent,
  item_name: "x",
  unit: "piece",
});

describe("calculateTax", () => {
  it("WHT is computed on the pre-VAT subtotal, never on total/net (I11)", () => {
    const items = [line(1000, 1)];
    const r = calculateTax(items, true, 7, 3);
    // subtotal = 1000, vat = 70, total = 1070, wht = 1000*3% = 30, net = 1040
    expect(r.subtotal).toBe(1000);
    expect(r.vatAmount).toBe(70);
    expect(r.total).toBe(1070);
    expect(r.whtAmount).toBe(30);
    expect(r.netPayable).toBe(1040);
  });

  it("WHT scales with subtotal and rounds to 2 dp", () => {
    const items = [line(333.33, 3)]; // subtotal = 999.99
    const r = calculateTax(items, true, 7, 5);
    expect(r.whtAmount).toBe(50); // round2(999.99*0.05)=round2(49.9995)=50
  });

  it("no VAT when not registered, but WHT still applies on pre-VAT subtotal", () => {
    const r = calculateTax([line(1000, 1)], false, 7, 3);
    expect(r.vatAmount).toBe(0);
    expect(r.whtAmount).toBe(30); // WHT is independent of VAT registration
    expect(r.total).toBe(1000);
    expect(r.netPayable).toBe(970);
  });

  it("applies document-level discount before tax", () => {
    const r = calculateTax([line(1000, 1)], true, 7, 0, { discountPercent: 10 });
    expect(r.discountAmount).toBe(100);
    expect(r.subtotal).toBe(900);
    expect(r.vatAmount).toBe(63);
  });
});
