import { expect, test, type Page } from "@playwright/test";
import { api } from "./helpers/env";

/**
 * The click-through journey: delivery note → invoice → billing note → receipt
 * → paid, with the database asserted after every step.
 *
 * The three invariants the QA fixes introduced are asserted here, so none of
 * them can come back unnoticed:
 *
 *   1. an invoice stranded behind a DRAFT billing note still has a next step
 *      ("ส่งใบวางบิลให้ลูกค้า") — the invoice itself is not offered;
 *   2. an adjustment note lands as `issued` (not `sent`) and the deal reads
 *      done;
 *   3. the bulk delivery-note button preselects EVERY billable note.
 *
 * The quotation chain (quotation → invoice → billing note → paid) is walked
 * too, but only when the database allows it: an invoice made from a
 * quotation used to be frozen by a DB guard (see
 * sql/20261021_quotation_invoice_status_guard.sql), and until that migration
 * is applied the chain cannot work. The group skips with that reason
 * instead of failing.
 *
 * Everything is read and written through the signed-in workspace client (the
 * anon key + the user's own JWT), so the spec runs wherever the test account
 * exists — no service-role key needed. RLS still bounds it to that
 * workspace, and the cleanup removes exactly the rows this spec created.
 */

const DEAL_UUID_RE = /\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DOC_UUID_RE = /\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);

function modal(page: Page, heading: string) {
  return page.locator("div.fixed.inset-0").filter({
    has: page.getByRole("heading", { name: heading }),
  });
}

async function workspace() {
  const client = await api();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("the test workspace client is not signed in");
  return { client, userId: user.id };
}

