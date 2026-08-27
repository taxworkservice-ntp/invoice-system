import { expect } from "@playwright/test";
import { test } from "@playwright/test";
import { createCustomer, createDeal, createDocument, createLineItems, deleteDealCascade, getUserId, today, uid } from "./helpers/data";

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
    await page.getByLabel("ราคา/หน่วย").fill("150");

    // Confirm modal "ยืนยันการบันทึก" appears first; save inside it.
    // exact:true so it cannot match the form's own "ตรวจสอบและบันทึก".
    await page.getByRole("button", { name: "ตรวจสอบและบันทึก" }).click();
    const confirmModal = page.locator("div.fixed.inset-0").filter({
      has: page.getByRole("heading", { name: "ยืนยันการบันทึก" }),
    });
    await confirmModal.getByRole("button", { name: "บันทึก", exact: true }).click();

    // Deal URLs are UUIDs — /deals/new must NOT match.
    await page.waitForURL(
      /\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    dealId = page.url().split("/deals/")[1].split(/[?#]/)[0];

    // Draft stage on the deal page: pill "ร่าง" + send action available.
    // ("รอส่งใบเสนอราคา" is the home-pipeline hint, never shown on /deals/{id}.)
    await expect(page.getByText("ร่าง", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ส่งใบเสนอราคาให้ลูกค้า" }),
    ).toBeVisible();
  });

  test("send quotation from deal page", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ส่งใบเสนอราคาให้ลูกค้า" }).click();
    await expect(page.getByText("รอลูกค้าตอบ")).toBeVisible();
  });

  test("แก้ไขฉบับร่าง reopens edit form prefilled and saves in place", async ({ page }) => {
    // Reset: recreate a fresh draft deal for this test.
    const cust = await createCustomer(name);
    const freshDeal = await createDeal(cust.id, `E2E QT Edit ${Date.now()}`);
    const doc = await createDocument({
      id: uid(),
      user_id: await getUserId(),
      deal_id: freshDeal.id,
      customer_id: cust.id,
      doc_type: "quotation",
      status: "draft",
      issue_date: today(),
      total_amount: 150,
      subtotal: 150,
    });
    await createLineItems([
      {
        id: uid(),
        document_id: doc.id,
        user_id: await getUserId(),
        item_name: "E2E Edit Item",
        item_type: "service",
        unit: "ชิ้น",
        unit_price: 150,
        quantity: 1,
        line_total: 150,
        sort_order: 0,
      },
    ]);

    await page.goto(`/deals/${freshDeal.id}`);
    await page.getByRole("button", { name: "แก้ไขฉบับร่าง" }).click();

    // Edit form opens prefilled (title + item name present).
    await expect(page.getByText("แก้ไขร่างใบเสนอราคา")).toBeVisible();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>("input")).some(
        (el) => el.value === "E2E Edit Item",
      ),
    );
    const priceInput = page.getByLabel("ราคา/หน่วย");
    await priceInput.fill("250");

    await page.getByRole("button", { name: "บันทึกร่าง", exact: true }).click();
    const confirmModal = page.locator("div.fixed.inset-0").filter({
      has: page.getByRole("heading", { name: "ยืนยันการบันทึก" }),
    });
    await confirmModal.getByRole("button", { name: "บันทึก", exact: true }).click();

    // Back on the deal page, still draft, amount updated in place.
    await page.waitForURL(new RegExp(`/deals/${freshDeal.id}`));
    await expect(page.getByText("ร่าง", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/฿?250(?:\.00)?/).first()).toBeVisible();
    await deleteDealCascade(freshDeal.id);
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});

// silence unused imports in helpers for this spec
void expect; void createDocument; void createLineItems; void today; void uid;
