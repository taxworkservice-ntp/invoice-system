import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  ensureTestUser,
  signInTestUser,
  resetWorkspace,
  getTestUserId,
  client,
  admin,
} from "./harness";
import {
  createCustomer,
  createDeal,
  createDocument,
  createLineItems,
  docNum,
  uid,
} from "./fixtures";
import { getDocumentDetail } from "../../src/hooks/useDocuments";
import { getPrintableDocumentDataBase } from "../../src/lib/print";

// Characterization tests for the read paths that feed document detail and the
// printed/PDF output. They exist to lock current behavior before those reads are
// parallelized (see perf/parallelize-doc-reads) — the assertions describe what
// the code returns today, not what it "should" return.

const TODAY = new Date().toISOString().slice(0, 10);

function lineItem(documentId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: uid(),
    document_id: documentId,
    user_id: getTestUserId(),
    item_name: "QA Item",
    item_type: "product",
    unit: "ชิ้น",
    unit_price: 10,
    quantity: 1,
    line_total: 10,
    sort_order: 0,
    ...overrides,
  };
}

async function linkInvoiceToBn(
  bnId: string,
  invId: string,
  invoiceNumber: string,
  total = 100,
) {
  return client.from("billing_note_invoices").insert({
    id: uid(),
    billing_note_id: bnId,
    invoice_id: invId,
    user_id: getTestUserId(),
    invoice_number: invoiceNumber,
    issue_date: TODAY,
    subtotal: total,
    vat_amount: 0,
    total_amount: total,
  });
}

