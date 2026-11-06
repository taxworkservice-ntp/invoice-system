import { expect, test } from "@playwright/test";
import { api, signInAndGetSession } from "./helpers/env";

test.describe.configure({ mode: "serial" });

test("numbering changes require confirmation, reason, and are audited", async ({ page }) => {
  test.setTimeout(120_000);
  const session = await signInAndGetSession();
  const client = await api();
  const reason = `e2e numbering ${Date.now()}`;

  await page.goto("/settings/numbering");
  const row = page.locator("tr", { hasText: "ใบกำกับภาษี" }).first();
  const prefix = row.locator("input").first();
  const original = await prefix.inputValue();

  async function openConfirmAndFill() {
    await page.getByRole("button", { name: "บันทึกทั้งหมด" }).click();
    const dialog = page.getByRole("dialog", { name: "ยืนยันการเปลี่ยนเลขที่เอกสาร" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  try {
    await prefix.fill(`${original}E2E`);
    let dialog = await openConfirmAndFill();
    const confirm = dialog.getByRole("button", { name: "ยืนยันการบันทึก" });
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel(/เหตุผลในการเปลี่ยน/).fill(reason);
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/พิมพ์ “ยืนยัน”/).fill("ยืนยัน");
    await expect(confirm).toBeEnabled();

    // Cancel must not write anything.
    await dialog.getByRole("button", { name: "ยกเลิก" }).click();
    await page.reload();
    await expect(
      page.locator("tr", { hasText: "ใบกำกับภาษี" }).first().locator("input").first(),
    ).toHaveValue(original);

    // Real save: change, confirm, verify persistence.
    const row2 = page.locator("tr", { hasText: "ใบกำกับภาษี" }).first();
    await row2.locator("input").first().fill(`${original}E2E`);
    dialog = await openConfirmAndFill();
    await dialog.getByLabel(/เหตุผลในการเปลี่ยน/).fill(reason);
    await dialog.getByLabel(/พิมพ์ “ยืนยัน”/).fill("ยืนยัน");
    await dialog.getByRole("button", { name: "ยืนยันการบันทึก" }).click();
    await expect(page.getByText("บันทึกเลขที่เอกสารสำเร็จ")).toBeVisible();

    const { data: audit } = await client
      .from("doc_number_sequence_audit")
      .select("reason, doc_type, actor_user_id")
      .eq("workspace_user_id", session.user.id)
      .eq("reason", reason)
      .eq("doc_type", "invoice")
      .limit(1);
    expect(audit?.[0]?.reason).toBe(reason);
    expect(audit?.[0]?.doc_type).toBe("invoice");
    expect(audit?.[0]?.actor_user_id).toBe(session.user.id);
  } finally {
    // Restore the original prefix through the same confirmed flow.
    await page.goto("/settings/numbering");
    const restoreRow = page.locator("tr", { hasText: "ใบกำกับภาษี" }).first();
    const restoreInput = restoreRow.locator("input").first();
    if ((await restoreInput.inputValue()) !== original) {
      await restoreInput.fill(original);
      const dialog = await openConfirmAndFill();
      await dialog.getByLabel(/เหตุผลในการเปลี่ยน/).fill(`restore ${reason}`);
      await dialog.getByLabel(/พิมพ์ “ยืนยัน”/).fill("ยืนยัน");
      await dialog.getByRole("button", { name: "ยืนยันการบันทึก" }).click();
      await expect(page.getByText("บันทึกเลขที่เอกสารสำเร็จ")).toBeVisible();
    }
  }
});
