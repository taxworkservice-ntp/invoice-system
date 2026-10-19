import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Per-client discount switch (Settings › Documents).
 *
 * Off hides the discount inputs; it is display-only, so stored discounts and
 * printed documents are untouched. The setting lives on `client_profiles`, which
 * the workspace owner may update — so this spec can flip it and restore it.
 */
/** The column arrives with a manual migration — skip until it exists. */
async function discountColumnReady(client: Awaited<ReturnType<typeof api>>, userId: string) {
  const { error } = await client
    .from("client_profiles")
    .select("discounts_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return !error;
}

test.describe("discount switch", () => {
  test("hides discount inputs when the workspace switches them off", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    test.skip(
      !(await discountColumnReady(client, userId)),
      "apply sql/20261018_add_discounts_enabled.sql first",
    );

    const { data: before } = await client
      .from("client_profiles")
      .select("discounts_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    const suffix = Date.now();
    const customerId = uid();
    const itemId = uid();
    const itemName = `E2E Discount ${suffix}`;

    await client
      .from("client_profiles")
      .update({ discounts_enabled: false })
      .eq("user_id", userId);

    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E Discount Cust ${suffix}`,
      is_active: true,
    });
    await client.from("items").insert({
      id: itemId,
      user_id: userId,
      name: itemName,
      item_type: "product",
      base_unit: "ชิ้น",
      unit_price: 100,
      stock_count: 5,
      is_active: true,
    });

    try {
      await page.goto(`/deals/new?type=quotation&customer_id=${customerId}`);
      await page.getByRole("button", { name: "วันนี้" }).click();
      await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();

      const editor = page.locator("div.fixed.inset-0");
      const itemInput = editor.getByPlaceholder(/พิมพ์ชื่อสินค้าหรือบริการ/);
      await itemInput.fill(itemName);
      await page.getByRole("listitem").filter({ hasText: itemName }).first().click();

      // Per-line discount is gone; the price field is still there.
      await expect(editor.getByLabel(/ราคา\/หน่วย/)).toBeVisible();
      await expect(editor.getByLabel("ส่วนลด %")).toHaveCount(0);

      await editor.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect(editor).toHaveCount(0);

      // End-of-bill discount row is gone too.
      await expect(page.getByText("ส่วนลดท้ายบิล (%)")).toHaveCount(0);
    } finally {
      await client
        .from("client_profiles")
        .update({ discounts_enabled: before?.discounts_enabled ?? true })
        .eq("user_id", userId);
      await client.from("items").delete().eq("id", itemId);
      await client.from("customers").delete().eq("id", customerId);
    }
  });

  test("shows discount inputs when discounts are enabled", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    test.skip(
      !(await discountColumnReady(client, userId)),
      "apply sql/20261018_add_discounts_enabled.sql first",
    );

    const { data: before } = await client
      .from("client_profiles")
      .select("discounts_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    await client
      .from("client_profiles")
      .update({ discounts_enabled: true })
      .eq("user_id", userId);

    try {
      await page.goto("/deals/new?type=quotation");
      await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();
      await expect(page.locator("div.fixed.inset-0").getByLabel("ส่วนลด %")).toBeVisible();
    } finally {
      await client
        .from("client_profiles")
        .update({ discounts_enabled: before?.discounts_enabled ?? true })
        .eq("user_id", userId);
    }
  });
});
