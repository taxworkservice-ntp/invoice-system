import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Next-step "this or that" cards on the deal page.
 *
 * Two alternative next steps must read as a choice — equal cards with a `หรือ`
 * between them — instead of a primary button plus a footnote. A single next step
 * stays a plain action button.
 *
 * The sides follow the path, not which action happens to be the next step: the
 * operational path (delivery / payment) reads first, the paperwork path (invoice /
 * billing note) second — so the pair never moves when the deal's state changes.
 */
async function seedDeal(
  client: Awaited<ReturnType<typeof api>>,
  userId: string,
  docType: "quotation" | "invoice",
  status: "sent",
) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const customerId = uid();
  const dealId = uid();
  const documentId = uid();
  await client.from("customers").insert({
    id: customerId,
    user_id: userId,
    name: `E2E Choice ${suffix}`,
    is_active: true,
  });
  await client.from("deals").insert({
    id: dealId,
    user_id: userId,
    customer_id: customerId,
    title: `E2E Choice deal ${suffix}`,
    is_active: true,
  });
  await client.from("documents").insert({
    id: documentId,
    user_id: userId,
    deal_id: dealId,
    customer_id: customerId,
    doc_type: docType,
    doc_number: `${docType === "quotation" ? "QT" : "INV"}-E2E-${suffix}`,
    status,
    issue_date: new Date().toISOString().slice(0, 10),
    subtotal: 100,
    total_amount: 100,
    net_payable: 100,
  });
  return { customerId, dealId, documentId };
}

test.describe("deal page — next step choice", () => {
  test("quotation offers converting or delivering first", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const seed = await seedDeal(client, session.user.id, "quotation", "sent");

    try {
      await page.goto(`/deals/${seed.dealId}`);

      const group = page.getByRole("group", { name: /เลือกอย่างใดอย่างหนึ่ง/ });
      await expect(group).toBeVisible();

      const convert = group.getByRole("button", { name: /ออกใบแจ้งหนี้ต่อ/ });
      const deliver = group.getByRole("button", { name: /ส่งของก่อน/ });
      await expect(convert).toBeVisible();
      await expect(deliver).toBeVisible();

      // The operational path (delivery) reads first (left), the paperwork
      // path (invoice) second — the sides follow the path, so the pair does
      // not move when the deal's state changes.
      const [a, b] = await Promise.all([
        convert.boundingBox(),
        deliver.boundingBox(),
      ]);
      expect(Math.abs((a?.y ?? 0) - (b?.y ?? 0))).toBeLessThanOrEqual(2);
      expect(Math.abs((a?.width ?? 0) - (b?.width ?? 0))).toBeLessThanOrEqual(2);
      expect(b?.x ?? 0).toBeLessThan(a?.x ?? 0);
      // The word between them.
      await expect(group.getByText("หรือ")).toBeVisible();

      // The delivery card still routes to the delivery-note form.
      await deliver.click();
      await page.waitForURL(/\/documents\/new\?type=delivery_note_from_quotation/);
    } finally {
      await client.from("documents").delete().eq("deal_id", seed.dealId);
      await client.from("deals").delete().eq("id", seed.dealId);
      await client.from("customers").delete().eq("id", seed.customerId);
    }
  });

  test("sent invoice offers billing or collecting", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const seed = await seedDeal(client, session.user.id, "invoice", "sent");

    try {
      await page.goto(`/deals/${seed.dealId}`);

      const group = page.getByRole("group", { name: /เลือกอย่างใดอย่างหนึ่ง/ });
      await expect(group).toBeVisible();
      const billing = group.getByRole("button", { name: /^ออกใบวางบิล/ });
      await expect(billing).toBeVisible();
      const collect = group.getByRole("button", { name: /รับเงินโดยไม่ออกใบวางบิล/ });
      await expect(collect).toBeVisible();
      await expect(group.getByText("หรือ")).toBeVisible();
      // The operational path (payment) on the left, the paperwork path
      // (billing note) on the right.
      const [b1, b2] = await Promise.all([billing.boundingBox(), collect.boundingBox()]);
      expect(b2?.x ?? 0).toBeLessThan(b1?.x ?? 0);

      // Collecting opens the payment flow.
      await collect.click();
      await expect(page.locator("div.fixed.inset-0")).toBeVisible();
    } finally {
      await client.from("documents").delete().eq("deal_id", seed.dealId);
      await client.from("deals").delete().eq("id", seed.dealId);
      await client.from("customers").delete().eq("id", seed.customerId);
    }
  });

  test("mobile stacks the two cards under the divider", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const seed = await seedDeal(client, session.user.id, "quotation", "sent");

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/deals/${seed.dealId}`);

      const group = page.getByRole("group", { name: /เลือกอย่างใดอย่างหนึ่ง/ });
      const convert = group.getByRole("button", { name: /ออกใบแจ้งหนี้ต่อ/ });
      const deliver = group.getByRole("button", { name: /ส่งของก่อน/ });
      const [a, b] = await Promise.all([convert.boundingBox(), deliver.boundingBox()]);
      expect(a?.y ?? 0).toBeGreaterThan((b?.y ?? 0) + (b?.height ?? 0) - 1);
      await expect(group.getByText("หรือ")).toBeVisible();
    } finally {
      await client.from("documents").delete().eq("deal_id", seed.dealId);
      await client.from("deals").delete().eq("id", seed.dealId);
      await client.from("customers").delete().eq("id", seed.customerId);
    }
  });
});
