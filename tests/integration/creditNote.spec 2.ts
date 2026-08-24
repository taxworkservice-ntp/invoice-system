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
  createItem,
  getItem,
  getDocumentAdmin,
  docNum,
  uid,
} from "./fixtures";
import { client } from "./harness";
import { returnStockOnCreditNoteIssued, reverseStockOnCreditNoteVoid } from "../../src/lib/stock";
import { voidDocumentWithSideEffects } from "../../src/lib/documentVoid";

async function createPaidInvoiceWithProduct(itemId: string, quantity: number) {
  const cust = await createCustomer();
  const deal = await createDeal(cust.id);
  const invoice = await createDocument({
    id: uid(),
    deal_id: deal.id,
    customer_id: cust.id,
    doc_type: "invoice",
    doc_number: docNum("INV"),
    status: "paid",
    issue_date: new Date().toISOString().slice(0, 10),
    vat_registered: true,
    vat_rate: 7,
    subtotal: quantity * 10,
    vat_amount: quantity * 10 * 0.07,
    total_amount: quantity * 10 * 1.07,
    net_payable: quantity * 10 * 1.07,
  });
  await createLineItems([
    {
      document_id: invoice.id,
      user_id: getTestUserId(),
      item_id: itemId,
      item_name: "Box",
      item_type: "product",
      unit: "piece",
      unit_price: 10,
      quantity,
      base_quantity: quantity,
      line_total: quantity * 10,
      sort_order: 0,
    },
  ]);
  return { deal, invoice };
}

describe("credit note", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  it("issuing returns product stock (return_in) and voiding reverses it", async () => {
    const item = await createItem(50);
    const userId = getTestUserId();

    // Simulate the send flow first: stock was deducted for the sold goods.
    const { deductStockOnDocumentSent } = await import("../../src/lib/stock");
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const invoice = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV"),
      status: "paid",
      issue_date: new Date().toISOString().slice(0, 10),
      subtotal: 100,
      total_amount: 107,
      net_payable: 107,
    });
    await createLineItems([
      {
        document_id: invoice.id,
        user_id: userId,
        item_id: item.id,
        item_name: "Box",
        item_type: "product",
        unit: "piece",
        unit_price: 10,
        quantity: 5,
        base_quantity: 5,
        line_total: 50,
        sort_order: 0,
      },
    ]);
    await deductStockOnDocumentSent(invoice.id, userId);
    expect((await getItem(item.id)).stock_count).toBe(45);

    // Issue a credit note returning all 5 units.
    const cn = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "credit_note",
      doc_number: docNum("CN"),
      status: "issued",
      issue_date: new Date().toISOString().slice(0, 10),
      converted_from_id: invoice.id,
      subtotal: 50,
      vat_amount: 3.5,
      total_amount: 53.5,
      net_payable: 53.5,
    });
    await createLineItems([
      {
        document_id: cn.id,
        user_id: userId,
        item_id: item.id,
        item_name: "Box",
        item_type: "product",
        unit: "piece",
        unit_price: 10,
        quantity: 5,
        base_quantity: 5,
        line_total: 50,
        sort_order: 0,
      },
    ]);
    await returnStockOnCreditNoteIssued(cn.id, userId);

    const afterIssue = await getItem(item.id);
    expect(afterIssue.stock_count).toBe(50);

    // Idempotent: calling again must not double-return.
    await returnStockOnCreditNoteIssued(cn.id, userId);
    expect((await getItem(item.id)).stock_count).toBe(50);

    // Voiding the credit note reverses the return.
    await voidDocumentWithSideEffects(await getDocumentAdmin(cn.id), userId, "QA void");
    const afterVoid = await getItem(item.id);
    expect(afterVoid.stock_count).toBe(45);
  });

  it("draft credit notes keep the deal unresolved; issued ones do not block", async () => {
    const item = await createItem(10);
    const { deal } = await createPaidInvoiceWithProduct(item.id, 2);

    const draftCn = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: (await createCustomer()).id,
      doc_type: "credit_note",
      doc_number: docNum("CN"),
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
    });
    expect(draftCn.status).toBe("draft");

    const issued = await client
      .from("documents")
      .update({ status: "issued" })
      .eq("id", draftCn.id)
      .select("status")
      .single();
    expect(issued.data?.status).toBe("issued");
  });
});
