import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  ensureTestUser,
  signInTestUser,
  resetWorkspace,
  getTestUserId,
  client,
} from "./harness";
import {
  createCustomer,
  createDeal,
  createDocument,
  createLineItems,
  getDocumentAdmin,
  getLineItems,
  docNum,
  uid,
} from "./fixtures";

describe("invoice from quotation: partial billing + variance snapshots", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  async function setupSentQuotation() {
    const cust = await createCustomer();
    const deal = await createDeal(cust.id);
    const qt = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "quotation",
      doc_number: docNum("QT"),
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
    });
    await createLineItems([
      {
        document_id: qt.id,
        user_id: getTestUserId(),
        item_name: "Widget",
        unit: "piece",
        unit_price: 100,
        quantity: 10,
        line_total: 1000,
        sort_order: 0,
      },
    ]);
    const lines = await getLineItems(qt.id);
    return { cust, deal, qt, qtLine: lines[0] };
  }

  async function createInvoiceFromQt(opts: {
    cust: any;
    deal: any;
    qt: any;
    qtLine: any;
    quantity: number;
    unitPrice?: number;
  }) {
    const inv = await createDocument({
      id: uid(),
      deal_id: opts.deal.id,
      customer_id: opts.cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV"),
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
      show_dn_variance: false,
      converted_from_id: opts.qt.id,
    });
    const price = opts.unitPrice ?? 100;
    await createLineItems([
      {
        document_id: inv.id,
        user_id: getTestUserId(),
        item_name: "Widget",
        unit: "piece",
        unit_price: price,
        quantity: opts.quantity,
        line_total: price * opts.quantity,
        sort_order: 0,
        source_document_id: opts.qt.id,
        source_line_item_id: opts.qtLine.id,
        source_delivered_qty: 10,
        source_unit_price: 100,
      },
    ]);
    return inv;
  }

  it("partial billing keeps the quotation 'sent'; completing it converts", async () => {
    const { cust, deal, qt, qtLine } = await setupSentQuotation();

    // First invoice bills only part of the quoted quantity.
    await createInvoiceFromQt({ cust, deal, qt, qtLine, quantity: 4 });
    expect((await getDocumentAdmin(qt.id)).status).toBe("sent");

    // Second invoice bills the remaining 6 units.
    await createInvoiceFromQt({ cust, deal, qt, qtLine, quantity: 6 });

    // The form marks the quotation converted once every line is fully billed.
    await clientUpsertConverted(qt.id);
    expect((await getDocumentAdmin(qt.id)).status).toBe("converted");
  });

  it("stores variance snapshots on quotation-sourced invoice lines", async () => {
    const { cust, deal, qt, qtLine } = await setupSentQuotation();

    const inv = await createInvoiceFromQt({
      cust,
      deal,
      qt,
      qtLine,
      quantity: 8,
      unitPrice: 90, // price changed vs quoted
    });

    const invLine = (await getLineItems(inv.id))[0];
    expect(Number(invLine.source_delivered_qty)).toBe(10);
    expect(Number(invLine.source_unit_price)).toBe(100);
    expect((await getDocumentAdmin(inv.id)).show_dn_variance).toBe(false);
  });

  it("chains quotation -> delivery note -> invoice with snapshots at each hop", async () => {
    const { cust, deal, qt, qtLine } = await setupSentQuotation();

    // Delivery note created from the quotation carries quote snapshots.
    const dn = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "delivery_note",
      doc_number: docNum("DN"),
      status: "draft",
      issue_date: new Date().toISOString().slice(0, 10),
      converted_from_id: qt.id,
    });
    await createLineItems([
      {
        document_id: dn.id,
        user_id: getTestUserId(),
        item_name: "Widget",
        unit: "piece",
        unit_price: 100,
        quantity: 6, // partial delivery of the quoted 10
        base_quantity: 6,
        line_total: 600,
        sort_order: 0,
        source_document_id: qt.id,
        source_line_item_id: qtLine.id,
        source_delivered_qty: 10,
        source_unit_price: 100,
      },
    ]);
    let dnLine = (await getLineItems(dn.id))[0];
    expect(Number(dnLine.source_delivered_qty)).toBe(10);
    expect(Number(dnLine.source_unit_price)).toBe(100);

    // Send the DN, then bill it partially like InvoiceFromDeliveryNotesForm.
    await clientUpdateStatus(dn.id, "sent");
    const inv = await createDocument({
      id: uid(),
      deal_id: deal.id,
      customer_id: cust.id,
      doc_type: "invoice",
      doc_number: docNum("INV"),
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
      show_dn_variance: true,
    });
    await createLineItems([
      {
        document_id: inv.id,
        user_id: getTestUserId(),
        item_name: "Widget",
        unit: "piece",
        unit_price: 105, // adjusted at billing time
        quantity: 4,
        line_total: 420,
        sort_order: 0,
        source_document_id: dn.id,
        source_line_item_id: dnLine.id,
        source_delivered_qty: 6,
        source_unit_price: 100,
      },
    ]);

    dnLine = (await getLineItems(dn.id))[0];
    const invLine = (await getLineItems(inv.id))[0];
    // Invoice snapshots reflect the delivered DN quantities, not the original quote.
    expect(Number(invLine.source_delivered_qty)).toBe(6);
    expect(Number(invLine.source_unit_price)).toBe(100);
    expect(Number(dnLine.quantity)).toBe(6);
    expect((await getDocumentAdmin(dn.id)).status).toBe("sent"); // partial -> stays sent
    expect((await getDocumentAdmin(inv.id)).show_dn_variance).toBe(true);
  });
});

async function clientUpsertConverted(documentId: string) {
  const { error } = await client.from("documents").update({ status: "converted" }).eq("id", documentId);
  expect(error).toBeNull();
}

async function clientUpdateStatus(documentId: string, status: string) {
  const { error } = await client.from("documents").update({ status }).eq("id", documentId);
  expect(error).toBeNull();
}
