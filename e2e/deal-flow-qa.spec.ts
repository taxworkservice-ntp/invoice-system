import { expect, test, type Page } from "@playwright/test";
import { admin, api } from "./helpers/env";
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
import { linePriceInput as linePrice } from "./helpers/locators";

/**
 * QA suite — Deal flow (deal page + its functions).
 *
 * Scope: create deal/quotation, send, edit draft, convert quotation→invoice,
 * clone, void+recreate, dev delete gating, financials/summary/print, status
 * lifecycle and stock deduction on send, and payment/receipt.
 *
 * These are black-box e2e checks against the real dev server + test workspace.
 * They intentionally assert behaviour, not implementation, so an assertion
 * failure is a product finding — not necessarily a test bug.
 */

const UUID_RE = /\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function modal(page: Page, heading: string) {
  return page.locator("div.fixed.inset-0").filter({
    has: page.getByRole("heading", { name: heading }),
  });
}

async function addLineItem(page: Page, name: string, price: string) {
  await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();
  const itemInput = page.getByPlaceholder("พิมพ์ชื่อสินค้าหรือบริการ...").last();
  await itemInput.fill(name);
  await itemInput.press("Enter");
  await linePrice(page).fill(price);
}

async function saveThroughConfirm(page: Page, trigger: string) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  const confirm = modal(page, "ยืนยันการบันทึก");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "บันทึก", exact: true }).click();
}

