import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  ensureTestUser,
  signInTestUser,
  resetWorkspace,
  getTestUserId,
  client,
} from "./harness";
import { getDocumentAdmin, docNum, uid } from "./fixtures";

describe("quotation lifecycle + guards (I1, I2)", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  it("creates a quotation, converts to invoice, and blocks a 2nd active invoice (I1)", async () => {
    const created = await client.rpc("create_deal_document", {
      p_user_id: getTestUserId(),
      p_customer_id: (await client.from("customers").insert({ id: uid(), user_id: getTestUserId(), name: "C1", is_active: true }).select("id").single()).data!.id,
      p_document: { doc_type: "quotation", status: "draft", doc_number: docNum("QT") },
      p_title: "QA Quotation Deal",
    });
    expect(created.error).toBeNull();
    const qid = created.data![0].document_id;
    expect(qid).toBeTruthy();

    // quotation must be 'sent' before conversion
    await client.from("documents").update({ status: "sent" }).eq("id", qid);

    const invId = await client.rpc("convert_quotation_to_invoice", {
      p_user_id: getTestUserId(),
      p_quotation_id: qid,
    });
    expect(invId.error).toBeNull();
    expect(invId.data).toBeTruthy();
    expect((await getDocumentAdmin(qid)).status).toBe("converted");

    // second conversion must be blocked (one active invoice per quotation)
    const second = await client.rpc("convert_quotation_to_invoice", {
      p_user_id: getTestUserId(),
      p_quotation_id: qid,
    });
    expect(second.error).not.toBeNull();
  });

  it("allows only one DRAFT delivery note per quotation source (I2)", async () => {
    const cid = (await client.from("customers").insert({ id: uid(), user_id: getTestUserId(), name: "C2", is_active: true }).select("id").single()).data!.id;
    const q = await client.rpc("create_deal_document", {
      p_user_id: getTestUserId(),
      p_customer_id: cid,
      p_document: { doc_type: "quotation", status: "draft", doc_number: docNum("QT") },
    });
    const qid = q.data![0].document_id;

    const dn1 = await client.from("documents").insert({
      id: uid(),
      user_id: getTestUserId(),
      customer_id: cid,
      doc_type: "delivery_note",
      doc_number: docNum("DN"), // placeholder; will be overwritten by real number later
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
      converted_from_id: qid,
    });
    expect(dn1.error).toBeNull();

    const dn2 = await client.from("documents").insert({
      id: uid(),
      user_id: getTestUserId(),
      customer_id: cid,
      doc_type: "delivery_note",
      doc_number: docNum("DN"),
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
      converted_from_id: qid,
    });
    expect(dn2.error).not.toBeNull();
  });
});
