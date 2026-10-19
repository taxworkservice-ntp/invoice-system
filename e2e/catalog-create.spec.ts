import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Catalog create — the สินค้า / บริการ fork.
 *
 * The type decides whether the record is stock-counted, so it is a required
 * choice with its consequence shown; nothing is preselected and the fields stay
 * hidden until one is picked. (Previously a remembered default meant officers
 * typed into the name field and saved services as products.)
 */
test.describe("catalog item create — type choice", () => {
  test("asks สินค้า or บริการ first, then shows the matching form", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const suffix = Date.now();
    const sku = `E2E-SVC-${suffix}`;
    const name = `E2E Service ${suffix}`;

    try {
      await page.goto("/catalog/new");

      const group = page.getByRole("group", { name: "ประเภท" });
      const product = group.getByRole("radio", { name: /สินค้า/ });
      const service = group.getByRole("radio", { name: /บริการ/ });

      // Nothing chosen, and the form is not available yet.
      await expect(product).not.toBeChecked();
      await expect(service).not.toBeChecked();
      await expect(group.getByText(/นับสต็อก/).first()).toBeVisible();
      await expect(page.getByPlaceholder("BOX-001")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "บันทึกสินค้า / บริการ" })).toBeDisabled();

      // Picking a type reveals the fields.
      await service.check();
      await expect(service).toBeChecked();
      await expect(page.getByText("เลือกแล้ว")).toBeVisible();
      await expect(page.getByPlaceholder("BOX-001")).toBeVisible();

      await page.getByPlaceholder("BOX-001").fill(sku);
      await page.getByPlaceholder(/เช่น กระดาษ A4/).fill(name);
      await page.locator('input[type="number"]').first().fill("1500");

      await page.getByRole("button", { name: "บันทึกสินค้า / บริการ" }).click();
      await page.waitForURL(/\/catalog\/[0-9a-f-]{36}/i);

      const { data } = await client
        .from("items")
        .select("id, item_type, unit_price")
        .eq("sku", sku)
        .single();
      expect(data?.item_type).toBe("service");
      expect(Number(data?.unit_price)).toBe(1500);
    } finally {
      await client.from("items").delete().eq("sku", sku);
    }
  });

  test("product path keeps the stock fields", async ({ page }) => {
    await page.goto("/catalog/new");
    const group = page.getByRole("group", { name: "ประเภท" });
    await group.getByRole("radio", { name: /สินค้า/ }).check();

    await expect(page.getByText("จำนวนสต็อกเริ่มต้น")).toBeVisible();
    // A service has no stock block.
    await group.getByRole("radio", { name: /บริการ/ }).check();
    await expect(page.getByText("จำนวนสต็อกเริ่มต้น")).toHaveCount(0);
  });

  test("quick create from a document line asks the type too", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    void session;
    const suffix = Date.now();
    const name = `E2E Quick ${suffix}`;

    try {
      await page.goto("/deals/new?type=quotation");
      await page.getByRole("button", { name: "วันนี้" }).click().catch(() => {});
      await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();

      const editor = page.locator("div.fixed.inset-0");
      await editor.getByRole("button", { name: "เปิดตัวเลือกรายการ" }).click();

      const picker = page
        .locator("div.fixed.inset-0")
        .filter({ has: page.getByRole("heading", { name: "เลือกรายการ" }) });
      await picker.getByRole("button", { name: /เพิ่มรายการใหม่/ }).click();

      // No type is chosen for you — the line context cannot imply one.
      const group = picker.getByRole("group", { name: "ประเภท" });
      await expect(group.getByRole("radio", { name: /สินค้า/ })).not.toBeChecked();
      await expect(picker.getByRole("button", { name: "บันทึกและเลือก" })).toBeDisabled();

      await group.getByRole("radio", { name: /บริการ/ }).check();
      await picker.getByLabel("ชื่อรายการ").fill(name);
      await picker.getByPlaceholder("0.00").fill("250");
      await picker.getByRole("button", { name: "บันทึกและเลือก" }).click();

      const { data } = await client
        .from("items")
        .select("item_type")
        .eq("name", name)
        .maybeSingle();
      // The insert runs inside the click handler; give it a beat to land.
      if (!data) {
        await expect
          .poll(async () => {
            const { data: row } = await client
              .from("items")
              .select("item_type")
              .eq("name", name)
              .maybeSingle();
            return row?.item_type ?? null;
          })
          .toBe("service");
      } else {
        expect(data.item_type).toBe("service");
      }
    } finally {
      await client.from("items").delete().eq("name", name);
    }
  });
});