async function createItem(overrides: Record<string, unknown> = {}) {
  const { data, error } = await (await api())
    .from("items")
    .insert({
      id: uid(),
      user_id: await getUserId(),
      name: overrides.name ?? `QA Item ${Date.now()}`,
      item_type: "product",
      base_unit: "ชิ้น",
      unit_price: 100,
      stock_count: 10,
      avg_cost: 40,
      stock_value: 400,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

async function createUserItemLine(documentId: string, itemId: string, name: string) {
  await createLineItems([
    {
      id: uid(),
      document_id: documentId,
      user_id: await getUserId(),
      item_id: itemId,
      item_name: name,
      item_type: "product",
      unit: "ชิ้น",
      unit_price: 100,
      quantity: 2,
      base_quantity: 2,
      line_total: 200,
      sort_order: 0,
    },
  ]);
}

// ---------------------------------------------------------------------------
// A. Create deal + quotation lifecycle (order matters)
// ---------------------------------------------------------------------------
test.describe.serial("deal QA · create → send → convert", () => {
  const customerName = `QA Deal Lifecycle ${Date.now()}`;
  let dealId: string;

  test("A1 create quotation draft through the new-deal form", async ({ page }) => {
    await createCustomer(customerName);

    await page.goto("/deals/new?type=quotation");
    await page.getByRole("button", { name: "เลือกลูกค้า" }).click();
    await page.getByPlaceholder("ค้นหาชื่อ รหัส หรือเลขผู้เสียภาษี").fill(customerName);
    await page.getByText(customerName).first().click();

    await addLineItem(page, `QA Quote Item ${Date.now()}`, "150");

    await saveThroughConfirm(page, "ตรวจสอบและบันทึก");

    await page.waitForURL(UUID_RE);
    dealId = page.url().split("/deals/")[1].split(/[?#]/)[0];

    // Draft stage: pill + send action available.
    await expect(page.getByText("ร่าง", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ส่งใบเสนอราคาให้ลูกค้า" }),
    ).toBeVisible();

    // The draft landed with a document number and a positive total.
    const { data: docs, error } = await admin()
      .from("documents")
      .select("doc_number, status, subtotal, total_amount, doc_type")
      .eq("deal_id", dealId);
    expect(error).toBeNull();
    expect(docs).toHaveLength(1);
    expect(docs![0].doc_type).toBe("quotation");
    expect(docs![0].status).toBe("draft");
    expect(docs![0].doc_number).toBeTruthy();
    // Workspace is VAT-registered, so only the pre-VAT subtotal is stable.
    expect(Number(docs![0].subtotal)).toBe(150);
    expect(Number(docs![0].total_amount)).toBeGreaterThanOrEqual(150);
  });

  test("A2 send quotation locks the draft", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ส่งใบเสนอราคาให้ลูกค้า" }).click();

    await expect(page.getByText("รอลูกค้าตอบ")).toBeVisible();
    // Once sent, the draft cannot be edited directly.
    await expect(page.getByRole("button", { name: "แก้ไขฉบับร่าง" })).toHaveCount(0);

    const { data: doc } = await admin()
      .from("documents")
      .select("status")
      .eq("deal_id", dealId)
      .eq("doc_type", "quotation")
      .single();
    expect(doc!.status).toBe("sent");
  });

  test("A3 convert sent quotation to invoice from the deal page", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "สร้างบิลต่อ" }).click();
    await page.waitForURL(/\/documents\/new\?type=invoice_from_quotation/);
    await expect(page.getByText("ลูกค้าและรอบเอกสาร").first()).toBeVisible();

    await page.getByRole("button", { name: "สร้างใบแจ้งหนี้" }).click();
    await page.waitForURL(UUID_RE);
    await expect(page.getByText("รอวางบิล")).toBeVisible();
    await expect(page.getByRole("button", { name: "สร้างใบวางบิล" })).toBeVisible();

    const { data: docs } = await admin()
      .from("documents")
      .select("doc_type, status, converted_from_id")
      .eq("deal_id", dealId);
    const invoice = docs!.find((d) => d.doc_type === "invoice");
    const quotation = docs!.find((d) => d.doc_type === "quotation");
    expect(invoice?.status).toBe("sent");
    expect(quotation?.status).toBe("converted");
    expect(invoice?.converted_from_id).toBeTruthy();
    // The source quotation must not claim to be converted from anything.
    expect(quotation?.converted_from_id ?? null).toBeNull();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// B. Deal-page document management (edit / void+recreate / clone / dev gating)
// ---------------------------------------------------------------------------
test.describe.serial("deal QA · document management", () => {
  // Two deals: the "edit/clone" deal has a draft quotation as its active doc
  // (so แก้ไขฉบับร่าง is offered); the "void" deal has a sent invoice as its
  // active doc. A single deal with both would make the invoice the active doc
  // and hide the draft-edit affordance.
  let editDealId: string;
  let voidDealId: string;
  let draftQuotationId: string;
  let sentInvoiceId: string;

  test.beforeAll(async () => {
    const userId = await getUserId();

    const editCust = await createCustomer(`QA Deal Edit ${Date.now()}`);
    const editDeal = await createDeal(editCust.id, "QA Deal Edit");
    editDealId = editDeal.id;

    const qt = await createDocument({
      id: uid(),
      deal_id: editDealId,
      customer_id: editCust.id,
      doc_type: "quotation",
      doc_number: `QT-QA-${Date.now()}`,
      status: "draft",
      issue_date: today(),
      subtotal: 150,
      total_amount: 150,
      net_payable: 150,
    });
    draftQuotationId = qt.id;
    await createLineItems([
      {
        id: uid(),
        document_id: qt.id,
        user_id: userId,
        item_name: "QA Edit Item",
        item_type: "service",
        unit: "ชิ้น",
        unit_price: 150,
        quantity: 1,
        base_quantity: 1,
        line_total: 150,
        sort_order: 0,
      },
    ]);

    const voidCust = await createCustomer(`QA Deal Void ${Date.now()}`);
    const voidDeal = await createDeal(voidCust.id, "QA Deal Void");
    voidDealId = voidDeal.id;

    const inv = await createDocument({
      id: uid(),
      deal_id: voidDealId,
      customer_id: voidCust.id,
      doc_type: "invoice",
      doc_number: `INV-QA-${Date.now()}`,
      status: "sent",
      issue_date: today(),
      due_date: today(),
      vat_registered: true,
      vat_rate: 7,
      subtotal: 1000,
      vat_amount: 70,
      total_amount: 1070,
      net_payable: 1070,
    });
    sentInvoiceId = inv.id;
    await createLineItems([
      {
        id: uid(),
        document_id: inv.id,
        user_id: userId,
        item_name: "QA Invoice Item",
        item_type: "service",
        unit: "ชิ้น",
        unit_price: 1000,
        quantity: 1,
        base_quantity: 1,
        line_total: 1000,
        sort_order: 0,
      },
    ]);
  });

  test("B1 แก้ไขฉบับร่าง opens prefilled and saves in place", async ({ page }) => {
    await page.goto(`/deals/${editDealId}`);
    await page.getByRole("button", { name: "แก้ไขฉบับร่าง" }).click();

    await expect(page.getByText("แก้ไขร่างใบเสนอราคา")).toBeVisible();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>("input")).some(
        (el) => el.value === "QA Edit Item",
      ),
    );

    await linePrice(page).fill("250");
    await saveThroughConfirm(page, "บันทึกร่าง");

    await page.waitForURL(new RegExp(`/deals/${editDealId}`));
    await expect(page.getByText("ร่าง", { exact: true }).first()).toBeVisible();

    const { data: qt } = await admin()
      .from("documents")
      .select("subtotal, status")
      .eq("id", draftQuotationId)
      .single();
    expect(qt!.status).toBe("draft");
    expect(Number(qt!.subtotal)).toBe(250);
  });

  test("B2 แก้ไขโดยออกฉบับใหม่ voids the sent invoice and creates a draft copy", async ({ page }) => {
    await page.goto(`/deals/${voidDealId}`);
    await page.getByRole("button", { name: "แก้ไขโดยออกฉบับใหม่" }).click();

    const voidModal = modal(page, "แก้ไขโดยออกฉบับใหม่");
    await expect(voidModal).toBeVisible();
    // NOTE: the label "เหตุผลการยกเลิก" is not associated with its input
    // (ui/Input.tsx only sets htmlFor when callers pass `id`), so target the
    // field by its placeholder instead of getByLabel.
    await voidModal
      .getByPlaceholder("เช่น ลูกค้าขอปรับยอด / ออกผิดรายละเอียด")
      .fill("QA void + recreate");
    await voidModal.getByRole("button", { name: "แก้ไขโดยออกฉบับใหม่" }).click();

    await expect(page.getByText("ยกเลิกและสร้างสำเนาใหม่สำเร็จ")).toBeVisible();

    const { data: old } = await admin()
      .from("documents")
      .select("status")
      .eq("id", sentInvoiceId)
      .single();
    expect(old!.status).toBe("voided");

    const { data: copies } = await admin()
      .from("documents")
      .select("id, status, copied_from_id, doc_type")
      .eq("deal_id", voidDealId)
      .eq("copied_from_id", sentInvoiceId);
    expect(copies).toHaveLength(1);
    expect(copies![0].status).toBe("draft");
    expect(copies![0].doc_type).toBe("invoice");
  });

  test("B3 clone deal from the งานขายใหม่ chooser", async ({ page }) => {
    await page.goto(`/deals/${editDealId}`);
    await page.getByRole("button", { name: "งานขายใหม่" }).click();

    const chooser = modal(page, "สร้างงานขายเหมือนงานนี้");
    await expect(chooser).toBeVisible();
    await chooser.getByRole("button", { name: "เริ่มจากใบเสนอราคา" }).click();

    // The current URL already matches UUID_RE, so wait for it to CHANGE to a
    // different deal id — a bare waitForURL(UUID_RE) resolves immediately.
    await page.waitForURL(
      (url) => UUID_RE.test(url.pathname) && !url.pathname.endsWith(editDealId),
    );
    const cloneId = page.url().split("/deals/")[1].split(/[?#]/)[0];
    expect(cloneId).not.toBe(editDealId);

    await expect(page.getByText("เริ่มงานขายใหม่จากรายการเดิมแล้ว")).toBeVisible();

    const { data: clonedDocs } = await admin()
      .from("documents")
      .select("doc_type, status")
      .eq("deal_id", cloneId);
    expect(clonedDocs!.length).toBeGreaterThanOrEqual(1);
    expect(clonedDocs!.every((d) => d.status === "draft")).toBe(true);

    await deleteDealCascade(cloneId).catch(() => undefined);
  });

  test("B4 destructive dev delete is hidden unless dev_mode_enabled", async ({ page }) => {
    const { data: profile } = await admin()
      .from("client_profiles")
      .select("dev_mode_enabled")
      .eq("user_id", await getUserId())
      .single();

    await page.goto(`/deals/${editDealId}`);
    const devDelete = page.getByRole("button", { name: "ลบงานขายนี้ทั้งชุด (Dev)" });
    if (profile?.dev_mode_enabled === true) {
      await expect(devDelete).toBeVisible();
    } else {
      await expect(devDelete).toHaveCount(0);
    }
  });

  test.afterAll(async () => {
    if (editDealId) await deleteDealCascade(editDealId).catch(() => undefined);
    if (voidDealId) await deleteDealCascade(voidDealId).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// C. Financial summary card, summary sheet and print/PDF
// ---------------------------------------------------------------------------
test.describe.serial("deal QA · financials, summary sheet, print", () => {
  let dealId: string;
  let invoiceNumber: string;
  const INVOICE = { subtotal: 100_000, vat: 7_000, total: 107_000, wht: 3_000, net: 104_000 };

  test.beforeAll(async () => {
    const cust = await createCustomer(`QA Deal Fin ${Date.now()}`);
    const deal = await createDeal(cust.id, "QA Deal Fin");
    dealId = deal.id;
    invoiceNumber = `INV-QA-FIN-${Date.now()}`;

    await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: invoiceNumber,
      status: "paid",
      issue_date: today(),
      due_date: today(),
      vat_registered: true,
      vat_rate: 7,
      subtotal: INVOICE.subtotal,
      vat_amount: INVOICE.vat,
      total_amount: INVOICE.total,
      wht_amount: INVOICE.wht,
      net_payable: INVOICE.net,
      amount_received: INVOICE.net,
    });
    await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "receipt",
      doc_number: `RC-QA-FIN-${Date.now()}`,
      status: "generated",
      issue_date: today(),
      vat_registered: true,
      vat_rate: 7,
      subtotal: INVOICE.subtotal,
      vat_amount: INVOICE.vat,
      total_amount: INVOICE.total,
      wht_amount: INVOICE.wht,
      net_payable: INVOICE.net,
      amount_received: INVOICE.net,
    });
  });

  test("C1 financial summary card renders the expected waterfall", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await expect(page.getByText("สรุปการเงิน")).toBeVisible();
    await expect(page.getByText("ยอดรวม (รวม VAT)").first()).toBeVisible();
    await expect(page.getByText("ยอดสุทธิตามเอกสาร").first()).toBeVisible();
    await expect(page.getByText("รับแล้ว").first()).toBeVisible();
    await expect(page.getByText("ค้างรับ").first()).toBeVisible();
    await expect(page.getByText("รับครบแล้ว")).toBeVisible();
  });

  test("C2 summary sheet opens with ledger and statement", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "สรุปงานขาย" }).click();

    const sheet = modal(page, "สรุปงานขาย");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("รายการเอกสารทั้งหมด")).toBeVisible();
    await expect(sheet.getByText("สรุปยอด")).toBeVisible();
    await expect(sheet.getByRole("cell", { name: invoiceNumber })).toBeVisible();
  });

  test("C3 พิมพ์ / PDF opens the print view in a new tab", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "พิมพ์ / PDF" }).first().click(),
    ]);
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(/\/documents\/.+\/print/);
    await expect(popup.locator("article.print-sheet")).toBeVisible();
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// D. Status lifecycle + stock deduction on send
// ---------------------------------------------------------------------------
test.describe.serial("deal QA · status + stock on send", () => {
  let dealId: string;
  let itemId: string;
  let invoiceId: string;

  test.beforeAll(async () => {
    const cust = await createCustomer(`QA Deal Stock ${Date.now()}`);
    const deal = await createDeal(cust.id, "QA Deal Stock");
    dealId = deal.id;

    const item = await createItem({ name: `QA Stock Item ${Date.now()}`, stock_count: 10 });
    itemId = item.id;

    const inv = await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: `INV-QA-STK-${Date.now()}`,
      status: "draft",
      issue_date: today(),
      vat_registered: true,
      vat_rate: 7,
      subtotal: 200,
      vat_amount: 14,
      total_amount: 214,
      net_payable: 214,
    });
    invoiceId = inv.id;
    await createUserItemLine(inv.id, itemId, item.name);
  });

  test("D1 sending the invoice deducts stock exactly once", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ส่งใบแจ้งหนี้ให้ลูกค้า" }).click();

    const confirm = modal(page, "ยืนยันการส่งเอกสาร");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "ส่งเอกสาร" }).click();

    const adminClient = admin();
    await expect
      .poll(async () => {
        const { data } = await adminClient
          .from("items")
          .select("stock_count")
          .eq("id", itemId)
          .single();
        return Number(data?.stock_count);
      }, { timeout: 20_000 })
      .toBe(8);

    // Exactly one auto_out movement for this document (idempotency guard).
    const { data: movements } = await adminClient
      .from("stock_movements")
      .select("id, movement_type")
      .eq("document_id", invoiceId)
      .eq("movement_type", "auto_out");
    expect(movements).toHaveLength(1);

    const { data: doc } = await adminClient
      .from("documents")
      .select("status")
      .eq("id", invoiceId)
      .single();
    expect(doc!.status).toBe("sent");
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
    if (itemId) {
      try {
        await admin().from("items").delete().eq("id", itemId);
      } catch {
        // best-effort cleanup
      }
    }
  });
});

