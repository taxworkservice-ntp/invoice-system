import { describe, expect, it } from "vitest";
import {
  CREATION_TYPES,
  creationPath,
  formForCreationType,
  isCreationType,
  isDealFormType,
  resolveCreation,
  type CreationExperience,
  type CreationType,
} from "../../src/lib/docCreation";

const owner: CreationExperience = {
  isSimpleMode: false,
  canShowAdvancedDealOptions: true,
};

const officer: CreationExperience = {
  isSimpleMode: true,
  canShowAdvancedDealOptions: false,
};

const officerWithFinancials: CreationExperience = {
  isSimpleMode: true,
  canShowAdvancedDealOptions: true,
};

/** Params a caller would pass when the type needs a source document. */
function paramsFor(type: CreationType, params = new URLSearchParams()) {
  if (type === "delivery_note_from_quotation") params.set("quotationId", "q-1");
  return params;
}

describe("resolveCreation — one destination per creation type", () => {
  it("resolves every known type to exactly one form", () => {
    for (const type of CREATION_TYPES) {
      const resolved = resolveCreation({
        type,
        params: paramsFor(type),
        experience: owner,
      });
      expect(resolved.status, type).toBe("ok");
      if (resolved.status !== "ok") continue;
      expect(resolved.form, type).toBe(formForCreationType(type));
      expect(resolved.type).toBe(type);
    }
  });

  it("never stores a UI-only mode as doc_type", () => {
    const resolved = resolveCreation({ type: "utility_bill", experience: owner });
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    expect(resolved.docType).toBe("invoice");
    expect(resolved.path).toBe("/deals/new?type=utility_bill");
  });

  it("sends billing notes to the billing-note form, never the deal form", () => {
    // Regression: the customer page used to open /deals/new?type=billing_note,
    // which rendered a second, divergent billing-note implementation.
    const resolved = resolveCreation({
      type: "billing_note",
      params: new URLSearchParams({ customer_id: "c-1" }),
      experience: owner,
    });
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    expect(resolved.form).toBe("billing_note");
    expect(resolved.path).toBe("/documents/new?type=billing_note&customer_id=c-1");
    expect(resolved.docType).toBe("billing_note");
  });

  it("sends invoice-from-delivery-notes to its own form, not the deal form", () => {
    // Regression: `invoice_from_delivery_notes` is not a DB enum value. Landing
    // on /deals/new produced a form that could never save.
    const resolved = resolveCreation({
      type: "invoice_from_delivery_notes",
      params: new URLSearchParams({ dnId: "dn-1" }),
      experience: owner,
    });
    expect(resolved.status).toBe("ok");
    if (resolved.status !== "ok") return;
    expect(resolved.form).toBe("invoice_from_delivery_notes");
    expect(resolved.path).toBe("/documents/new?type=invoice_from_delivery_notes&dnId=dn-1");    expect(resolved.docType).toBe("invoice");
  });

  it("keeps the deal form for quotation, invoice and delivery note", () => {
    for (const type of ["quotation", "invoice", "delivery_note"] as const) {
      const resolved = resolveCreation({
        type,
        params: new URLSearchParams({ customer_id: "c-9" }),
        experience: owner,
      });
      expect(resolved.status, type).toBe("ok");
      if (resolved.status !== "ok") continue;
      expect(resolved.form, type).toBe("deal");
      expect(resolved.path, type).toBe(`/deals/new?type=${type}&customer_id=c-9`);
    }
  });
});

describe("resolveCreation — entry params", () => {
  it("preserves only the params the destination reads", () => {
    const deal = resolveCreation({
      type: "invoice",
      params: new URLSearchParams({
        customer_id: "c-1",
        mode: "classic",
        quotationId: "q-should-not-carry",
      }),
      experience: owner,
    });
    expect(deal.status).toBe("ok");
    if (deal.status === "ok") {
      expect(deal.path).toBe("/deals/new?type=invoice&customer_id=c-1&mode=classic");
    }

    const billing = resolveCreation({
      type: "billing_note",
      params: new URLSearchParams({ customer_id: "c-1", dealId: "d-1", mode: "classic" }),
      experience: owner,
    });
    expect(billing.status).toBe("ok");
    if (billing.status === "ok") {
      expect(billing.path).toBe(
        "/documents/new?type=billing_note&dealId=d-1&customer_id=c-1",
      );
    }
  });

  it("requires a source quotation for a delivery note created from one", () => {
    const missing = resolveCreation({
      type: "delivery_note_from_quotation",
      experience: owner,
    });
    expect(missing.status).toBe("invalid");

    const resolved = resolveCreation({
      type: "delivery_note_from_quotation",
      params: new URLSearchParams({ quotationId: "q-7" }),
      experience: owner,
    });
    expect(resolved.status).toBe("ok");
    if (resolved.status === "ok") {
      expect(resolved.path).toBe(
        "/documents/new?type=delivery_note_from_quotation&quotationId=q-7",
      );
    }
  });
});

