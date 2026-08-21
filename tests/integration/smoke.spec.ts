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
  getDocumentAdmin,
  getLineItems,
  docNum,
  uid,
} from "./fixtures";

describe("smoke", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  it("creates + reads a quotation via the authed anon client (RLS passes)", async () => {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const doc = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "quotation",
      doc_number: docNum("QT-SMOKE"),
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
    });
    await createLineItems([
      {
        document_id: doc.id,
        user_id: getTestUserId(),
        item_name: "Box",
        unit: "piece",
        unit_price: 10,
        quantity: 2,
        line_total: 20,
        sort_order: 0,
      },
    ]);
    const read = await getDocumentAdmin(doc.id);
    const lines = await getLineItems(doc.id);
    expect(read.id).toBe(doc.id);
    expect(lines.length).toBe(1);
  });
});
