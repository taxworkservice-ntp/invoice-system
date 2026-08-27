import { test } from "@playwright/test";
import { expect } from "@playwright/test";

test.describe.serial("WHT page smoke", () => {
  test("renders tabs, opens add-record modal, ESC closes", async ({ page }) => {
    await page.goto("/wht");
    await expect(page.getByText("ภาษีหัก ณ ที่จ่าย").first()).toBeVisible();

    // Records tab is default; open the add-record modal.
    await page.getByRole("button", { name: /เพิ่มรายการ/ }).first().click();
    const dialog = page.locator("div.fixed.inset-0");
    await expect(dialog.getByText("รุ่น Beta — รองรับเฉพาะ ภ.ง.ด.3 และ ภ.ง.ด.53")).toBeVisible();

    // Shared Modal: X button + ESC both close.
    await page.keyboard.press("Escape");
    await expect(page.getByText("รุ่น Beta — รองรับเฉพาะ ภ.ง.ด.3 และ ภ.ง.ด.53")).toBeHidden();

    // Switch to vendors tab and back.
    await page.getByRole("button", { name: "ผู้ขาย/ผู้รับเงิน" }).first().click();
    await expect(page.getByRole("button", { name: /เพิ่ม$/ })).toBeVisible();
  });

  test("add-vendor modal validates 13-digit tax id", async ({ page }) => {
    await page.goto("/wht");
    await page.getByRole("button", { name: "ผู้ขาย/ผู้รับเงิน" }).first().click();
    await page.getByRole("button", { name: /^เพิ่ม$/ }).click();
    await expect(page.getByText("เพิ่มผู้ขาย/ผู้รับเงิน")).toBeVisible();

    // Fill with an invalid tax id then submit -> inline error appears.
    await page.getByLabel(/ชื่อบริษัท|ชื่อบุคคล/).fill("E2E Smoke Vendor");
    await page.getByLabel("เลขผู้เสียภาษี (13 หลัก) *").fill("123456789012");
    await page.getByLabel("ที่อยู่ *").fill("กรุงเทพฯ");
    await page.getByRole("button", { name: "บันทึก" }).last().click();
    await expect(page.getByText("ต้องเป็นตัวเลข 13 หลัก")).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
