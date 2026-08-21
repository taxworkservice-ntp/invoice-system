import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  ensureTestUser,
  signInTestUser,
  resetWorkspace,
  getTestUserId,
  client,
} from "./harness";
import {
  createCustomer,
  createDeal,
  createDocument,
  getDocumentAdmin,
  getLineItems,
  docNum,
  uid,
} from "./fixtures";
import { voidDocumentWithSideEffects } from "../../src/lib/documentVoid";

async function makeInvoice(cust: any, deal: any, num: string) {
  return createDocument({
    id: uid(),
    deal_id: deal.id,
    customer_id: cust.id,
    doc_type: "invoice",
    doc_number: num,
    status: "sent",
    issue_date: new Date().toISOString().slice(0, 10),
    vat_registered: true,
    vat_rate: 7,
  });
}

async function linkInvoiceToBn(bnId: string, invId: string, num: string) {
  const { error } = await client.from("billing_note_invoices").insert({
    id: uid(),
    billing_note_id: bnId,
    invoice_id: invId,
    user_id: getTestUserId(),
    invoice_number: num,
    issue_date: new Date().toISOString().slice(0, 10),
    subtotal: 100,
    vat_amount: 7,
    total_amount: 107,
  });
  return error;
}

describe("billing note: duplicate prevention (I4) + void release", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  it("blocks a second active billing note for the same invoice, allows after void (I4)", async () => {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const inv = await makeInvoice(cust, deal, docNum("INV-BN"));

    const bn1 = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "billing_note",
      doc_number: docNum("BN-1"),
      status: "sent", // a paid/open BN leaves released_at NULL
      issue_date: new Date().toISOString().slice(0, 10),
    });

    const e1 = await linkInvoiceToBn(bn1.id, inv.id, inv.doc_number!);
    expect(e1).toBeNull(); // first link OK

    // Second ACTIVE billing note for the same invoice must be rejected.
    const bn2 = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "billing_note",
      doc_number: docNum("BN-2"),
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
    });
    const e2 = await linkInvoiceToBn(bn2.id, inv.id, inv.doc_number!);
    expect(e2).not.toBeNull(); // trigger blocks it

    // Void bn1 -> releases the invoice link (released_at set).
    await voidDocumentWithSideEffects(
      { id: bn1.id, doc_type: "billing_note" },
      getTestUserId(),
      "test void",
    );
    const links = await client
      .from("billing_note_invoices")
      .select("*")
      .eq("billing_note_id", bn1.id);
    expect(links.data?.[0]?.released_at).not.toBeNull();
    expect((await getDocumentAdmin(inv.id)).status).toBe("sent");

    // Now a second billing note is allowed (first link is released).
    const e3 = await linkInvoiceToBn(bn2.id, inv.id, inv.doc_number!);
    expect(e3).toBeNull();
  });
});
