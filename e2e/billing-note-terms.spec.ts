import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

test("billing note date card pre-fills customer credit and links the due date", async ({
  page,
}) => {
  const session = await signInAndGetSession();
  const client = await api();
  const userId = session.user.id;
  const suffix = `${Date.now()}`;
  const customerId = uid();
  const dealId = uid();
  const invoiceId = uid();
  const today = new Date().toISOString().slice(0, 10);

  const { error: customerError } = await client.from("customers").insert({
    id: customerId,
    user_id: userId,
    name: `E2E Terms ${suffix}`,
    is_active: true,
    credit_term_days: 15,
  });
  if (customerError) throw customerError;
  const { error: dealError } = await client.from("deals").insert({
    id: dealId,
    user_id: userId,
    customer_id: customerId,
    title: `E2E Terms deal ${suffix}`,
    is_active: true,
  });
  if (dealError) throw dealError;
  const { error: invoiceError } = await client.from("documents").insert({
    id: invoiceId,
    user_id: userId,
    deal_id: dealId,
    customer_id: customerId,
    doc_type: "invoice",
    doc_number: `INV-TERMS-${suffix}`,
    status: "sent",
    issue_date: today,
    subtotal: 100,
    total_amount: 107,
    net_payable: 107,
  });
  if (invoiceError) throw invoiceError;

  try {
    await page.goto(`/documents/new?type=billing_note&dealId=${dealId}`);

    await expect(page.getByText("วันที่และเครดิต")).toBeVisible();

    const creditDays = page.getByLabel("เครดิต (วัน)");
    await expect(creditDays).toHaveValue("15");

    await page.getByRole("button", { name: "30 วัน", exact: true }).click();
    await expect(creditDays).toHaveValue("30");
    await expect(page.getByText("พร้อม")).toBeVisible();
  } finally {
    await client.from("documents").delete().eq("id", invoiceId);
    await client.from("deals").delete().eq("id", dealId);
    await client.from("customers").delete().eq("id", customerId);
  }
});
