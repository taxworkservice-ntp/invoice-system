import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  ensureTestUser,
  signInTestUser,
  resetWorkspace,
  getTestUserId,
} from "./harness";
import {
  createCustomer,
  createDeal,
  createDocument,
  createLineItems,
  createDeliveryNoteLink,
  getDocumentAdmin,
  getLineItems,
  docNum,
  uid,
} from "./fixtures";

describe("invoice from DN: variance snapshot + partial billing", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  async function setupDn(cust: any, deal: any) {
    const dn = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "delivery_note",
      doc_number: docNum("DN"),
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
    });
    await createLineItems([
      {
        document_id: dn.id,
        user_id: getTestUserId(),
        item_name: "Box",
        unit: "piece",
        unit_price: 100,
        quantity: 10, // delivered
        line_total: 1000,
        sort_order: 0,
      },
    ]);
    const lines = await getLineItems(dn.id);
    return { dn, dnLine: lines[0] };
  }

  it("stores the variance snapshot and defaults show_dn_variance to false", async () => {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const { dn, dnLine } = await setupDn(cust, deal);

    const inv = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV"),
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
      show_dn_variance: false,
    });
    await createLineItems([
      {
        document_id: inv.id,
        user_id: getTestUserId(),
        item_name: "Box",
        unit: "piece",
        unit_price: 90, // price changed
        quantity: 8, // qty reduced
        line_total: 720,
        sort_order: 0,
        source_document_id: dn.id,
        source_line_item_id: dnLine.id,
        source_delivered_qty: 10,
        source_unit_price: 100,
      },
    ]);
    await createDeliveryNoteLink({
      id: uid(),
      invoice_id: inv.id,
      delivery_note_id: dn.id,
      user_id: getTestUserId(),
      delivery_note_number: dn.doc_number!,
      issue_date: dn.issue_date,
      subtotal: 720,
      vat_amount: 50.4,
      total_amount: 770.4,
    });

    const invLine = (await getLineItems(inv.id))[0];
    expect(Number(invLine.source_delivered_qty)).toBe(10);
    expect(Number(invLine.source_unit_price)).toBe(100);
    expect((await getDocumentAdmin(inv.id)).show_dn_variance).toBe(false);
    // partial billing -> DN stays 'sent'
    expect((await getDocumentAdmin(dn.id)).status).toBe("sent");
  });

  it("persists show_dn_variance = true when the user opts in", async () => {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const { dn, dnLine } = await setupDn(cust, deal);

    const inv = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV"),
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
      show_dn_variance: true,
    });
    await createLineItems([
      {
        document_id: inv.id,
        user_id: getTestUserId(),
        item_name: "Box",
        unit: "piece",
        unit_price: 100,
        quantity: 10,
        line_total: 1000,
        sort_order: 0,
        source_document_id: dn.id,
        source_line_item_id: dnLine.id,
        source_delivered_qty: 10,
        source_unit_price: 100,
      },
    ]);

    expect((await getDocumentAdmin(inv.id)).show_dn_variance).toBe(true);
  });
});