describe("resolveCreation — permission gate", () => {
  it("lets an officer create quotations and delivery notes", () => {
    for (const type of [
      "quotation",
      "delivery_note",
      "delivery_note_from_quotation",
    ] as const) {
      expect(
        resolveCreation({ type, params: paramsFor(type), experience: officer }).status,
        type,
      ).toBe("ok");
    }
  });

  it("refuses officer access to financial documents at the entrance", () => {
    for (const type of [
      "invoice",
      "utility_bill",
      "billing_note",
      "credit_note",
      "debit_note",
      "invoice_from_quotation",
      "invoice_from_delivery_notes",
    ] as const) {
      const resolved = resolveCreation({ type, params: paramsFor(type), experience: officer });
      expect(resolved.status, type).toBe("denied");
      if (resolved.status === "denied") {
        expect(resolved.reason).toContain("ผู้จัดการ");
      }
    }
  });

  it("honours an officer who was explicitly granted financial access", () => {
    const resolved = resolveCreation({
      type: "invoice",
      experience: officerWithFinancials,
    });
    expect(resolved.status).toBe("ok");
  });
});

describe("resolveCreation — invalid input", () => {
  it("rejects unknown and missing types instead of passing them to a form", () => {
    expect(resolveCreation({ type: "receipt", experience: owner }).status).toBe("invalid");
    expect(resolveCreation({ type: "tax_invoice_receipt", experience: owner }).status).toBe(
      "invalid",
    );
    expect(resolveCreation({ type: null, experience: owner }).status).toBe("invalid");
    expect(resolveCreation({ type: "", experience: owner }).status).toBe("invalid");
    expect(isCreationType("invoice_from_delivery_notes")).toBe(true);
    expect(isCreationType("receipt")).toBe(false);
  });

  it("exposes which types the deal form may host", () => {
    expect(isDealFormType("quotation")).toBe(true);
    expect(isDealFormType("invoice")).toBe(true);
    expect(isDealFormType("utility_bill")).toBe(true);
    expect(isDealFormType("delivery_note")).toBe(true);
    expect(isDealFormType("billing_note")).toBe(false);
    expect(isDealFormType("invoice_from_quotation")).toBe(false);
    expect(isDealFormType("nonsense")).toBe(false);
  });

  it("returns null for a path when the type is unknown", () => {
    expect(creationPath("nope")).toBeNull();
    expect(creationPath("invoice")).toBe("/deals/new?type=invoice");
  });
});

describe("creationPath — call-site shapes used across the app", () => {
  it("maps the deal-page and document-page actions to their screens", () => {
    // deals/[id].tsx
    expect(creationPath("credit_note", { dealId: "d-1" })).toBe(
      "/documents/new?type=credit_note&dealId=d-1",
    );
    expect(creationPath("debit_note", { dealId: "d-1" })).toBe(
      "/documents/new?type=debit_note&dealId=d-1",
    );
    expect(creationPath("billing_note", { dealId: "d-1" })).toBe(
      "/documents/new?type=billing_note&dealId=d-1",
    );
    expect(creationPath("invoice", { dealId: "d-1" })).toBe(
      "/deals/new?type=invoice&dealId=d-1",
    );
    expect(creationPath("invoice_from_quotation", { quotationId: "q-1" })).toBe(
      "/documents/new?type=invoice_from_quotation&quotationId=q-1",
    );
    expect(creationPath("invoice_from_delivery_notes", { dnId: "dn-1" })).toBe(
      "/documents/new?type=invoice_from_delivery_notes&dnId=dn-1",
    );
    expect(creationPath("delivery_note_from_quotation", { quotationId: "q-1" })).toBe(
      "/documents/new?type=delivery_note_from_quotation&quotationId=q-1",
    );
  });

  it("drops empty and undefined ids instead of emitting `key=`", () => {
    expect(creationPath("credit_note", { dealId: "" })).toBe(
      "/documents/new?type=credit_note",
    );
    expect(creationPath("credit_note", { dealId: undefined })).toBe(
      "/documents/new?type=credit_note",
    );
    expect(creationPath("credit_note", { dealId: null })).toBe(
      "/documents/new?type=credit_note",
    );
  });
});
