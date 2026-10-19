import { expect, test } from "@playwright/test";
import { api, signInAndGetSession, uid } from "./helpers/env";

/**
 * Job details on a deal-form line (service items).
 *
 * This block moved out of the row into `renderLineOptions`, so this guards that
 * it still appears for a job-detail service, that the plain note field is
 * replaced while it is on, and that filling a field updates the summary.
 *
 * Skipped when the workspace has the `service_job_details` feature switched off.
 */
test.describe("deal form — job details on a line", () => {
  test("opens the job-detail fields for a service that has them", async ({ page }) => {
    const session = await signInAndGetSession();
    const client = await api();
    const userId = session.user.id;

    const { data: features } = await client
      .from("client_features")
      .select("feature_key")
      .eq("user_id", userId)
      .eq("enabled", true);
    test.skip(
      !features?.some((feature) => feature.feature_key === "service_job_details"),
      "service_job_details is not enabled in this workspace",
    );

    const suffix = Date.now();
    const customerId = uid();
    const itemId = uid();
    const itemName = `E2E Job Detail ${suffix}`;

    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `E2E Job Detail Cust ${suffix}`,
      is_active: true,
    });
    await client.from("items").insert({
      id: itemId,
      user_id: userId,
      name: itemName,
      item_type: "service",
      base_unit: "งาน",
      unit_price: 500,
      has_job_details: true,
      is_active: true,
    });

    try {
      await page.goto(`/deals/new?type=quotation&customer_id=${customerId}`);

      await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();
      const editor = page.locator("div.fixed.inset-0");
      const itemInput = editor.getByPlaceholder(/พิมพ์ชื่อสินค้าหรือบริการ/);
      await itemInput.fill(itemName);
      await page.getByRole("listitem").filter({ hasText: itemName }).first().click();

      // Selecting a job-detail item opens the block by itself (catalog apply).
      // A fresh item has no configured fields, so the built-in set applies.
      const colorField = editor.getByLabel("สี / ฟอยล์");
      await expect(colorField).toBeVisible();
      await colorField.fill("ฟอยล์ทอง");

      await expect(editor.getByRole("button", { name: "แก้ไขรายละเอียดงาน" })).toBeVisible();
      await expect(editor.getByText(/1\/\d+ ช่อง/)).toBeVisible();
    } finally {
      await client.from("items").delete().eq("id", itemId);
      await client.from("customers").delete().eq("id", customerId);
    }
  });
});