async function insertCustomer(name: string) {
  const { client, userId } = await workspace();
  const { data, error } = await client
    .from("customers")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      tax_id: "0105556000123",
      address: "99/9 ถนนงาน กรุงเทพ",
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

async function insertDeal(customerId: string, title: string) {
  const { client, userId } = await workspace();
  const { data, error } = await client
    .from("deals")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      customer_id: customerId,
      title,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

async function insertDocument(row: Record<string, unknown>) {
  const { client, userId } = await workspace();
  const { data, error } = await client
    .from("documents")
    .insert({ user_id: userId, ...row })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

async function insertLineItems(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  const { client, userId } = await workspace();
  const { data, error } = await client
    .from("document_line_items")
    .insert(rows.map((row) => ({ user_id: userId, ...row })))
    .select();
  if (error) throw error;
  return data as any[];
}

async function documentsOf(dealId: string, docType?: string) {
  const { client } = await workspace();
  let query = client.from("documents").select("*").eq("deal_id", dealId);
  if (docType) query = query.eq("doc_type", docType);
  const { data, error } = await query;
  if (error) throw error;
  return data as any[];
}

async function linksOf(table: string, column: string, id: string) {
  const { client } = await workspace();
  const { data, error } = await client.from(table).select("*").eq(column, id);
  if (error) throw error;
  return data as any[];
}

/** Removes this spec's own rows — documents, their links, the deal, the customer. */
async function cleanup(dealId?: string, customerId?: string) {
  if (!dealId) return;
  const { client } = await workspace();
  const { data: docs } = await client.from("documents").select("id").eq("deal_id", dealId);
  const ids = (docs || []).map((d: any) => d.id);
  if (ids.length) {
    for (const [table, column] of [
      ["invoice_delivery_notes", "invoice_id"],
      ["invoice_delivery_notes", "delivery_note_id"],
      ["billing_note_invoices", "invoice_id"],
      ["billing_note_invoices", "billing_note_id"],
      ["receipt_invoices", "invoice_id"],
      ["receipt_invoices", "receipt_id"],
      ["document_line_items", "document_id"],
      ["stock_movements", "document_id"],
    ] as const) {
      await client
        .from(table)
        .delete()
        .in(column as string, ids as string[]);
    }
    await client.from("documents").delete().in("id", ids);
  }
  await client.from("deals").delete().eq("id", dealId);
  if (customerId) await client.from("customers").delete().eq("id", customerId);
}

async function addLineItem(page: Page, name: string, price: string) {
  await page.getByRole("button", { name: "เพิ่มสินค้าหรือบริการ" }).click();

  // The shared line editor (components/documents/LineItemEditorModal.tsx).
  const editor = modal(page, "เพิ่มรายการ");
  await expect(editor).toBeVisible();
  await editor.getByPlaceholder(/พิมพ์ชื่อสินค้าหรือบริการ/).fill(name);
  await editor.getByLabel(/ราคา\/หน่วย/).fill(price);
  await editor.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(editor).toBeHidden();
}

/** Picks the customer on the new-deal form. */
async function pickCustomer(page: Page, customerName: string) {
  await page.getByRole("button", { name: "เลือกลูกค้า" }).click();
  await page.getByPlaceholder("ค้นหาชื่อ รหัส หรือเลขผู้เสียภาษี").fill(customerName);
  await page.getByText(customerName).first().click();
}

/** The issue date is an explicit step — "วันนี้" fills it in. */
async function pickIssueDate(page: Page) {
  await page
    .getByRole("group", { name: "เลือกวันที่ออกเอกสาร" })
    .getByRole("button", { name: "วันนี้" })
    .click();
}

/** The payment modal: save the draft receipt. */
async function saveDraftReceipt(page: Page) {
  await page.getByRole("button", { name: "บันทึกรับเงิน" }).click();
  const payModal = modal(page, "บันทึกรับเงิน (ร่างใบเสร็จ)");
  await expect(payModal).toBeVisible();
  // The prefill is async — wait for the amount, or the click hits a stale
  // remaining=0 and silently no-ops. The amount is a NumericInput, so it is
  // a text field with inputMode="decimal" (not type="number").
  await expect(payModal.locator('input[inputmode="decimal"]').first()).not.toHaveValue("0", {
    timeout: 15_000,
  });
  await payModal.getByRole("button", { name: "บันทึกใบเสร็จ (ร่าง)" }).click();
  await expect(page.getByRole("button", { name: "ยืนยันการรับเงิน" })).toBeVisible();
}

/** The payment modal: confirm the receipt. */
async function confirmReceipt(page: Page) {
  await page.getByRole("button", { name: "ยืนยันการรับเงิน" }).click();
  const confirm = modal(page, "ยืนยันการรับเงิน");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "ยืนยันการรับเงิน" }).click();
}

/**
 * Can an invoice whose source quotation is already fully billed still change
 * its status? It could not before sql/20261021_quotation_invoice_status_guard.sql
 * — the guard fired on every status change, so the whole quotation chain was
 * frozen.
 */
async function convertedInvoiceCanChangeStatus(): Promise<boolean> {
  const { client, userId } = await workspace();
  const customerId = crypto.randomUUID();
  const dealId = crypto.randomUUID();
  const quotationId = crypto.randomUUID();
  const invoiceId = crypto.randomUUID();
  try {
    await client.from("customers").insert({
      id: customerId,
      user_id: userId,
      name: `Journey Probe ${stamp}`,
      is_active: true,
    });
    await client.from("deals").insert({
      id: dealId,
      user_id: userId,
      customer_id: customerId,
      title: "Journey Probe",
      is_active: true,
    });
    await client.from("documents").insert({
      id: quotationId,
      user_id: userId,
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "quotation",
      doc_number: `QT-PROBE-${stamp}`,
      status: "sent",
      issue_date: today,
      subtotal: 100,
      total_amount: 100,
    });
    await client.from("documents").insert({
      id: invoiceId,
      user_id: userId,
      deal_id: dealId,
      customer_id: customerId,
      doc_type: "invoice",
      doc_number: `INV-PROBE-${stamp}`,
      status: "sent",
      issue_date: today,
      subtotal: 100,
      total_amount: 100,
      converted_from_id: quotationId,
    });
    // The quotation is fully billed now — the invoice still has to move on.
    await client.from("documents").update({ status: "converted" }).eq("id", quotationId);
    const { error } = await client
      .from("documents")
      .update({ status: "in_billing" })
      .eq("id", invoiceId);
    return !error;
  } finally {
    await client.from("documents").delete().eq("id", invoiceId);
    await client.from("documents").delete().eq("id", quotationId);
    await client.from("deals").delete().eq("id", dealId);
    await client.from("customers").delete().eq("id", customerId);
  }
}

// ---------------------------------------------------------------------------
// 1. The flow — delivery note → invoice → billing note → receipt → paid
// ---------------------------------------------------------------------------
test.describe.serial("deal flow journey · delivery note → invoice → paid", () => {
  const customerName = `Journey DN Cust ${stamp}`;
  let customerId: string;
  let dealId: string;
  let invoiceId: string;
  let billingNoteId: string;
  let receiptId: string;
  const dnIds: string[] = [];

  test.beforeAll(async () => {
    const customer = await insertCustomer(customerName);
    customerId = customer.id;
    const deal = await insertDeal(customer.id, "Journey DN Deal");
    dealId = deal.id;

    const quotation = await insertDocument({
      id: crypto.randomUUID(),
      deal_id: dealId,
      customer_id: customer.id,
      doc_type: "quotation",
      doc_number: `QT-JOURNEY-${stamp}`,
      status: "sent",
      issue_date: today,
      subtotal: 1000,
      total_amount: 1000,
    });
    const [quoteLine] = await insertLineItems([
      {
        document_id: quotation.id,
        item_name: "Journey สินค้า",
        item_type: "product",
        unit: "ชิ้น",
        unit_price: 100,
        quantity: 10,
        base_quantity: 10,
        line_total: 1000,
        sort_order: 0,
      },
    ]);

    for (let i = 0; i < 2; i++) {
      const dn = await insertDocument({
        id: crypto.randomUUID(),
        deal_id: dealId,
        customer_id: customer.id,
        doc_type: "delivery_note",
        doc_number: `DN-JOURNEY-${stamp}-${i}`,
        status: "sent",
        issue_date: today,
        subtotal: 500,
        total_amount: 500,
      });
      dnIds.push(dn.id);
      await insertLineItems([
        {
          document_id: dn.id,
          item_name: "Journey สินค้า",
          item_type: "product",
          unit: "ชิ้น",
          unit_price: 100,
          quantity: 5,
          base_quantity: 5,
          line_total: 500,
          sort_order: 0,
          source_document_id: quotation.id,
          source_line_item_id: quoteLine.id,
        },
      ]);
    }
  });

  test("1 INVARIANT · the bulk button hands over every billable note", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);

    const button = page.getByRole("button", {
      name: /ออกใบแจ้งหนี้จากใบส่งของ 2 ใบ/,
    });
    await expect(button).toBeVisible();
    await button.click();

    await page.waitForURL(/invoice_from_delivery_notes/);
    const url = new URL(page.url());
    const handedOver = (url.searchParams.get("dnIds") || "").split(",").filter(Boolean);
    expect(handedOver.sort()).toEqual([...dnIds].sort());

    // Both notes are preselected in the form.
    await expect(page.getByText(/2 ใบส่งของ/).first()).toBeVisible();
    await expect(page.locator('input[type="checkbox"][checked]')).toHaveCount(2);
  });

  test("2 the form creates one invoice that covers both notes", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: /ออกใบแจ้งหนี้จากใบส่งของ 2 ใบ/ }).click();
    await page.waitForURL(/invoice_from_delivery_notes/);
    await expect(page.getByText(/2 ใบส่งของ/).first()).toBeVisible();

    await page.getByRole("button", { name: "สร้างใบแจ้งหนี้" }).click();
    await page.waitForURL(DEAL_UUID_RE);

    const invoices = await documentsOf(dealId, "invoice");
    expect(invoices).toHaveLength(1);
    invoiceId = invoices[0].id;
    expect(invoices[0].status).toBe("sent");
    // Both delivery notes are billed by that one invoice.
    expect(Number(invoices[0].subtotal)).toBe(1000);
    expect(Number(invoices[0].total_amount)).toBe(
      Number(invoices[0].subtotal) + Number(invoices[0].vat_amount),
    );
    expect(Number(invoices[0].net_payable)).toBe(
      Number(invoices[0].total_amount) - Number(invoices[0].wht_amount),
    );

    const links = await linksOf("invoice_delivery_notes", "invoice_id", invoiceId);
    expect(links).toHaveLength(2);
    expect(links.every((link: any) => link.released_at === null)).toBe(true);
  });

  test("3 the billing note is a draft and it locks the invoice", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: /^ออกใบวางบิล/ }).click();

    // Saving a draft keeps the form open — sync on the insert completing.
    const saved = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/documents") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "บันทึกร่าง" }).click();
    await saved;

    const notes = await documentsOf(dealId, "billing_note");
    expect(notes).toHaveLength(1);
    billingNoteId = notes[0].id;
    expect(notes[0].status).toBe("draft");

    // The link row: the note holds the invoice.
    const links = await linksOf("billing_note_invoices", "billing_note_id", billingNoteId);
    expect(links).toHaveLength(1);
    expect(links[0].invoice_id).toBe(invoiceId);

    // The invoice is now behind the note — it is locked, not sendable.
    await expect
      .poll(
        async () => {
          const [invoice] = await documentsOf(dealId, "invoice");
          return invoice.status;
        },
        { timeout: 20_000 },
      )
      .toBe("in_billing");
  });

  test("4 INVARIANT · the stranded invoice's next step is the note, not the invoice", async ({
    page,
  }) => {
    await page.goto(`/deals/${dealId}`);

    await expect(page.getByRole("button", { name: "ส่งใบวางบิลให้ลูกค้า" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ส่งใบแจ้งหนี้ให้ลูกค้า" })).toHaveCount(0);

    const [invoice] = await documentsOf(dealId, "invoice");
    expect(invoice.status).toBe("in_billing");
  });

  test("5 sending the billing note keeps the invoice behind it", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ส่งใบวางบิลให้ลูกค้า" }).click();

    const confirm = modal(page, "ยืนยันการส่งเอกสาร");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "ส่งเอกสาร" }).click();

    await expect(page.getByText("รอชำระ").first()).toBeVisible();

    const [note] = await documentsOf(dealId, "billing_note");
    expect(note.status).toBe("sent");

    // The link stays active (not released) — the invoice is still owed.
    const links = await linksOf("billing_note_invoices", "billing_note_id", billingNoteId);
    expect(links).toHaveLength(1);
    expect(links[0].released_at ?? null).toBeNull();

    const [invoice] = await documentsOf(dealId, "invoice");
    expect(invoice.status).toBe("in_billing");
  });

  test("6 the payment records a draft receipt", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await saveDraftReceipt(page);

    const receipts = await documentsOf(dealId, "receipt");
    expect(receipts).toHaveLength(1);
    receiptId = receipts[0].id;
    expect(receipts[0].status).toBe("draft");
  });

  test("7 confirming the receipt closes the deal", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await confirmReceipt(page);

    await expect(page.getByText("งานขายเสร็จสิ้น")).toBeVisible({ timeout: 30_000 });

    const [receipt] = await documentsOf(dealId, "receipt");
    expect(receipt.status).toBe("generated");

    const [note] = await documentsOf(dealId, "billing_note");
    expect(note.status).toBe("paid");

    // The receipt allocates the money to the invoice it pays.
    const links = await linksOf("receipt_invoices", "receipt_id", receiptId);
    expect(links).toHaveLength(1);
    expect(links[0].invoice_id).toBe(invoiceId);
    expect(Number(links[0].paid_amount)).toBeGreaterThan(0);

    const [invoice] = await documentsOf(dealId, "invoice");
    expect(["paid", "partially_paid"]).toContain(invoice.status);
  });

  test.afterAll(async () => {
    await cleanup(dealId, customerId).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// 2. The quotation chain — quotation → invoice → billing note → paid
// ---------------------------------------------------------------------------
test.describe.serial("deal flow journey · quotation → invoice → paid", () => {
  const customerName = `Journey Quote Cust ${stamp}`;
  let customerId: string;
  let dealId: string;
  let guardAllowsStatusChange = false;

  test.beforeAll(async () => {
    guardAllowsStatusChange = await convertedInvoiceCanChangeStatus();
    const customer = await insertCustomer(customerName);
    customerId = customer.id;
    const deal = await insertDeal(customer.id, "Journey Quote Deal");
    dealId = deal.id;
  });

  const skipIfFrozen = () =>
    test.skip(
      !guardAllowsStatusChange,
      "the database still freezes an invoice made from a quotation — apply sql/20261021_quotation_invoice_status_guard.sql",
    );

  test("1 the quotation form creates the deal and a draft quotation", async ({ page }) => {
    skipIfFrozen();

    await page.goto("/deals/new?type=quotation");
    await pickCustomer(page, customerName);
    await addLineItem(page, `Journey Item ${stamp}`, "150");
    await pickIssueDate(page);

    await page.getByRole("button", { name: "ตรวจสอบและบันทึก" }).click();
    const confirm = modal(page, "ยืนยันการบันทึก");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "บันทึก", exact: true }).click();

    await page.waitForURL(DEAL_UUID_RE);
    const createdDealId = page.url().split("/deals/")[1].split(/[?#]/)[0];
    expect(createdDealId).toBe(dealId);

    const quotations = await documentsOf(dealId, "quotation");
    expect(quotations).toHaveLength(1);
    expect(quotations[0].status).toBe("draft");
    expect(quotations[0].doc_number).toBeTruthy();
    expect(Number(quotations[0].subtotal)).toBe(150);

    // The draft is what the deal page offers next.
    await expect(page.getByRole("button", { name: "ส่งใบเสนอราคาให้ลูกค้า" })).toBeVisible();
  });

  test("2 sending the quotation flips it to sent", async ({ page }) => {
    skipIfFrozen();

    await page.goto(`/deals/${dealId}`);
    // A quotation goes out without a confirmation step (only the financial
    // documents ask before they lock).
    await page.getByRole("button", { name: "ส่งใบเสนอราคาให้ลูกค้า" }).click();
    await expect(page.getByText("รอลูกค้าตอบ")).toBeVisible();

    const [quotation] = await documentsOf(dealId, "quotation");
    expect(quotation.status).toBe("sent");
  });

  test("3 the sent quotation becomes a sent invoice", async ({ page }) => {
    skipIfFrozen();

    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ออกใบแจ้งหนี้ต่อ" }).click();
    await page.waitForURL(/\/documents\/new\?type=invoice_from_quotation/);
    await page.getByRole("button", { name: "สร้างใบแจ้งหนี้" }).click();
    // The form returns to the deal — the invoice is created and sent there.
    await page.waitForURL(DEAL_UUID_RE);
    await expect(page.getByText("รอวางบิล")).toBeVisible();

    const invoices = await documentsOf(dealId, "invoice");
    expect(invoices).toHaveLength(1);
    const [quotation] = await documentsOf(dealId, "quotation");
    expect(quotation.status).toBe("converted");
    expect(invoices[0].converted_from_id).toBe(quotation.id);
    expect(Number(invoices[0].subtotal)).toBe(Number(quotation.subtotal));
  });

  test("4 the billing note takes the converted invoice behind it", async ({ page }) => {
    skipIfFrozen();

    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: /^ออกใบวางบิล/ }).click();

    const saved = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/documents") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "บันทึกร่าง" }).click();
    await saved;

    const notes = await documentsOf(dealId, "billing_note");
    expect(notes).toHaveLength(1);
    expect(notes[0].status).toBe("draft");

    // The invoice follows the note — this is what the old guard blocked.
    await expect
      .poll(
        async () => {
          const [invoice] = await documentsOf(dealId, "invoice");
          return invoice.status;
        },
        { timeout: 20_000 },
      )
      .toBe("in_billing");
  });

  test("5 the payment closes the converted invoice", async ({ page }) => {
    skipIfFrozen();

    await page.goto(`/deals/${dealId}`);
    await page.getByRole("button", { name: "ส่งใบวางบิลให้ลูกค้า" }).click();
    const confirm = modal(page, "ยืนยันการส่งเอกสาร");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "ส่งเอกสาร" }).click();

    await saveDraftReceipt(page);
    await confirmReceipt(page);

    const [invoice] = await documentsOf(dealId, "invoice");
    expect(["paid", "partially_paid"]).toContain(invoice.status);
  });

  test.afterAll(async () => {
    await cleanup(dealId, customerId).catch(() => undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. INVARIANT · an adjustment note is issued, and the deal reads done
// ---------------------------------------------------------------------------
test.describe.serial("deal flow journey · the adjustment note is issued", () => {
  let customerId: string;
  let dealId: string;

  test.beforeAll(async () => {
    const customer = await insertCustomer(`Journey Adjust ${stamp}`);
    customerId = customer.id;
    const deal = await insertDeal(customer.id, "Journey Adjust Deal");
    dealId = deal.id;

    const invoice = await insertDocument({
      id: crypto.randomUUID(),
      deal_id: dealId,
      customer_id: customer.id,
      doc_type: "invoice",
      doc_number: `INV-JOURNEY-${stamp}`,
      status: "paid",
      issue_date: today,
      due_date: today,
      vat_registered: true,
      vat_rate: 7,
      subtotal: 1000,
      vat_amount: 70,
      total_amount: 1070,
      net_payable: 1070,
      amount_received: 1070,
    });
    await insertLineItems([
      {
        document_id: invoice.id,
        item_name: "Journey Service",
        item_type: "service",
        unit: "งวด",
        unit_price: 1000,
        quantity: 1,
        base_quantity: 1,
        line_total: 1000,
        sort_order: 0,
      },
    ]);
  });

  test("the credit note is issued, not sent — and the deal reads done", async ({ page }) => {
    await page.goto(`/deals/${dealId}`);
    await page.getByRole("tab", { name: /เอกสาร/ }).click();
    await page.getByRole("button", { name: "ออกใบลดหนี้" }).click();
    await expect(
      page.getByText(new RegExp(`Journey Adjust ${stamp} · [1-9]\\d* รายการ`)),
    ).toBeVisible();
    await page.getByRole("button", { name: "ออกใบลดหนี้" }).last().click();
    await page.waitForURL(DOC_UUID_RE);
    await expect(page.getByText("ออกแล้ว", { exact: true })).toBeVisible();

    const notes = await documentsOf(dealId, "credit_note");
    expect(notes).toHaveLength(1);
    // An adjustment note can only be issued — "sent" is not a legal status.
    expect(notes[0].status).toBe("issued");

    // The deal is finished: every document is done.
    await page.goto(`/deals/${dealId}`);
    await expect(page.getByText("งานขายเสร็จสิ้น")).toBeVisible();
  });

  test.afterAll(async () => {
    await cleanup(dealId, customerId).catch(() => undefined);
  });
});