describe("document detail + print data characterization", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
    // Guarantee a client profile exists for the workspace owner (ensureTestUser
    // only seeds it when the auth user is first created).
    await admin.from("client_profiles").upsert(
      {
        user_id: getTestUserId(),
        company_name_th: "บริษัท เทสท์ คอมปานี จำกัด",
        vat_registered: true,
        vat_rate: 7,
      },
      { onConflict: "user_id" },
    );
  });

  beforeEach(async () => {
    await resetWorkspace();
  });

  it("getDocumentDetail orders line items by sort_order and joins the customer", async () => {
    const cust = await createCustomer("Char Customer");
    const deal = await createDeal(cust.id);
    const doc = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "quotation",
      doc_number: docNum("QT-CHAR"),
      status: "draft",
      issue_date: TODAY,
    });
    await createLineItems([
      lineItem(doc.id, { item_name: "A", sort_order: 2, line_total: 30 }),
      lineItem(doc.id, { item_name: "B", sort_order: 0, line_total: 10 }),
      lineItem(doc.id, { item_name: "C", sort_order: 1, line_total: 20 }),
    ]);

    const detail = await getDocumentDetail(doc.id);
    expect(detail.id).toBe(doc.id);
    expect((detail.customer as { name?: string } | undefined)?.name).toBe("Char Customer");
    expect(detail.line_items?.map((l) => l.item_name)).toEqual(["B", "C", "A"]);
  });

  it("invoice: invoice_delivery_notes ordering + DN-summary detection + lineDeliveryNoteMap", async () => {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const inv = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV-CHAR"),
      status: "sent",
      issue_date: TODAY,
      vat_registered: true,
      vat_rate: 7,
    });
    const dn1 = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "delivery_note",
      doc_number: docNum("DN-CHAR-1"),
      status: "sent",
      issue_date: TODAY,
    });
    const dn2 = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "delivery_note",
      doc_number: docNum("DN-CHAR-2"),
      status: "sent",
      issue_date: TODAY,
    });

    const links = await client.from("invoice_delivery_notes").insert([
      {
        id: uid(),
        invoice_id: inv.id,
        delivery_note_id: dn1.id,
        user_id: getTestUserId(),
        delivery_note_number: "DN-X1",
        issue_date: "2026-01-01",
        subtotal: 10,
        vat_amount: 0,
        total_amount: 10,
      },
      {
        id: uid(),
        invoice_id: inv.id,
        delivery_note_id: dn2.id,
        user_id: getTestUserId(),
        delivery_note_number: "DN-X2",
        issue_date: "2026-02-01",
        subtotal: 20,
        vat_amount: 0,
        total_amount: 20,
      },
    ]);
    expect(links.error).toBeNull();

    await createLineItems([
      lineItem(inv.id, { item_name: "L1", sort_order: 0, source_document_id: dn1.id }),
      lineItem(inv.id, { item_name: "L2", sort_order: 1, source_document_id: dn2.id }),
    ]);

    const detail = await getDocumentDetail(inv.id);
    expect(detail.invoice_delivery_notes?.map((d) => d.delivery_note_number)).toEqual([
      "DN-X1",
      "DN-X2",
    ]);

    const printable = await getPrintableDocumentDataBase(inv.id);
    expect(printable.invoiceDeliveryNotes.map((d) => d.delivery_note_number)).toEqual([
      "DN-X1",
      "DN-X2",
    ]);
    // Two DN-sourced summary rows -> recognized as a DN-summary invoice.
    expect(printable.isDeliveryNoteSummaryInvoice).toBe(true);
    expect(printable.showInlineDeliveryNotes).toBe(false);
    expect(
      Object.values(printable.lineDeliveryNoteMap)
        .map((ref) => ref.number)
        .sort(),
    ).toEqual(["DN-X1", "DN-X2"]);
  });

  it("billing note: billing_invoices + items sourced from linked invoices + invoiceNumberMap", async () => {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const inv1 = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV-BN-1"),
      status: "sent",
      issue_date: TODAY,
      vat_registered: true,
      vat_rate: 7,
    });
    const inv2 = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV-BN-2"),
      status: "sent",
      issue_date: TODAY,
      vat_registered: true,
      vat_rate: 7,
    });
    await createLineItems([
      lineItem(inv1.id, { item_name: "I1-a", sort_order: 0, line_total: 100 }),
      lineItem(inv1.id, { item_name: "I1-b", sort_order: 1, line_total: 50 }),
      lineItem(inv2.id, { item_name: "I2-a", sort_order: 0, line_total: 200 }),
    ]);
    const bn = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "billing_note",
      doc_number: docNum("BN-CHAR"),
      status: "sent",
      issue_date: TODAY,
      vat_registered: true,
      vat_rate: 7,
      subtotal: 350,
      vat_amount: 24.5,
      total_amount: 374.5,
      net_payable: 374.5,
    });
    expect((await linkInvoiceToBn(bn.id, inv1.id, inv1.doc_number!, 150)).error).toBeNull();
    expect((await linkInvoiceToBn(bn.id, inv2.id, inv2.doc_number!, 200)).error).toBeNull();

    const detail = await getDocumentDetail(bn.id);
    expect(
      (detail.billing_invoices || []).map((b) => b.invoice_number).sort(),
    ).toEqual([inv1.doc_number, inv2.doc_number].sort());

    const printable = await getPrintableDocumentDataBase(bn.id);
    expect(printable.billingNoteInvoices.length).toBe(2);
    expect(printable.lineItems.map((l) => l.item_name).sort()).toEqual([
      "I1-a",
      "I1-b",
      "I2-a",
    ]);
    expect(Object.values(printable.invoiceNumberMap).sort()).toEqual(
      [inv1.doc_number, inv2.doc_number].sort(),
    );
    expect(printable.referenceDoc).toBeUndefined();
  });

  it("receipt paid via billing note: referenceDoc + outstanding math", async () => {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const inv = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV-RCP"),
      status: "sent",
      issue_date: TODAY,
      vat_registered: true,
      vat_rate: 7,
    });
    await createLineItems([
      lineItem(inv.id, { item_name: "R1", sort_order: 0, line_total: 107 }),
    ]);
    const bn = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "billing_note",
      doc_number: docNum("BN-RCP"),
      status: "sent",
      issue_date: TODAY,
      vat_registered: true,
      vat_rate: 7,
      subtotal: 100,
      vat_amount: 7,
      total_amount: 107,
      net_payable: 107,
    });
    expect((await linkInvoiceToBn(bn.id, inv.id, inv.doc_number!, 107)).error).toBeNull();

    // Partial payment against the billing note.
    const receipt = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "receipt",
      doc_number: docNum("RC-CHAR"),
      status: "draft",
      converted_from_id: bn.id,
      issue_date: TODAY,
      vat_registered: true,
      vat_rate: 7,
      subtotal: 50,
      vat_amount: 0,
      total_amount: 50,
      net_payable: 50,
      amount_received: 50,
    });

    const printable = await getPrintableDocumentDataBase(receipt.id);
    expect(printable.receiptPaidViaBillingNote).toBe(true);
    expect(printable.referenceDoc?.id).toBe(bn.id);
    expect(printable.receiptInvoices.length).toBe(1);
    expect(printable.receiptInvoices[0].invoice_id).toBe(bn.id);
    // Outstanding is measured after this receipt (it counts itself as a payment).
    expect(printable.receiptCumulativePaid).toBe(50);
    expect(printable.receiptPaymentNumber).toBe(1);
    expect(printable.receiptOutstanding).toBe(57);
  });

  it("attaches the bank account and client profile to printable data", async () => {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const bank = await client
      .from("bank_accounts")
      .insert({
        id: uid(),
        user_id: getTestUserId(),
        bank_name: "QA Bank",
        account_number: "1234567890",
        is_primary: false,
        is_active: true,
        sort_order: 0,
      })
      .select()
      .single();
    expect(bank.error).toBeNull();

    const doc = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "quotation",
      doc_number: docNum("QT-BANK"),
      status: "draft",
      issue_date: TODAY,
      bank_account_id: bank.data!.id,
    });

    const printable = await getPrintableDocumentDataBase(doc.id);
    expect(printable.bankAccount?.id).toBe(bank.data!.id);
    expect(printable.clientProfile.user_id).toBe(getTestUserId());
    expect(printable.clientProfile.company_name_th).toBeTruthy();
  });
});
