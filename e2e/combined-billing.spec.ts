import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

const today = new Date().toISOString().slice(0, 10);

test.describe("deal page — combined billing branch", () => {
  test("billed-in deal links to the billing deal instead of offering payment", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;
    const suffix = `${Date.now()}`;
    const customerId = uid();
    const sourceDealId = uid();
    const billingDealId = uid();
    const invoiceId = uid();
    const billingNoteId = uid();

    const { error: customerError } = await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E Combined ${suffix}`,
      is_active: true,
    });
    if (customerError) throw customerError;
    const { error: dealsError } = await client.from("deals").insert([
      {
        id: sourceDealId,
        user_id: userId,
        customer_id: customerId,
        title: `E2E source ${suffix}`,
        is_active: true,
      },
      {
        id: billingDealId,
        user_id: userId,
        customer_id: customerId,
        title: `E2E billing ${suffix}`,
        is_active: true,
      },
    ]);
    if (dealsError) throw dealsError;
    const { error: docsError } = await client.from("documents").insert([
      {
        id: invoiceId,
        user_id: userId,
        deal_id: sourceDealId,
        customer_id: customerId,
        doc_type: "invoice",
        doc_number: `INV-E2E-${suffix}`,
        status: "sent",
        issue_date: today,
        subtotal: 100,
        total_amount: 107,
        net_payable: 107,
      },
      {
        id: billingNoteId,
        user_id: userId,
        deal_id: billingDealId,
        customer_id: customerId,
        doc_type: "billing_note",
        doc_number: `BN-E2E-${suffix}`,
        status: "sent",
        issue_date: today,
        subtotal: 100,
        total_amount: 107,
        net_payable: 107,
      },
    ]);
    if (docsError) throw docsError;
    const { error: linkError } = await client.from("billing_note_invoices").insert({
      id: uid(),
      billing_note_id: billingNoteId,
      invoice_id: invoiceId,
      user_id: userId,
      invoice_number: `INV-E2E-${suffix}`,
      issue_date: today,
      subtotal: 100,
      vat_amount: 7,
      total_amount: 107,
    });
    if (linkError) throw linkError;

    try {
      await page.goto(`/deals/${sourceDealId}`);

      await expect(page.getByText(/รวมบิลในงานขาย/)).toBeVisible();
      const branch = page.getByRole("button", { name: /ไปงานที่รวมบิล/ });
      await expect(branch).toBeVisible();
      await expect(page.getByRole("button", { name: /^ออกใบวางบิล/ })).toHaveCount(0);

      await branch.click();
      await page.waitForURL(`/deals/${billingDealId}`);
    } finally {
      await client.from("billing_note_invoices").delete().eq("billing_note_id", billingNoteId);
      await client.from("documents").delete().in("id", [invoiceId, billingNoteId]);
      await client.from("deals").delete().in("id", [sourceDealId, billingDealId]);
      await client.from("customers").delete().eq("id", customerId);
    }
  });
});
