import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  ensureTestUser,
  signInTestUser,
  resetWorkspace,
  getTestUserId,
  client,
} from "./harness";
import { createCustomer, uid } from "./fixtures";

// Regression for the generate_doc_number int32-overflow bug: a document whose
// trailing numeric segment exceeds 2,147,483,647 used to crash number
// generation with `22003 value out of range for type integer`. The fix ignores
// runaway suffixes so sequencing proceeds from the sequence.
describe("generate_doc_number: int32 overflow guard", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  async function seedInvoice(docNumber: string) {
    const cust = await createCustomer();
    await client.from("documents").insert({
      id: uid(),
      user_id: getTestUserId(),
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNumber,
      status: "draft",
      issue_date: "2026-08-21",
    });
  }

  it("ignores a runaway numeric suffix and still yields a valid number", async () => {
    await seedInvoice("INV-1757307000000"); // trailing 13 digits > int32 max
    const r = await client.rpc("generate_doc_number", {
      p_user_id: getTestUserId(),
      p_doc_type: "invoice",
      p_issue_date: "2026-08-21",
    });
    expect(r.error).toBeNull();
    expect(r.data).toBe("INV-2026-08-001");
  });

  it("still honors a legitimate sequence", async () => {
    await seedInvoice("INV-2026-08-005");
    const r = await client.rpc("generate_doc_number", {
      p_user_id: getTestUserId(),
      p_doc_type: "invoice",
      p_issue_date: "2026-08-21",
    });
    expect(r.error).toBeNull();
    expect(r.data).toBe("INV-2026-08-006");
  });
});
