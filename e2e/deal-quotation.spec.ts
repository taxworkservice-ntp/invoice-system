import { expect } from "@playwright/test";
import { test } from "@playwright/test";
import { createCustomer, createDeal, createDocument, createLineItems, deleteDealCascade, today, uid } from "./helpers/data";

test.describe.serial("deal + quotation journey", () => {
  let customerId: string;
  let dealId: string;
  const name = `E2E Cust QT ${Date.now()}`;

  test("create deal with quotation draft via form", async ({ page }) => {
    const cust = await createCustomer(name);
    customerId = cust.id;

    await page.goto("/deals/new?type=quotation");
    await page.getByRole("button", { name: "เลือกลูกค้า" }).click();
    await page.getByPlaceholder("ค้นหาชื่อ รหัส หรือเลขผู้เสียภาษี").fill(name);
    await page.getByText(name).first().click();

    // Add a line item row, then fill it
    await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();
    const itemInput = page.getByPlaceholder("พิมพ์ชื่อสินค้าหรือบริการ...");
    await itemInput.fill("E2E Service Item");
    await itemInput.press("Enter");

    await page.getByRole("button", { name: "ตรวจสอบและบันทึก" }).click();
    await page.waitForURL(/\/deals\//);
    dealId = page.url().split("/deals/")[1].split(/[?#]/)[0];

    // Draft stage visible
    await expect(page.getByText("รอส่งใบเสนอราคา")).toBeVisible();
  });

  test("send quotation from deal page", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ส่งใบเสนอราคาให้ลูกค้า" }).click();
    await expect(page.getByText("รอลูกค้าตอบ")).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});

// silence unused imports in helpers for this spec
void expect; void createDocument; void createLineItems; void today; void uid;