// ---------------------------------------------------------------------------
// E. Payment → draft receipt → confirm receipt
// ---------------------------------------------------------------------------
test.describe.serial("deal QA · payment and receipt", () => {
  let dealId: string;
  let bankAccountId: string;
  const NET = 10_700;

  test.beforeAll(async () => {
    const cust = await createCustomer(`QA Deal Pay ${Date.now()}`);
    const deal = await createDeal(cust.id, "QA Deal Pay");
    dealId = deal.id;

    // The default payment method is โอนเงิน, which requires a bank account.
    // Create one so the default path is exercisable.
    const { data: bank, error: bankError } = await (await api())
      .from("bank_accounts")
      .insert({
        id: uid(),
        user_id: await getUserId(),
        bank_name: `QA Bank ${Date.now()}`,
        account_number: `000-0-${Date.now()}`,
        account_holder_name: "QA Holder",
        is_primary: true,
        is_active: true,
      })
      .select()
      .single();
    if (bankError) throw bankError;
    bankAccountId = bank.id;

    await createDocument({
      id: uid(),
      deal_id: dealId,
      customer_id: cust.id,
      doc_type: "billing_note",
      doc_number: `BN-QA-${Date.now()}`,
      status: "sent",
      issue_date: today(),
      due_date: today(),
      vat_registered: true,
      vat_rate: 7,
      subtotal: 10_000,
      vat_amount: 700,
      total_amount: NET,
      net_payable: NET,
    });
  });

  test("E1 บันทึกรับเงิน creates a draft receipt", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "บันทึกรับเงิน" }).click();

    const payModal = modal(page, "บันทึกรับเงิน (ร่างใบเสร็จ)");
    await expect(payModal).toBeVisible();

    // F-QA3: the modal is interactive before its async prefill settles. Wait for
    // the prefill (amount + default bank account) before saving, otherwise the
    // click hits a stale remaining=0 and silently no-ops.
    await expect(payModal.locator('input[type="number"]').first()).toHaveValue("10000", { timeout: 15_000 });
    await expect.poll(async () => {
      const values = await payModal
        .locator("select")
        .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).value));
      return values.some((value) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value));
    }, { timeout: 15_000 }).toBe(true);

    await payModal.getByRole("button", { name: "บันทึกใบเสร็จ (ร่าง)" }).click();

    // A draft receipt now drives the primary action.
    await expect(page.getByRole("button", { name: "ยืนยันการรับเงิน" })).toBeVisible();

    const { data: receipts } = await admin()
      .from("documents")
      .select("status, doc_type")
      .eq("deal_id", dealId)
      .eq("doc_type", "receipt");
    expect(receipts).toHaveLength(1);
    expect(receipts![0].status).toBe("draft");
  });

  test("E2 confirming the receipt marks the billing note paid", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ยืนยันการรับเงิน" }).click();

    const confirm = modal(page, "ยืนยันการรับเงิน");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "ยืนยันการรับเงิน" }).click();

    const adminClient = admin();
    await expect
      .poll(async () => {
        const { data } = await adminClient
          .from("documents")
          .select("status")
          .eq("deal_id", dealId)
          .eq("doc_type", "receipt")
          .single();
        return data?.status;
      }, { timeout: 20_000 })
      .toBe("generated");

    const { data: bn } = await adminClient
      .from("documents")
      .select("status")
      .eq("deal_id", dealId)
      .eq("doc_type", "billing_note")
      .single();
    expect(bn!.status).toBe("paid");
  });

  test.afterAll(async () => {
    if (dealId) await deleteDealCascade(dealId).catch(() => undefined);
    if (bankAccountId) {
      try {
        await admin().from("bank_accounts").delete().eq("id", bankAccountId);
      } catch {
        // best-effort cleanup
      }
    }
  });
});
