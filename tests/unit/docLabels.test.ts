import { describe, expect, it } from "vitest";
import { defaultInvoicePrintTitleVariant, printTitle } from "../../src/lib/docLabels";

describe("defaultInvoicePrintTitleVariant", () => {
  it("returns a valid workspace preset", () => {
    expect(
      defaultInvoicePrintTitleVariant({
        print_titles_by_type: { invoice: { preset: "tax_invoice_invoice" } },
      }),
    ).toBe("tax_invoice_invoice");
  });

  it("falls back to the system title for empty or invalid values", () => {
    expect(defaultInvoicePrintTitleVariant(null)).toBe("");
    expect(defaultInvoicePrintTitleVariant({ print_titles_by_type: {} })).toBe("");
    expect(
      defaultInvoicePrintTitleVariant({
        print_titles_by_type: { invoice: { preset: "not-a-preset" } },
      }),
    ).toBe("");
  });
});

describe("printTitle", () => {
  it("uses the document snapshot for a VAT invoice", () => {
    expect(
      printTitle({
        doc_type: "invoice",
        vat_registered: true,
        print_title_variant: "tax_invoice_delivery",
      }),
    ).toEqual({ thai: "ใบกำกับภาษี/ใบส่งของ", en: "Tax Invoice / Delivery Note" });
  });

  it("ignores the preset for a non-VAT invoice", () => {
    expect(
      printTitle({
        doc_type: "invoice",
        vat_registered: false,
        print_title_variant: "tax_invoice_invoice",
      }),
    ).toMatchObject({ thai: "ใบแจ้งหนี้", en: "Invoice" });
  });

  it("ignores the preset for non-invoice document types", () => {
    expect(
      printTitle({
        doc_type: "delivery_note",
        vat_registered: true,
        print_title_variant: "tax_invoice_invoice",
      }),
    ).toEqual({ thai: "ใบส่งของ", en: "Delivery Note" });
  });
});
