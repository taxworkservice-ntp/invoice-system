import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRINT_TITLE_PRESETS,
  printTitle,
  readLastPrintTitleVariant,
  writeLastPrintTitleVariant,
} from "../../src/lib/docLabels";

const taxInvoice = { doc_type: "invoice" as const, vat_registered: true };
const plainInvoice = { doc_type: "invoice" as const, vat_registered: false };

describe("printTitle (tax-invoice printed header)", () => {
  it("defaults to ใบกำกับภาษี / Tax Invoice", () => {
    expect(printTitle({ ...taxInvoice, print_title_variant: null })).toMatchObject({
      thai: "ใบกำกับภาษี",
      en: "Tax Invoice",
    });
  });

  it("uses the combined preset on a tax invoice", () => {
    expect(
      printTitle({ ...taxInvoice, print_title_variant: "tax_invoice_delivery_invoice" }),
    ).toMatchObject({
      thai: "ใบกำกับภาษี/ใบส่งของ/ใบแจ้งหนี้",
      en: "Tax Invoice / Delivery Note / Invoice",
    });
    expect(PRINT_TITLE_PRESETS.tax_invoice_delivery_invoice.thai).toBe(
      "ใบกำกับภาษี/ใบส่งของ/ใบแจ้งหนี้",
    );
  });

  it("ignores the preset on non-tax-invoice documents (data stays the type)", () => {
    expect(
      printTitle({ ...plainInvoice, print_title_variant: "tax_invoice_delivery" }),
    ).toMatchObject({ thai: "ใบแจ้งหนี้", en: "Invoice" });
    expect(
      printTitle({ doc_type: "delivery_note", vat_registered: false, print_title_variant: "tax_invoice_receipt" }),
    ).toMatchObject({ thai: "ใบส่งของ", en: "Delivery Note" });
  });

  it("falls back to the standard label for an unknown value", () => {
    expect(printTitle({ ...taxInvoice, print_title_variant: "bogus" })).toMatchObject({
      thai: "ใบกำกับภาษี",
      en: "Tax Invoice",
    });
  });
});

describe("last print-title selection memory", () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = String(value); },
        removeItem: (key: string) => { delete store[key]; },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("persists a valid selection and drops an invalid one", () => {
    expect(readLastPrintTitleVariant()).toBe("");
    writeLastPrintTitleVariant("tax_invoice_delivery_invoice");
    expect(readLastPrintTitleVariant()).toBe("tax_invoice_delivery_invoice");
    writeLastPrintTitleVariant("bogus");
    expect(readLastPrintTitleVariant()).toBe("");
  });
});
