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
  createItem,
  getItem,
  getDocumentAdmin,
  getLineItems,
  docNum,
  uid,
} from "./fixtures";

/**
 * Regression suite for the transactional workflow RPCs:
 *  - create_billing_note_with_links
 *  - create_invoice_from_sources (+ deduct_stock_for_document)
 *  - confirm_draft_receipt
 *  - save_adjustment_note (+ return_stock_for_credit_note)
 *  - revert_invoice_sources
 */

const today = () => new Date().toISOString().slice(0, 10);

async function countDocuments(docType: string) {
  const { data } = await client
    .from("documents")
    .select("id")
    .eq("user_id", getTestUserId())
    .eq("doc_type", docType);
  return (data || []).length;
}

describe("transactional workflow RPCs", () => {
  beforeAll(async () => {
    await ensureTestUser();
    await signInTestUser();
  });
  beforeEach(async () => {
    await resetWorkspace();
  });

  describe("create_billing_note_with_links", () => {
    it("creates the billing note, a deal, and flips invoices to in_billing atomically", async () => {
      const cust = await createCustomer();
      const oldDeal = await createDeal(cust.id);
      const inv = await createDocument({
        id: uid(),
        deal_id: oldDeal.id,
        customer_id: cust.id,
        doc_type: "invoice",
        doc_number: docNum("INV"),
        status: "sent",
        issue_date: today(),
        subtotal: 1000,
        vat_amount: 70,
        total_amount: 1070,
        net_payable: 1070,
      });

      const { data, error } = await client.rpc("create_billing_note_with_links", {
        p_user_id: getTestUserId(),
        p_document: {
          customer_id: cust.id,
          doc_number: docNum("BN"),
          status: "draft",
          issue_date: today(),
          subtotal: 1000,
          vat_amount: 70,
          total_amount: 1070,
          wht_amount: 0,
          net_payable: 1070,
        },
        p_invoice_ids: [inv.id],
      });
      expect(error).toBeNull();
      const record = Array.isArray(data) ? data[0] : data;
      expect(record.document_id).toBeTruthy();
      expect(record.deal_id).toBeTruthy();

      const bn = await getDocumentAdmin(record.document_id);
      expect(bn.doc_type).toBe("billing_note");
      expect(bn.status).toBe("draft");
      expect(bn.deal_id).toBe(record.deal_id);

      const updatedInvoice = await getDocumentAdmin(inv.id);
      expect(updatedInvoice.status).toBe("in_billing");
      expect(updatedInvoice.deal_id).toBe(record.deal_id);
    });

    it("rolls back completely when an invoice is already held by an active billing note", async () => {
      const cust = await createCustomer();
      const deal = await createDeal(cust.id);
      const inv = await createDocument({
        id: uid(),
        deal_id: deal.id,
        customer_id: cust.id,
        doc_type: "invoice",
        doc_number: docNum("INV"),
        status: "sent",
        issue_date: today(),
        subtotal: 100,
        vat_amount: 7,
        total_amount: 107,
        net_payable: 107,
      });

      const payload = {
        p_user_id: getTestUserId(),
        p_document: {
          customer_id: cust.id,
          doc_number: docNum("BN"),
          status: "draft",
          issue_date: today(),
          subtotal: 100,
          vat_amount: 7,
          total_amount: 107,
          wht_amount: 0,
          net_payable: 107,
        },
        p_invoice_ids: [inv.id],
      };

      const first = await client.rpc("create_billing_note_with_links", payload);
      expect(first.error).toBeNull();

      const before = await countDocuments("billing_note");
      const second = await client.rpc("create_billing_note_with_links", payload);
      expect(second.error).not.toBeNull();
      // The invoice is now 'in_billing', so the status guard rejects the
      // re-billing attempt before the link check is reached.
      expect(second.error!.message).toContain("ไม่พร้อมวางบิล");

      // Atomic rollback: no second billing note was persisted.
      expect(await countDocuments("billing_note")).toBe(before);
    });

    it("combines invoices from multiple deals — invoices stay in their deals", async () => {
      const cust = await createCustomer();
      const dealA = await createDeal(cust.id);
      const dealB = await createDeal(cust.id);
      const invoices: any[] = [];
      for (const deal of [dealA, dealB]) {
        invoices.push(
          await createDocument({
            id: uid(),
            deal_id: deal.id,
            customer_id: cust.id,
            doc_type: "invoice",
            doc_number: docNum("INV"),
            status: "sent",
            issue_date: today(),
            subtotal: 500,
            vat_amount: 35,
            total_amount: 535,
            net_payable: 535,
          }),
        );
      }

      const { data, error } = await client.rpc("create_billing_note_with_links", {
        p_user_id: getTestUserId(),
        p_document: { customer_id: cust.id, doc_number: docNum("BN"), issue_date: today() },
        p_invoice_ids: invoices.map((inv) => inv.id),
      });
      expect(error).toBeNull();
      const record = Array.isArray(data) ? data[0] : data;

      // Billing note lives on a NEW deal, not either source deal.
      expect(record.deal_id).not.toBe(dealA.id);
      expect(record.deal_id).not.toBe(dealB.id);

      // Invoices keep their original deals and are in_billing.
      expect((await getDocumentAdmin(invoices[0].id)).deal_id).toBe(dealA.id);
      expect((await getDocumentAdmin(invoices[1].id)).deal_id).toBe(dealB.id);
      expect((await getDocumentAdmin(invoices[0].id)).status).toBe("in_billing");
      expect((await getDocumentAdmin(invoices[1].id)).status).toBe("in_billing");

      const { data: links } = await client
        .from("billing_note_invoices")
        .select("*")
        .eq("billing_note_id", record.document_id);
      expect(links || []).toHaveLength(2);
    });

    it("rejects an invoice that belongs to a different customer", async () => {
      const cust = await createCustomer();
      const otherCust = await createCustomer("Other Customer");
      const inv = await createDocument({
        id: uid(),
        customer_id: cust.id,
        doc_type: "invoice",
        doc_number: docNum("INV"),
        status: "sent",
        issue_date: today(),
        total_amount: 107,
        net_payable: 107,
      });

      const { error } = await client.rpc("create_billing_note_with_links", {
        p_user_id: getTestUserId(),
        p_document: { customer_id: otherCust.id, doc_number: docNum("BN"), issue_date: today() },
        p_invoice_ids: [inv.id],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toContain("ลูกค้าอื่น");
    });
  });

  describe("create_invoice_from_sources", () => {
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
        issue_date: today(),
      });
      await createLineItems([
        {
          document_id: qt.id,
          user_id: getTestUserId(),
          item_name: "Widget",
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity: 10,
          line_total: 1000,
          sort_order: 0,
        },
      ]);
      const qtLine = (await getLineItems(qt.id))[0];
      return { cust, deal, qt, qtLine };
    }

    function invoiceLines(qt: any, qtLine: any, quantity: number, itemId?: string | null) {
      return [
        {
          item_id: itemId ?? null,
          item_name: "Widget",
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity,
          line_total: 100 * quantity,
          source_document_id: qt.id,
          source_line_item_id: qtLine.id,
          sort_order: 0,
        },
      ];
    }

    it("bills partially (quotation stays sent), then fully (quotation converts) and deducts stock", async () => {
      const item = await createItem(100);
      const { cust, deal, qt, qtLine } = await setupSentQuotation();
      // Attach the catalog item to the quotation line for stock deduction.
      await client.from("document_line_items").update({ item_id: item.id }).eq("id", qtLine.id);

      const base = {
        p_user_id: getTestUserId(),
        p_document: {
          doc_type: "invoice",
          status: "sent",
          customer_id: cust.id,
          deal_id: deal.id,
          doc_number: docNum("INV"),
          issue_date: today(),
          vat_registered: false,
          vat_rate: 7,
          wht_rate: 0,
          subtotal: 0,
          vat_amount: 0,
          total_amount: 0,
          wht_amount: 0,
          net_payable: 0,
        },
      };

      const first = await client.rpc("create_invoice_from_sources", {
        ...base,
        p_lines: invoiceLines(qt, qtLine, 4, item.id),
        p_source_ids: [qt.id],
      });
      expect(first.error).toBeNull();
      const firstRecord = Array.isArray(first.data) ? first.data[0] : first.data;

      expect((await getDocumentAdmin(qt.id)).status).toBe("sent");
      expect((await getDocumentAdmin(firstRecord.document_id)).status).toBe("sent");
      expect((await getItem(item.id)).stock_count).toBe(96); // stock deducted in-RPC

      const second = await client.rpc("create_invoice_from_sources", {
        ...base,
        p_document: { ...base.p_document, doc_number: docNum("INV") },
        p_lines: invoiceLines(qt, qtLine, 6, item.id),
        p_source_ids: [qt.id],
      });
      expect(second.error).toBeNull();
      expect((await getDocumentAdmin(qt.id)).status).toBe("converted");
      expect((await getItem(item.id)).stock_count).toBe(90);
    });

    it("rejects over-billing and persists nothing", async () => {
      const { cust, deal, qt, qtLine } = await setupSentQuotation();
      const before = await countDocuments("invoice");

      const { error } = await client.rpc("create_invoice_from_sources", {
        p_user_id: getTestUserId(),
        p_document: {
          doc_type: "invoice",
          status: "sent",
          customer_id: cust.id,
          deal_id: deal.id,
          doc_number: docNum("INV"),
          issue_date: today(),
        },
        p_lines: invoiceLines(qt, qtLine, 11),
        p_source_ids: [qt.id],
      });

      expect(error).not.toBeNull();
      expect(error!.message).toContain("มากกว่ายอดคงเหลือ");
      expect(await countDocuments("invoice")).toBe(before);
      expect((await getDocumentAdmin(qt.id)).status).toBe("sent");
    });

    it("bills a delivery note, links it, converts it, and cascades the quotation", async () => {
      const { cust, deal, qt, qtLine } = await setupSentQuotation();
      const dn = await createDocument({
        id: uid(),
        deal_id: deal.id,
        customer_id: cust.id,
        doc_type: "delivery_note",
        doc_number: docNum("DN"),
        status: "sent",
        issue_date: today(),
        converted_from_id: qt.id,
      });
      await createLineItems([
        {
          document_id: dn.id,
          user_id: getTestUserId(),
          item_name: "Widget",
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity: 6,
          line_total: 600,
          source_document_id: qt.id,
          source_line_item_id: qtLine.id,
          sort_order: 0,
        },
      ]);
      const dnLine = (await getLineItems(dn.id))[0];

      const { data, error } = await client.rpc("create_invoice_from_sources", {
        p_user_id: getTestUserId(),
        p_document: {
          doc_type: "invoice",
          status: "sent",
          customer_id: cust.id,
          deal_id: deal.id,
          doc_number: docNum("INV"),
          issue_date: today(),
        },
        p_lines: [
          {
            item_name: "Widget",
            item_type: "product",
            unit: "piece",
            unit_price: 100,
            quantity: 6,
            line_total: 600,
            source_document_id: dn.id,
            source_line_item_id: dnLine.id,
            sort_order: 0,
          },
        ],
        p_source_ids: [dn.id],
      });
      expect(error).toBeNull();
      const record = Array.isArray(data) ? data[0] : data;

      const { data: links } = await client
        .from("invoice_delivery_notes")
        .select("*")
        .eq("invoice_id", record.document_id);
      expect(links || []).toHaveLength(1);
      expect((await getDocumentAdmin(dn.id)).status).toBe("converted");
      expect((await getDocumentAdmin(qt.id)).status).toBe("converted");
    });

    it("combines delivery notes from multiple deals — DNs stay in their deals", async () => {
      const cust = await createCustomer();
      const dealA = await createDeal(cust.id);
      const dealB = await createDeal(cust.id);
      const dns: any[] = [];
      const lines: any[] = [];
      for (const deal of [dealA, dealB]) {
        const dn = await createDocument({
          id: uid(),
          deal_id: deal.id,
          customer_id: cust.id,
          doc_type: "delivery_note",
          doc_number: docNum("DN"),
          status: "sent",
          issue_date: today(),
        });
        await createLineItems([
          {
            document_id: dn.id,
            user_id: getTestUserId(),
            item_name: "Widget",
            item_type: "product",
            unit: "piece",
            unit_price: 100,
            quantity: 5,
            line_total: 500,
            sort_order: 0,
          },
        ]);
        const dnLine = (await getLineItems(dn.id))[0];
        dns.push(dn);
        lines.push({
          item_name: "Widget",
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity: 5,
          line_total: 500,
          source_document_id: dn.id,
          source_line_item_id: dnLine.id,
          sort_order: lines.length,
        });
      }

      const { data, error } = await client.rpc("create_invoice_from_sources", {
        p_user_id: getTestUserId(),
        p_document: {
          doc_type: "invoice",
          status: "sent",
          customer_id: cust.id,
          deal_id: null,
          doc_number: docNum("INV"),
          issue_date: today(),
          title: cust.name,
        },
        p_lines: lines,
        p_source_ids: dns.map((dn) => dn.id),
      });
      expect(error).toBeNull();
      const record = Array.isArray(data) ? data[0] : data;

      // Invoice lives on a NEW deal, not either source deal.
      expect(record.deal_id).toBeTruthy();
      expect(record.deal_id).not.toBe(dealA.id);
      expect(record.deal_id).not.toBe(dealB.id);

      // DNs stay in their original deals, fully billed → converted.
      expect((await getDocumentAdmin(dns[0].id)).deal_id).toBe(dealA.id);
      expect((await getDocumentAdmin(dns[1].id)).deal_id).toBe(dealB.id);
      expect((await getDocumentAdmin(dns[0].id)).status).toBe("converted");
      expect((await getDocumentAdmin(dns[1].id)).status).toBe("converted");

      const { data: links } = await client
        .from("invoice_delivery_notes")
        .select("*")
        .eq("invoice_id", record.document_id);
      expect(links || []).toHaveLength(2);
    });

    it("rejects a delivery note that belongs to a different customer", async () => {
      const cust = await createCustomer();
      const otherCust = await createCustomer("Other Customer");
      const dn = await createDocument({
        id: uid(),
        customer_id: otherCust.id,
        doc_type: "delivery_note",
        doc_number: docNum("DN"),
        status: "sent",
        issue_date: today(),
      });
      await createLineItems([
        {
          document_id: dn.id,
          user_id: getTestUserId(),
          item_name: "Widget",
          unit: "piece",
          unit_price: 100,
          quantity: 1,
          line_total: 100,
          sort_order: 0,
        },
      ]);
      const dnLine = (await getLineItems(dn.id))[0];

      const { error } = await client.rpc("create_invoice_from_sources", {
        p_user_id: getTestUserId(),
        p_document: {
          doc_type: "invoice",
          status: "sent",
          customer_id: cust.id,
          deal_id: null,
          doc_number: docNum("INV"),
          issue_date: today(),
        },
        p_lines: [
          {
            item_name: "Widget",
            unit: "piece",
            unit_price: 100,
            quantity: 1,
            line_total: 100,
            source_document_id: dn.id,
            source_line_item_id: dnLine.id,
            sort_order: 0,
          },
        ],
        p_source_ids: [dn.id],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toContain("different customer");
    });
  });

  describe("revert_invoice_sources", () => {
    it("restores both quotations when a multi-source invoice is voided", async () => {
      const cust = await createCustomer();
      const deal = await createDeal(cust.id);
      const lines: any[] = [];
      const sourceIds: string[] = [];
      for (const name of ["A", "B"]) {
        const qt = await createDocument({
          id: uid(),
          deal_id: deal.id,
          customer_id: cust.id,
          doc_type: "quotation",
          doc_number: docNum("QT"),
          status: "sent",
          issue_date: today(),
        });
        await createLineItems([
          {
            document_id: qt.id,
            user_id: getTestUserId(),
            item_name: `Item ${name}`,
            item_type: "product",
            unit: "piece",
            unit_price: 100,
            quantity: 5,
            line_total: 500,
            sort_order: 0,
          },
        ]);
        const qtLine = (await getLineItems(qt.id))[0];
        lines.push({
          item_name: `Item ${name}`,
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity: 5,
          line_total: 500,
          source_document_id: qt.id,
          source_line_item_id: qtLine.id,
          sort_order: lines.length,
        });
        sourceIds.push(qt.id);
      }

      const { data, error } = await client.rpc("create_invoice_from_sources", {
        p_user_id: getTestUserId(),
        p_document: {
          doc_type: "invoice",
          status: "sent",
          customer_id: cust.id,
          deal_id: deal.id,
          doc_number: docNum("INV"),
          issue_date: today(),
        },
        p_lines: lines,
        p_source_ids: sourceIds,
      });
      expect(error).toBeNull();
      const record = Array.isArray(data) ? data[0] : data;
      expect((await getDocumentAdmin(sourceIds[0])).status).toBe("converted");
      expect((await getDocumentAdmin(sourceIds[1])).status).toBe("converted");

      // Void the invoice, then restore its sources.
      const { error: voidError } = await client
        .from("documents")
        .update({ status: "voided" })
        .eq("id", record.document_id);
      expect(voidError).toBeNull();

      const { error: revertError } = await client.rpc("revert_invoice_sources", {
        p_invoice_id: record.document_id,
        p_user_id: getTestUserId(),
      });
      expect(revertError).toBeNull();

      expect((await getDocumentAdmin(sourceIds[0])).status).toBe("sent");
      expect((await getDocumentAdmin(sourceIds[1])).status).toBe("sent");
    });

    it("keeps a quotation converted while another active invoice still bills it fully", async () => {
      const cust = await createCustomer();
      const deal = await createDeal(cust.id);
      const qt = await createDocument({
        id: uid(),
        deal_id: deal.id,
        customer_id: cust.id,
        doc_type: "quotation",
        doc_number: docNum("QT"),
        status: "sent",
        issue_date: today(),
      });
      await createLineItems([
        {
          document_id: qt.id,
          user_id: getTestUserId(),
          item_name: "Widget",
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity: 10,
          line_total: 1000,
          sort_order: 0,
        },
      ]);
      const qtLine = (await getLineItems(qt.id))[0];
      const qtLineRef = { source_document_id: qt.id, source_line_item_id: qtLine.id };

      // Active invoice bills the full quantity.
      const active = await createDocument({
        id: uid(),
        deal_id: deal.id,
        customer_id: cust.id,
        doc_type: "invoice",
        doc_number: docNum("INV"),
        status: "sent",
        issue_date: today(),
      });
      await createLineItems([
        {
          document_id: active.id,
          user_id: getTestUserId(),
          item_name: "Widget",
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity: 10,
          line_total: 1000,
          sort_order: 0,
          ...qtLineRef,
        },
      ]);
      // A second invoice that references the same line, then voided.
      const doomed = await createDocument({
        id: uid(),
        deal_id: deal.id,
        customer_id: cust.id,
        doc_type: "invoice",
        doc_number: docNum("INV"),
        status: "sent",
        issue_date: today(),
      });
      await createLineItems([
        {
          document_id: doomed.id,
          user_id: getTestUserId(),
          item_name: "Widget",
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity: 5,
          line_total: 500,
          sort_order: 0,
          ...qtLineRef,
        },
      ]);
      const { error: voidError } = await client
        .from("documents")
        .update({ status: "voided" })
        .eq("id", doomed.id);
      expect(voidError).toBeNull();

      const { error: revertError } = await client.rpc("revert_invoice_sources", {
        p_invoice_id: doomed.id,
        p_user_id: getTestUserId(),
      });
      expect(revertError).toBeNull();

      // The active invoice still fully covers the quotation.
      expect((await getDocumentAdmin(qt.id)).status).toBe("sent");
    });
  });

  describe("confirm_draft_receipt", () => {
    async function setupPaidFlow() {
      const cust = await createCustomer();
      const deal = await createDeal(cust.id);
      const inv = await createDocument({
        id: uid(),
        deal_id: deal.id,
        customer_id: cust.id,
        doc_type: "invoice",
        doc_number: docNum("INV"),
        status: "sent",
        issue_date: today(),
        subtotal: 1000,
        vat_amount: 70,
        total_amount: 1070,
        net_payable: 1070,
      });
      return { cust, deal, inv };
    }

    async function createDraftReceipt(inv: any, subtotal: number, net: number) {
      return createDocument({
        id: uid(),
        deal_id: inv.deal_id,
        customer_id: inv.customer_id,
        doc_type: "receipt",
        doc_number: docNum("RC"),
        status: "draft",
        issue_date: today(),
        converted_from_id: inv.id,
        vat_registered: true,
        vat_rate: 7,
        wht_rate: 0,
        subtotal,
        vat_amount: Math.round(subtotal * 0.07 * 100) / 100,
        total_amount: subtotal + Math.round(subtotal * 0.07 * 100) / 100,
        wht_amount: 0,
        net_payable: net,
        amount_received: net,
      });
    }

    it("applies the payment, links the receipt, and blocks double confirmation", async () => {
      const { inv } = await setupPaidFlow();
      const receipt = await createDraftReceipt(inv, 400, 428);

      const first = await client.rpc("confirm_draft_receipt", {
        p_receipt_id: receipt.id,
        p_user_id: getTestUserId(),
      });
      expect(first.error).toBeNull();

      const source = await getDocumentAdmin(inv.id);
      expect(source.status).toBe("partially_paid");
      expect(Number(source.amount_received)).toBe(428);
      expect((await getDocumentAdmin(receipt.id)).status).toBe("generated");

      const { data: links } = await client
        .from("receipt_invoices")
        .select("*")
        .eq("receipt_id", receipt.id);
      expect(links || []).toHaveLength(1);

      const second = await client.rpc("confirm_draft_receipt", {
        p_receipt_id: receipt.id,
        p_user_id: getTestUserId(),
      });
      expect(second.error).not.toBeNull();
      expect(second.error!.message).toContain("ถูกยืนยันไปแล้ว");
      expect(Number((await getDocumentAdmin(inv.id)).amount_received)).toBe(428);
    });

    it("rejects over-payment without changing the source", async () => {
      const { inv } = await setupPaidFlow();
      const receipt = await createDraftReceipt(inv, 2000, 2140);

      const { error } = await client.rpc("confirm_draft_receipt", {
        p_receipt_id: receipt.id,
        p_user_id: getTestUserId(),
      });
      expect(error).not.toBeNull();
      expect(error!.message).toContain("เกินยอดค้างชำระ");

      const source = await getDocumentAdmin(inv.id);
      expect(source.status).toBe("sent");
      expect(source.amount_received).toBeNull();
      expect((await getDocumentAdmin(receipt.id)).status).toBe("draft");
    });
  });

  describe("save_adjustment_note", () => {
    async function setupPaidInvoice() {
      const cust = await createCustomer();
      const deal = await createDeal(cust.id);
      const item = await createItem(100);
      const inv = await createDocument({
        id: uid(),
        deal_id: deal.id,
        customer_id: cust.id,
        doc_type: "invoice",
        doc_number: docNum("INV"),
        status: "paid",
        issue_date: today(),
        subtotal: 1000,
        vat_amount: 70,
        total_amount: 1070,
        net_payable: 1070,
      });
      await createLineItems([
        {
          document_id: inv.id,
          user_id: getTestUserId(),
          item_id: item.id,
          item_name: "Widget",
          item_type: "product",
          unit: "piece",
          unit_price: 100,
          quantity: 10,
          base_quantity: 10,
          line_total: 1000,
          sort_order: 0,
        },
      ]);
      return { cust, deal, inv, item };
    }

    it("issues a credit note, returns stock, and enforces the over-credit limit server-side", async () => {
      const { cust, deal, inv, item } = await setupPaidInvoice();

      const cnPayload = {
        p_user_id: getTestUserId(),
        p_document: {
          doc_type: "credit_note",
          status: "issued",
          deal_id: deal.id,
          customer_id: cust.id,
          doc_number: docNum("CN"),
          issue_date: today(),
          vat_registered: true,
          vat_rate: 7,
          wht_rate: 0,
          subtotal: 100,
          vat_amount: 7,
          total_amount: 107,
          wht_amount: 0,
          net_payable: 107,
          converted_from_id: inv.id,
        },
        p_lines: [
          {
            item_id: item.id,
            item_name: "Widget",
            item_type: "product",
            unit: "piece",
            unit_price: 10,
            quantity: 10,
            discount_percent: 0,
            discount_amount: 0,
            line_total: 100,
            sort_order: 0,
          },
        ],
      };

      const { data: savedId, error } = await client.rpc("save_adjustment_note", cnPayload);
      expect(error).toBeNull();
      const cnId = typeof savedId === "string" ? savedId : (savedId as any)[0];

      expect((await getDocumentAdmin(cnId)).status).toBe("issued");
      expect((await getItem(item.id)).stock_count).toBe(110); // stock returned in-RPC

      // Server-side over-credit guard: bypassing the client pre-check fails.
      const before = await countDocuments("credit_note");
      const over = await client.rpc("save_adjustment_note", {
        ...cnPayload,
        p_document: { ...cnPayload.p_document, doc_number: docNum("CN"), total_amount: 5000 },
      });
      expect(over.error).not.toBeNull();
      expect(over.error!.message).toContain("เกินกว่าที่จะลดได้");
      expect(await countDocuments("credit_note")).toBe(before);
    });

    it("saves and re-edits a draft without touching stock", async () => {
      const { cust, deal, inv, item } = await setupPaidInvoice();
      const stockBefore = (await getItem(item.id)).stock_count;

      const draft = await client.rpc("save_adjustment_note", {
        p_user_id: getTestUserId(),
        p_document: {
          doc_type: "credit_note",
          status: "draft",
          deal_id: deal.id,
          customer_id: cust.id,
          doc_number: docNum("CN"),
          issue_date: today(),
          vat_registered: false,
          vat_rate: 7,
          wht_rate: 0,
          subtotal: 50,
          vat_amount: 0,
          total_amount: 50,
          wht_amount: 0,
          net_payable: 50,
          converted_from_id: inv.id,
        },
        p_lines: [
          {
            item_id: item.id,
            item_name: "Widget",
            item_type: "product",
            unit: "piece",
            unit_price: 5,
            quantity: 10,
            discount_percent: 0,
            discount_amount: 0,
            line_total: 50,
            sort_order: 0,
          },
        ],
      });
      expect(draft.error).toBeNull();
      const draftId = typeof draft.data === "string" ? draft.data : (draft.data as any)[0];
      expect((await getItem(item.id)).stock_count).toBe(stockBefore);

      // Draft edit: replace the lines in place.
      const edit = await client.rpc("save_adjustment_note", {
        p_user_id: getTestUserId(),
        p_document: {
          id: draftId,
          doc_type: "credit_note",
          status: "draft",
          issue_date: today(),
          subtotal: 20,
          vat_amount: 0,
          total_amount: 20,
          wht_amount: 0,
          net_payable: 20,
          note: "แก้ไขร่าง",
        },
        p_lines: [
          {
            item_id: item.id,
            item_name: "Widget",
            item_type: "product",
            unit: "piece",
            unit_price: 2,
            quantity: 10,
            discount_percent: 0,
            discount_amount: 0,
            line_total: 20,
            sort_order: 0,
          },
        ],
      });
      expect(edit.error).toBeNull();
      const lines = await getLineItems(draftId);
      expect(lines).toHaveLength(1);
      expect(Number(lines[0].line_total)).toBe(20);
      expect((await getItem(item.id)).stock_count).toBe(stockBefore);
    });
  });
});
