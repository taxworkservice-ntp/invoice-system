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
  docNum,
  uid,
} from "./fixtures";
import { sendDocumentWithSideEffects } from "../../src/lib/documentSend";
import { deductStockOnDocumentSent, restoreStockOnVoid } from "../../src/lib/stock";

describe("stock: send/void side-effects", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  it("sending an invoice deducts stock and voiding restores it (I6)", async () => {
    const item = await createItem(100);
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const inv = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV-STOCK"),
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
      vat_registered: true,
      vat_rate: 7,
    });
    await createLineItems([
      {
        document_id: inv.id,
        user_id: getTestUserId(),
        item_id: item.id,
        item_name: item.name,
        item_type: "product",
        unit: "piece",
        unit_price: 10,
        quantity: 5,
        line_total: 50,
        sort_order: 0,
      },
    ]);

    const r = await sendDocumentWithSideEffects({ id: inv.id, doc_type: "invoice" }, getTestUserId());
    expect(r.status).toBe("sent");
    expect((await getItem(item.id)).stock_count).toBe(95);

    // deduct is idempotent: a second call finds the existing auto_out movement
    // and must NOT double-deduct.
    await deductStockOnDocumentSent(inv.id, getTestUserId());
    expect((await getItem(item.id)).stock_count).toBe(95);

    await restoreStockOnVoid(inv.id, getTestUserId());
    expect((await getItem(item.id)).stock_count).toBe(100);
  });
});
