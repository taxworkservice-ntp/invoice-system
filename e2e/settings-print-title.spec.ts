import { expect, test } from "@playwright/test";
import { api, signInAndGetSession } from "./helpers/env";

test("workspace tax-invoice print title is confirmed and audited", async ({ page }) => {
  test.setTimeout(120_000);
  const session = await signInAndGetSession();
  const client = await api();
  const reason = `e2e print title ${Date.now()}`;

  const { data: profile } = await client
    .from("client_profiles")
    .select("vat_registered")
    .eq("user_id", session.user.id)
    .single();
  test.skip(!profile?.vat_registered, "test workspace is not VAT-registered");

  await page.goto("/settings/documents");
  const section = page.locator("section, div").filter({ hasText: "ชื่อเรื่องบนหัวเอกสาร" }).first();
  const select = page.getByLabel("ใบกำกับภาษี (VAT)");
  await expect(select).toBeVisible();
  const original = await select.inputValue();

  async function save(preset: string, note: string) {
    await select.selectOption(preset);
    await expect(select).toHaveValue(preset);
    await page.getByRole("button", { name: "บันทึกชื่อเรื่อง" }).click();
    const dialog = page.getByRole("dialog", { name: "ยืนยันการเปลี่ยนชื่อหัวเอกสาร" });
    await expect(dialog).toBeVisible();

    const confirm = dialog.getByRole("button", { name: "ยืนยันการบันทึก" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/เหตุผลในการเปลี่ยน/).fill(note);
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/พิมพ์ “ยืนยัน”/).fill("ยืนยัน");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText("บันทึกชื่อหัวเอกสารสำเร็จ")).toBeVisible();
  }

  try {
    await save("tax_invoice_invoice", reason);

    const { data: audit } = await client
      .from("document_print_title_audit")
      .select("reason, doc_type, after, actor_user_id")
      .eq("workspace_user_id", session.user.id)
      .eq("reason", reason)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit?.[0]?.reason).toBe(reason);
    expect(audit?.[0]?.doc_type).toBe("invoice");
    expect((audit?.[0]?.after as { preset?: string } | null)?.preset).toBe("tax_invoice_invoice");
    expect(audit?.[0]?.actor_user_id).toBe(session.user.id);
  } finally {
    await page.goto("/settings/documents");
    const restoreSelect = page.getByLabel("ใบกำกับภาษี (VAT)");
    if ((await restoreSelect.inputValue()) !== original) {
      await save(original, `restore ${reason}`);
    }
  }
});
