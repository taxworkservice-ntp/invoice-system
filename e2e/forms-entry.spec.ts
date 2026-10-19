import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Entry-point regression cover for src/lib/docCreation.ts.
 *
 * These exist because the same "which screen creates this?" decision used to be
 * re-implemented per page. Two real bugs came from that:
 *  - the customer page opened `/deals/new?type=invoice_from_delivery_notes`,
 *    which is not a DB enum value, so the form could never save;
 *  - the same page opened a second, divergent billing-note implementation.
 *
 * What is asserted here is *which screen appears* — never that a document saves.
 */

/** Signed-in anon client (RLS identity), so this spec needs no service key. */
async function createCustomer(): Promise<{ id: string; name: string }> {
  const session = await signInAndGetSession();
  const client = await api();
  const id = uid();
  const name = `E2E Entry ${Date.now()}`;
  const { error } = await client
    .from("customers")
    .insert({ id, user_id: session.user.id, name, is_active: true });
  if (error) throw error;
  return { id, name };
}

async function deleteCustomer(id: string) {
  const client = await api();
  await client.from("customers").delete().eq("id", id);
}

test.describe("document creation entry points", () => {
  test("the deal form hands billing notes to the billing-note form", async ({ page }) => {
    await page.goto("/deals/new?type=billing_note");

    await page.waitForURL(/\/documents\/new\?type=billing_note/);
    await expect(page.getByText("ลูกค้าและวันที่")).toBeVisible();
  });

  test("the deal form rejects UI modes that belong to another screen", async ({ page }) => {
    await page.goto("/deals/new?type=invoice_from_delivery_notes");
    await page.waitForURL(/\/documents\/new\?type=invoice_from_delivery_notes/);

    await page.goto("/deals/new?type=not_a_document_type");
    await page.waitForURL(/\/home$/);
  });

  test("the home sheet routes each option to its own screen", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("button", { name: "สร้างงานขายใหม่" }).click();
    await expect(page.getByText("เริ่มงานแบบไหน?")).toBeVisible();

    // A deal-form mode still lands on /deals/new (regression guard for home).
    await page.getByRole("button").filter({ hasText: "ออกใบเสนอราคา" }).first().click();
    await page.waitForURL(/\/deals\/new\?type=quotation/);
  });

  test("the customer page opens the correct screen for both roll-up actions", async ({
    page,
  }) => {
    const customer = await createCustomer();

    try {
      // "รวมใบแจ้งหนี้ → ใบวางบิล" must reach BillingNoteForm, not /deals/new.
      await page.goto(`/customers/${customer.id}`);
      await page.getByRole("button", { name: "+ สร้างงานขาย" }).click();
      await expect(page.getByText("เริ่มงานแบบไหน?")).toBeVisible();
      await page.getByRole("button", { name: "ตัวเลือกเพิ่มเติม" }).click();
      await page
        .getByRole("button")
        .filter({ hasText: "รวมใบแจ้งหนี้ → ใบวางบิล" })
        .first()
        .click();

      await page.waitForURL(/\/documents\/new\?/);
      const billingUrl = new URL(page.url());
      expect(billingUrl.pathname).toBe("/documents/new");
      expect(billingUrl.searchParams.get("type")).toBe("billing_note");
      expect(billingUrl.searchParams.get("customer_id")).toBe(customer.id);
      // The form must actually honour it — not just carry the param.
      await expect(page.getByText("ลูกค้าและวันที่")).toBeVisible();
      await expect(page.getByText(customer.name).first()).toBeVisible();

      // "รวมใบส่งของ → ออกบิล" must reach the DN→invoice form.
      await page.goto(`/customers/${customer.id}`);
      await page.getByRole("button", { name: "+ สร้างงานขาย" }).click();
      await expect(page.getByText("เริ่มงานแบบไหน?")).toBeVisible();
      await page.getByRole("button", { name: "ตัวเลือกเพิ่มเติม" }).click();
      await page
        .getByRole("button")
        .filter({ hasText: "รวมใบส่งของ → ออกบิล" })
        .first()
        .click();

      await page.waitForURL(/\/documents\/new\?/);
      const dnInvoiceUrl = new URL(page.url());
      expect(dnInvoiceUrl.pathname).toBe("/documents/new");
      expect(dnInvoiceUrl.searchParams.get("type")).toBe("invoice_from_delivery_notes");
    } finally {
      await deleteCustomer(customer.id);
    }
  });
});
