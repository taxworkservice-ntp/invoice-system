import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { admin } from "./helpers/env";
import {
  createCustomer,
  createDeal,
  createDocument,
  deleteDealCascade,
  getUserId,
  today,
  uid,
} from "./helpers/data";

let VALID_PDF: Buffer;

function confirmModal(page: Page) {
  return page.locator("div.fixed.inset-0").filter({
    has: page.getByRole("heading", { name: "ยืนยันการดาวน์โหลด" }),
  });
}

async function stubPdfRoute(page: Page) {
  // The PDF API is a separate dev server; serve a real (parseable) PDF so the
  // flow — including pdf-lib merge — runs without it.
  await page.route("**/api/documents/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/pdf", body: VALID_PDF }),
  );
}

async function selectBuilderType(page: Page, docType: string) {
  await page.getByLabel("ประเภทเอกสาร", { exact: true }).selectOption(docType);
}

async function confirmDownload(page: Page, buttonName: RegExp | string, expectExt: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await page.getByRole("button", { name: buttonName }).click();
      const confirm = confirmModal(page);
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "ยืนยันดาวน์โหลด" }).click();
    })(),
  ]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${expectExt}$`));
  return download;
}

test.describe.serial("download center", () => {
  let dealId: string;
  let whtVendorId: string;
  let whtRecordId: string;

  test.beforeAll(async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    VALID_PDF = Buffer.from(await pdf.save());

    const cust = await createCustomer(`E2E DL Cust ${Date.now()}`);
    const deal = await createDeal(cust.id, "E2E Download Center");
    dealId = deal.id;
    await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "receipt",
      doc_number: `RC-E2E-DL-${Date.now()}`,
      status: "generated",
      issue_date: today(),
      vat_registered: true,
      vat_rate: 7,
      subtotal: 100,
      vat_amount: 7,
      total_amount: 107,
      net_payable: 107,
    });

    // Seed a WHT payable record for the current month (vendor + record).
    const adminClient = admin();
    const userId = await getUserId();
    whtVendorId = uid();
    whtRecordId = uid();
    const { error: vendorError } = await adminClient.from("wht_vendors").insert({
      id: whtVendorId,
      user_id: userId,
      name: `E2E Vendor ${Date.now()}`,
      is_active: true,
    });
    if (vendorError) throw vendorError;
    const { error: recordError } = await adminClient.from("wht_records").insert({
      id: whtRecordId,
      user_id: userId,
      vendor_id: whtVendorId,
      form_type: "pnd53",
      issue_date: today(),
      amount: 1000,
      wht_rate: 3,
      wht_amount: 30,
      status: "active",
      source: "manual",
    });
    if (recordError) throw recordError;
  });

  test("quick preset downloads a zip and reports the result", async ({ page }) => {
    await stubPdfRoute(page);
    await page.goto("/download-center");
    await expect(page.getByRole("heading", { name: "ศูนย์ดาวน์โหลด" })).toBeVisible();

    const preset = page.getByRole("button", { name: /ใบเสร็จ/ }).first();
    await expect(preset).toBeEnabled({ timeout: 15_000 });
    await preset.click();

    const confirm = confirmModal(page);
    await expect(confirm).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      confirm.getByRole("button", { name: "ยืนยันดาวน์โหลด" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    await expect(page.getByText(/ดาวน์โหลด .* ไฟล์/).first()).toBeVisible({ timeout: 15_000 });
  });

  test("builder downloads a grouped zip", async ({ page }) => {
    await stubPdfRoute(page);
    await page.goto("/download-center");
    await selectBuilderType(page, "receipt");
    await confirmDownload(page, /ดาวน์โหลดเป็น ZIP/, "zip");
  });

  test("builder CSV export downloads a csv", async ({ page }) => {
    await page.goto("/download-center");
    await selectBuilderType(page, "receipt");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /ดาวน์โหลด CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("merged single PDF downloads one pdf", async ({ page }) => {
    await stubPdfRoute(page);
    await page.goto("/download-center");
    await selectBuilderType(page, "receipt");
    await page.getByLabel(/รวมเป็น PDF ไฟล์เดียว/).check();
    await confirmDownload(page, /รวมเป็น PDF ไฟล์เดียว/, "pdf");
  });

  test("financial report CSV exports lazily", async ({ page }) => {
    await page.goto("/download-center");
    // Financial card is first; switch it to CSV then download.
    await page.getByRole("button", { name: "csv", exact: true }).first().click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "ดาวน์โหลด", exact: true }).first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("tax pack XLSX downloads", async ({ page }) => {
    await page.goto("/download-center");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /ดาวน์โหลดชุดภาษี/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test("WHT register CSV downloads", async ({ page }) => {
    await page.goto("/download-center");
    const button = page.getByRole("button", { name: /CSV ภ.ง.ด.3\/53/ });
    await expect(button).toBeEnabled({ timeout: 15_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("WHT certificates PDF downloads", async ({ page }) => {
    await page.route("**/api/wht/generate", (route) =>
      route.fulfill({ status: 200, contentType: "application/pdf", body: VALID_PDF }),
    );
    await page.goto("/download-center");
    const button = page.getByRole("button", { name: /ดาวน์โหลดใบรับรอง/ });
    await expect(button).toBeEnabled({ timeout: 15_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("records the download in download_audit", async ({ page }) => {
    const { count, error } = await admin()
      .from("download_audit")
      .select("id", { count: "exact", head: true })
      .eq("user_id", await getUserId())
      .eq("kind", "documents");
    if (error || count == null) {
      test.skip(true, `download_audit unavailable: ${error?.message ?? "no count"}`);
      return;
    }

    await stubPdfRoute(page);
    await page.goto("/download-center");
    await selectBuilderType(page, "receipt");
    await confirmDownload(page, /ดาวน์โหลดเป็น ZIP/, "zip");

    await expect
      .poll(async () => {
        const { count: after } = await admin()
          .from("download_audit")
          .select("id", { count: "exact", head: true })
          .eq("user_id", await getUserId())
          .eq("kind", "documents");
        return after ?? 0;
      }, { timeout: 15_000 })
      .toBeGreaterThan(count);
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
    try {
      const adminClient = admin();
      if (whtRecordId) await adminClient.from("wht_records").delete().eq("id", whtRecordId);
      if (whtVendorId) await adminClient.from("wht_vendors").delete().eq("id", whtVendorId);
    } catch {
      // best-effort cleanup
    }
  });
});
