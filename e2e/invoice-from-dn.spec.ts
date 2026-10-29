import { expect, test } from "@playwright/test";
import { api } from "./helpers/env";
import {
  createCustomer,
  createDeal,
  createDocument,
  createLineItems,
  deleteDealCascade,
  getUserId,
  today,
  uid,
} from "./helpers/data";

test.describe.serial("invoice from delivery notes — both modes + guard", () => {
  let dealId: string;
  let customerId: string;
  let dnNumber: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`E2E Cust IFD ${Date.now()}`);
    customerId = cust.id;
    const deal = await createDeal(cust.id);
    dealId = deal.id;
    const userId = await getUserId();
    const qt = await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "quotation",
      doc_number: "QT-E2E-IFD",
      status: "sent",
      issue_date: today(),
    });
    await createLineItems([
      {
        document_id: qt.id,
        user_id: userId,
        item_name: "E2E Goods",
        item_type: "product",
        unit: "ชิ้น",
        unit_price: 100,
        quantity: 5,
        base_quantity: 5,
        line_total: 500,
        sort_order: 0,
      },
    ]);
    const dn = await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "delivery_note",
      doc_number: "DN-E2E-IFD",
      status: "sent",
      issue_date: today(),
      converted_from_id: qt.id,
      hide_amounts_on_print: true,
    });
    dnNumber = dn.doc_number;
    await createLineItems([
      {
        document_id: dn.id,
        user_id: userId,
        item_name: "E2E Goods",
        item_sku: null,
        item_type: "product",
        unit: "ชิ้น",
        unit_price: 100,
        quantity: 5,
        base_quantity: 5,
        discount_percent: 0,
        discount_amount: 0,
        line_total: 500,
        source_document_id: qt.id,
        sort_order: 0,
      },
    ]);
  });

  test("review modal defaults to detail and previews one ref row per DN", async ({ page }) => {
    const { data: dn } = await (
      await api()
    )
      .from("documents")
      .select("id")
      .eq("doc_number", dnNumber)
      .single();
    await page.goto(`/documents/new?type=invoice_from_delivery_notes&dnId=${dn!.id}`);
    await expect(page.getByText(`ใบส่งของ ${dnNumber}`)).toBeVisible();

    await page.getByRole("button", { name: "ตรวจสอบและสร้างใบแจ้งหนี้" }).click();
    const dialog = page.getByRole("dialog", { name: "ยืนยันสร้างใบแจ้งหนี้" });
    await expect(dialog).toBeVisible();

    // Detail is the safe default for every new invoice.
    await expect(dialog.getByRole("radio", { name: /รายละเอียดสินค้า/ })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: /อ้างอิงใบส่งของ/ })).not.toBeChecked();

    await dialog.getByText("อ้างอิงใบส่งของ", { exact: true }).click();
    await expect(dialog.getByRole("radio", { name: /อ้างอิงใบส่งของ/ })).toBeChecked();
    await expect(dialog.getByText("1 บรรทัดในเอกสาร")).toBeVisible();
    await expect(dialog.getByText(new RegExp(dnNumber))).toBeVisible();

    await dialog.getByRole("button", { name: "ย้อนกลับไปแก้ไข" }).click();
    await expect(dialog).toBeHidden();
  });

  test("reference mode creates one printed line per DN", async ({ page }) => {
    const userId = await getUserId();
    const refDnNumber = `DN-E2E-REF-${Date.now()}`;
    const refDn = await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "delivery_note",
      doc_number: refDnNumber,
      status: "sent",
      issue_date: today(),
    });
    await createLineItems([
      {
        document_id: refDn.id,
        user_id: userId,
        item_name: "Ref Goods",
        item_type: "product",
        unit: "ชิ้น",
        unit_price: 100,
        quantity: 5,
        base_quantity: 5,
        line_total: 500,
        sort_order: 0,
      },
    ]);

    await page.goto(`/documents/new?type=invoice_from_delivery_notes&dnId=${refDn.id}`);
    await page.getByRole("button", { name: "ตรวจสอบและสร้างใบแจ้งหนี้" }).click();
    const dialog = page.getByRole("dialog", { name: "ยืนยันสร้างใบแจ้งหนี้" });
    await dialog.getByText("อ้างอิงใบส่งของ", { exact: true }).click();
    await dialog.getByRole("button", { name: "ยืนยันสร้างใบแจ้งหนี้" }).click();
    await page.waitForURL(/\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

    const sb = await api();
    const { data: invoices } = await sb
      .from("documents")
      .select("id")
      .eq("deal_id", dealId)
      .eq("doc_type", "invoice")
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: lines } = await sb
      .from("document_line_items")
      .select("*")
      .eq("document_id", invoices![0].id);
    expect(lines).toHaveLength(1);
    expect(lines![0].item_name).toContain(refDnNumber);
    expect(Number(lines![0].quantity)).toBe(1);
    expect(Number(lines![0].unit_price)).toBe(500);
    expect(Number(lines![0].line_total)).toBe(500);
    expect(lines![0].source_document_id).toBe(refDn.id);
    expect(lines![0].source_line_item_id).toBeNull();
  });

  test("detail mode is the form default and shows the editable grid", async ({ page }) => {
    const { data: dn } = await (
      await api()
    )
      .from("documents")
      .select("id")
      .eq("doc_number", dnNumber)
      .single();
    await page.goto(`/documents/new?type=invoice_from_delivery_notes&dnId=${dn!.id}`);
    await expect(page.getByPlaceholder("+ รายละเอียด / สเปค").first()).toBeVisible();

    await page.getByRole("button", { name: "ตรวจสอบและสร้างใบแจ้งหนี้" }).click();
    const dialog = page.getByRole("dialog", { name: "ยืนยันสร้างใบแจ้งหนี้" });
    await expect(dialog.getByRole("radio", { name: /รายละเอียดสินค้า/ })).toBeChecked();
    await expect(dialog.getByText("1 รายการในเอกสาร")).toBeVisible();
    await dialog.getByRole("button", { name: "ย้อนกลับไปแก้ไข" }).click();
  });

  test("over-billing is prevented by qty clamp", async ({ page }) => {
    const { data: dn } = await (
      await api()
    )
      .from("documents")
      .select("id")
      .eq("doc_number", dnNumber)
      .single();
    await page.goto(`/documents/new?type=invoice_from_delivery_notes&dnId=${dn!.id}`);
    // The grid quantity is a numeric text field (inputMode="decimal"),
    // and it clamps to the remaining delivered quantity (5) —
    // over-billing cannot be submitted from the UI.
    const qty = page.locator('input[inputmode="decimal"]').first();
    await qty.fill("99");
    await qty.blur();
    await expect(qty).toHaveValue("5");

    await page.getByRole("button", { name: "ตรวจสอบและสร้างใบแจ้งหนี้" }).click();
    const dialog = page.getByRole("dialog", { name: "ยืนยันสร้างใบแจ้งหนี้" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "ยืนยันสร้างใบแจ้งหนี้" }).click();
    await page.waitForURL(/\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    await expect(page.getByRole("button", { name: /^ออกใบวางบิล/ })).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});
