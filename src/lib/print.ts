import type {
  BankAccount,
  BillingNoteInvoice,
  ClientProfile,
  Customer,
  Document,
  DocumentLineItem,
  InvoiceDeliveryNote,
  ReceiptInvoice,
} from "../types";
import { getDocumentDetail } from "../hooks/useDocuments";
import { supabase } from "./supabase";

export interface PrintAppendixGroup {
  dnNumber: string;
  issueDate: string | null;
  items: Array<{
    id: string;
    item_name: string;
    unit: string;
    deliveredQty: number;
    billedQty: number;
    unitPrice: number;
    dnUnitPrice: number;
    line_total: number;
  }>;
}

export interface PrintAppendixData {
  enabled: boolean;
  groups: PrintAppendixGroup[];
}

/**
 * A delivery-note "header" row (one per DN, qty 0 / price 0) is a grouping
 * marker — it carries no amount, so when the appendix is enabled it is hidden
 * from the invoice pages (the per-DN breakdown moves to the appendix).
 */
export function isDnHeaderRow(item: DocumentLineItem): boolean {
  return (
    Boolean(item.source_document_id) &&
    !item.source_line_item_id &&
    Number(item.quantity) === 0 &&
    Number(item.unit_price) === 0
  );
}

/**
 * When the appendix is on and the invoice is DN-sourced: strip DN-header rows
 * from the invoice's item list (they live in the appendix instead) and build
 * the per-DN breakdown the appendix renders.
 */
export function applyAppendixToData(
  data: PrintableDocumentDataBase,
): { filteredLineItems: DocumentLineItem[]; appendix: PrintAppendixData } {
  const enabled =
    data.document.dn_appendix === true && data.invoiceDeliveryNotes.length > 0;

  if (!enabled) {
    return { filteredLineItems: data.lineItems, appendix: { enabled: false, groups: [] } };
  }

  const filteredLineItems = data.lineItems.filter((item) => !isDnHeaderRow(item));

  // Map each source line item back to its DN via source_document_id.
  const linesByDn = new Map<string, DocumentLineItem[]>();
  for (const item of filteredLineItems) {
    const dnId = item.source_document_id;
    if (!dnId) continue;
    const list = linesByDn.get(dnId) || [];
    list.push(item);
    linesByDn.set(dnId, list);
  }

  const groups: PrintAppendixGroup[] = data.invoiceDeliveryNotes
    .slice()
    .sort((a, b) => (a.issue_date || "").localeCompare(b.issue_date || ""))
    .map((link) => {
      const items = (linesByDn.get(link.delivery_note_id) || []).map((li) => ({
        id: li.id,
        item_name: li.item_name,
        unit: li.unit || "ชิ้น",
        deliveredQty: Number(li.source_delivered_qty ?? li.quantity) || 0,
        billedQty: Number(li.quantity) || 0,
        unitPrice: Number(li.unit_price) || 0,
        dnUnitPrice: Number(li.source_unit_price ?? li.unit_price) || 0,
        line_total: Number(li.line_total) || 0,
      }));
      return {
        dnNumber: link.delivery_note_number,
        issueDate: link.issue_date,
        items,
      };
    });

  return { filteredLineItems, appendix: { enabled: true, groups } };
}

export function shouldSuppressVarianceForAppendix(data: PrintableDocumentDataBase): boolean {
  return data.document.dn_appendix === true && data.invoiceDeliveryNotes.length > 0;
}
import { isRefSummaryLine } from "./refSummary";
import { getProxiedImageUrl } from "./r2";
import { paginateLineItems } from "./pagination";
import { estimateLineItemHeight } from "./printRowHeight";
import { getDnVarianceParts } from "./dnVariance";
import { getClassicV2FontScaleMult, getClassicV2SectionScaleMult } from "../constants";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_CANVAS_SCALE = 3;

export type HtmlPrintTemplate = "modern" | "classic" | "classic_v2";

export interface PrintDocumentData {
  document: Document;
  lineItems: DocumentLineItem[];
  billingNoteInvoices: BillingNoteInvoice[];
  receiptInvoices: ReceiptInvoice[];
  invoiceDeliveryNotes: InvoiceDeliveryNote[];
  clientProfile: ClientProfile;
  customer: Customer;
  referenceDoc?: Document;
  template: HtmlPrintTemplate;
  lineDiscountTotal: number;
  grossSubtotal: number;
  lineDeliveryNoteMap: Record<
    string,
    { number: string; issue_date: string | null; kind?: "delivery_note" | "quotation" }
  >;
  showInlineDeliveryNotes: boolean;
  isDeliveryNoteSummaryInvoice: boolean;
  invoiceNumberMap: Record<string, string>;
  receiptOutstanding?: number;
  receiptPaymentNumber?: number;
  receiptCumulativePaid?: number;
  bankAccount?: BankAccount;
  /** True when a receipt's paid rows are shown as its parent billing note. */
  receiptPaidViaBillingNote?: boolean;
}

export interface PrintableDocumentDataBase {
  document: Document;
  lineItems: DocumentLineItem[];
  billingNoteInvoices: BillingNoteInvoice[];
  receiptInvoices: ReceiptInvoice[];
  invoiceDeliveryNotes: InvoiceDeliveryNote[];
  clientProfile: ClientProfile;
  customer: Customer;
  referenceDoc?: Document;
  lineDiscountTotal: number;
  grossSubtotal: number;
  lineDeliveryNoteMap: Record<
    string,
    { number: string; issue_date: string | null; kind?: "delivery_note" | "quotation" }
  >;
  showInlineDeliveryNotes: boolean;
  isDeliveryNoteSummaryInvoice: boolean;
  invoiceNumberMap: Record<string, string>;
  receiptOutstanding?: number;
  receiptPaymentNumber?: number;
  receiptCumulativePaid?: number;
  bankAccount?: BankAccount;
  /** True when a receipt's paid rows are shown as its parent billing note. */
  receiptPaidViaBillingNote?: boolean;
}

export function isHtmlPrintTemplate(
  template: string | null | undefined,
): template is HtmlPrintTemplate {
  return template === "modern" || template === "classic" || template === "classic_v2";
}

function makeLineItemEstimate(
  data: PrintableDocumentDataBase,
  template: HtmlPrintTemplate,
  fontScale = 1,
) {
  const hideDeliveryAmounts =
    data.document.doc_type === "delivery_note" &&
    data.document.hide_amounts_on_print !== false;
  const hasMultiInvoiceRefs =
    !data.document.vat_registered &&
    (data.receiptInvoices.length > 1 || data.billingNoteInvoices.length > 1);
  const showVariance = data.document.show_dn_variance === true;
  return (item: DocumentLineItem) =>
    estimateLineItemHeight(item, template, {
      fontScale,
      hideDeliveryAmounts,
      hasLineDiscount:
        (item.discount_amount ?? 0) > 0 || (item.discount_percent ?? 0) > 0,
      hasInlineDnRef:
        !!data.showInlineDeliveryNotes && !!data.lineDeliveryNoteMap[item.id],
      hasInvoiceRef:
        hasMultiInvoiceRefs && !!data.invoiceNumberMap[item.document_id],
      hasDnVariance:
        showVariance &&
        !!item.source_document_id &&
        getDnVarianceParts({
          deliveredQty: item.source_delivered_qty,
          billedQty: Number(item.quantity) || 0,
          unit: item.unit || "ชิ้น",
          dnUnitPrice: item.source_unit_price,
          unitPrice: Number(item.unit_price) || 0,
          dnDocNumber: data.lineDeliveryNoteMap[item.id]?.number,
          sourceKind: data.lineDeliveryNoteMap[item.id]?.kind,
        }).length > 0,
    });
}

export async function getPrintableDocumentDataBase(
  documentId: string,
): Promise<PrintableDocumentDataBase> {
  const document = await getDocumentDetail(documentId);
  const customer = document.customer as Customer | undefined;

  if (!customer) {
    throw new Error("Customer data is missing for this document.");
  }

  const { data: clientProfileData, error: clientProfileError } = await supabase
    .from("client_profiles")
    .select("*")
    .eq("user_id", document.user_id)
    .single();

  if (clientProfileError || !clientProfileData) {
    throw clientProfileError || new Error("Client profile not found.");
  }

  const clientProfile = clientProfileData as ClientProfile;

  let bankAccount: BankAccount | undefined;
  if (document.bank_account_id) {
    const { data: bankAccountData } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("id", document.bank_account_id)
      .single();
    if (bankAccountData) {
      bankAccount = bankAccountData as BankAccount;
    }
  }

  let referenceDoc: Document | undefined;
  let receiptOutstanding: number | undefined;
  let receiptPaymentNumber: number | undefined;
  let receiptCumulativePaid: number | undefined;
  const referenceId =
    document.doc_type === "billing_note" || document.doc_type === "receipt"
      ? undefined
      : document.converted_from_id || document.copied_from_id || undefined;

  if (referenceId) {
    const { data: referenceData } = await supabase
      .from("documents")
      .select("*")
      .eq("id", referenceId)
      .single();

    if (referenceData) {
      const refDeal = (referenceData as Document).deal_id;
      // Skip references that point across deals — deal-clone copies should
      // never print a reference to the old deal's document.
      if (!refDeal || !document.deal_id || refDeal === document.deal_id) {
        referenceDoc = referenceData as Document;
      }
    }
  }

  let lineItems = document.line_items || [];

  // Receipts settled via a billing note reference the ใบวางบิล itself.
  let parentBillingNote: Document | undefined;

  if (
    (document.doc_type === "receipt" || document.doc_type === "billing_note") &&
    document.deal_id
  ) {
    const { data: dealDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("deal_id", document.deal_id)
      .order("created_at", { ascending: true });

    const docList = (dealDocs || []) as Document[];

    const hasParentRef = Boolean(document.converted_from_id);
    const billingNote = hasParentRef
      ? docList.find((d) => d.id === document.converted_from_id && d.doc_type === "billing_note")
      : document.doc_type === "billing_note"
        ? // Printing a billing note: its own linked invoices are the source,
          // never another (earlier) BN in the same deal.
          document
        : docList.find((d) => d.doc_type === "billing_note");
    if (document.doc_type === "receipt") parentBillingNote = billingNote;
    const sourceInvoice = hasParentRef
      ? docList.find(
          (d) => d.id === document.converted_from_id && (d.doc_type === "invoice" || d.doc_type === "tax_invoice_receipt"),
        )
      : docList.find(
          (d) => d.doc_type === "invoice" || d.doc_type === "tax_invoice_receipt",
        );

    if (billingNote) {
      if (document.doc_type === "receipt") {
        const priorReceipts = docList.filter((doc) => doc.doc_type === "receipt" && doc.converted_from_id === billingNote.id && doc.status !== "voided" && doc.created_at <= document.created_at);
        const receivedForBillingNote = priorReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || (receipt.amount_received || 0) + (receipt.wht_amount || 0)), 0);
        receiptOutstanding = Math.max(0, (billingNote.total_amount || billingNote.net_payable || 0) - receivedForBillingNote);
        receiptPaymentNumber = priorReceipts.length;
        receiptCumulativePaid = receivedForBillingNote;
      }
      const { data: linkedInvoices } = await supabase
        .from("billing_note_invoices")
        .select("invoice_id")
        .eq("billing_note_id", billingNote.id);

      const linkedIds = (linkedInvoices || []).map(
        (r: { invoice_id: string }) => r.invoice_id,
      );

      if (linkedIds.length > 0) {
        const { data: invDocs } = await supabase
          .from("documents")
          .select("*")
          .in("id", linkedIds);

        const invoices = (invDocs || []) as Document[];
        // Only receipts reference the billing note — a billing note must not
        // reference itself (it would print its own number as REF. NO.).
        if (document.doc_type === "receipt") referenceDoc = billingNote;

        const { data: allItems } = await supabase
          .from("document_line_items")
          .select("*")
          .in("document_id", linkedIds)
          .order("sort_order", { ascending: true });

        if (allItems && allItems.length > 0) {
          // Ref-summary marker rows (โหมดอ้างอิง headers like "ใบส่งของ DN-…")
          // belong to the invoice's grouped print layout — never to receipts.
          lineItems = (allItems as DocumentLineItem[]).filter((item) => !isRefSummaryLine(item));
        }
      } else {
        if (document.doc_type === "receipt") referenceDoc = billingNote;
        const { data: bnItems } = await supabase
          .from("billing_note_invoices")
          .select("*")
          .eq("billing_note_id", billingNote.id);
        if (bnItems && bnItems.length > 0) {
          lineItems = bnItems as unknown as DocumentLineItem[];
        }
      }
    } else if (sourceInvoice) {
      if (document.doc_type === "receipt") {
        const priorReceipts = docList.filter((doc) => doc.doc_type === "receipt" && doc.converted_from_id === sourceInvoice.id && doc.status !== "voided" && doc.created_at <= document.created_at);
        const receivedForInvoice = priorReceipts.reduce((sum, receipt) => sum + (receipt.total_amount || (receipt.amount_received || 0) + (receipt.wht_amount || 0)), 0);
        receiptOutstanding = Math.max(0, (sourceInvoice.total_amount || sourceInvoice.net_payable || 0) - receivedForInvoice);
        receiptPaymentNumber = priorReceipts.length;
        receiptCumulativePaid = receivedForInvoice;
      }
      referenceDoc = sourceInvoice;
      const { data: invItems } = await supabase
        .from("document_line_items")
        .select("*")
        .eq("document_id", sourceInvoice.id)
        .order("sort_order", { ascending: true });
      if (invItems && invItems.length > 0) {
        // Same: strip ref-summary markers when copying straight from an invoice.
        lineItems = (invItems as DocumentLineItem[]).filter((item) => !isRefSummaryLine(item));
      }
    }
  }

  const lineDiscountTotal = lineItems.reduce(
    (sum, item) => sum + (item.discount_amount || 0),
    0,
  );
  const grossSubtotal =
    document.subtotal + (document.discount_amount || 0) + lineDiscountTotal;
  let invoiceDeliveryNotes = document.invoice_delivery_notes || [];

  if (
    (document.doc_type === "invoice" ||
      document.doc_type === "tax_invoice_receipt") &&
    invoiceDeliveryNotes.length === 0
  ) {
    const { data: deliveryNotes } = await supabase
      .from("invoice_delivery_notes")
      .select("*")
      .eq("invoice_id", documentId)
      .order("issue_date", { ascending: true });
    invoiceDeliveryNotes = (deliveryNotes || []) as InvoiceDeliveryNote[];
  }

  if (clientProfile.logo_url) {
    clientProfile.logo_url = getProxiedImageUrl(clientProfile.logo_url);
  }

  if (clientProfile.signature_url) {
    clientProfile.signature_url = getProxiedImageUrl(clientProfile.signature_url);
  }

  if (clientProfile.stamp_url) {
    clientProfile.stamp_url = getProxiedImageUrl(clientProfile.stamp_url);
  }

  const sigDocs = clientProfile.show_signature_on_docs as Record<string, boolean> | null | undefined;
  if (sigDocs && sigDocs[document.doc_type] === false) {
    clientProfile.signature_url = null;
  }
  const stpDocs = clientProfile.show_stamp_on_docs as Record<string, boolean> | null | undefined;
  if (stpDocs && stpDocs[document.doc_type] === false) {
    clientProfile.stamp_url = null;
  }

  if (clientProfile.show_logo === false) {
    clientProfile.logo_url = null;
  }

  const dnBySourceId = new Map<string, InvoiceDeliveryNote>();
  for (const dn of invoiceDeliveryNotes) {
    dnBySourceId.set(dn.delivery_note_id, dn);
  }

  const linkedSourceIds = new Set(dnBySourceId.keys());
  const otherSourceIds = [
    ...new Set(
      lineItems
        .map((item) => item.source_document_id)
        .filter((id): id is string => !!id && !linkedSourceIds.has(id)),
    ),
  ];
  const sourceDocInfo = new Map<
    string,
    { number: string; issue_date: string | null; kind: "delivery_note" | "quotation" }
  >();
  if (otherSourceIds.length > 0) {
    const { data: sourceDocs } = await supabase
      .from("documents")
      .select("id, doc_number, issue_date, doc_type")
      .in("id", otherSourceIds);
    for (const sd of sourceDocs || []) {
      sourceDocInfo.set(sd.id, {
        number: sd.doc_number || sd.id.slice(0, 8),
        issue_date: sd.issue_date,
        kind: sd.doc_type === "quotation" ? "quotation" : "delivery_note",
      });
    }
  }

  const lineDeliveryNoteMap: Record<
    string,
    { number: string; issue_date: string | null; kind?: "delivery_note" | "quotation" }
  > = {};
  for (const item of lineItems) {
    const dn = item.source_document_id
      ? dnBySourceId.get(item.source_document_id)
      : undefined;
    if (dn) {
      lineDeliveryNoteMap[item.id] = {
        number: dn.delivery_note_number,
        issue_date: dn.issue_date,
        kind: "delivery_note",
      };
    } else {
      const info = item.source_document_id
        ? sourceDocInfo.get(item.source_document_id)
        : undefined;
      if (info) {
        lineDeliveryNoteMap[item.id] = info;
      }
    }
  }
  const summarySourceIds = new Set(
    invoiceDeliveryNotes.map((dn) => dn.delivery_note_id),
  );
  const isDeliveryNoteSummaryInvoice =
    (document.doc_type === "invoice" ||
      document.doc_type === "tax_invoice_receipt") &&
    invoiceDeliveryNotes.length > 0 &&
    lineItems.length === invoiceDeliveryNotes.length &&
    lineItems.every(
      (item) =>
        item.source_document_id &&
        summarySourceIds.has(item.source_document_id) &&
        !item.source_line_item_id,
    );
  const showInlineDeliveryNotes =
    !isDeliveryNoteSummaryInvoice &&
    new Set(Object.values(lineDeliveryNoteMap).map((ref) => ref.number)).size >=
      1;

  const invoiceNumberMap: Record<string, string> = {};
  for (const ri of document.receipt_invoices || []) {
    invoiceNumberMap[ri.invoice_id] = ri.invoice_number;
  }
  for (const bi of document.billing_invoices || []) {
    invoiceNumberMap[bi.invoice_id] = bi.invoice_number;
  }

  // Receipt whose parent is a billing note: show the ใบวางบิล itself as the
  // single paid row — the document the user actually settled against.
  // Applies to drafts and confirmed receipts alike.
  let receiptInvoices = document.receipt_invoices || [];
  let receiptPaidViaBillingNote = false;
  if (document.doc_type === "receipt" && parentBillingNote) {
    const bn = parentBillingNote;
    receiptPaidViaBillingNote = true;
    receiptInvoices = [
      {
        id: `bn-${bn.id}`,
        receipt_id: document.id,
        invoice_id: bn.id,
        source_billing_note_id: bn.id,
        user_id: document.user_id,
        invoice_number: bn.doc_number || "",
        issue_date: bn.issue_date,
        subtotal: bn.subtotal || 0,
        vat_amount: bn.vat_amount || 0,
        total_amount: bn.total_amount || bn.net_payable || 0,
        paid_amount: document.net_payable || 0,
        created_at: document.created_at || new Date().toISOString(),
      } as ReceiptInvoice,
    ];
  }

  return {
    document,
    lineItems,
    billingNoteInvoices: document.billing_invoices || [],
    receiptInvoices,
    receiptPaidViaBillingNote,
    invoiceDeliveryNotes,
    clientProfile,
    customer,
    referenceDoc,
    lineDiscountTotal,
    grossSubtotal,
    lineDeliveryNoteMap,
    showInlineDeliveryNotes,
    isDeliveryNoteSummaryInvoice,
    invoiceNumberMap,
    receiptOutstanding,
    receiptPaymentNumber,
    receiptCumulativePaid,
    bankAccount,
  };
}

export async function getPrintDocumentData(
  documentId: string,
): Promise<PrintDocumentData> {
  const baseData = await getPrintableDocumentDataBase(documentId);
  const rawTemplate = baseData.clientProfile.pdf_template;
  const template: HtmlPrintTemplate =
    rawTemplate === "classic" ? "classic" : rawTemplate === "classic_v2" ? "classic_v2" : "modern";
  return { ...baseData, template };
}

async function renderModernPrintCanvas(
  data: PrintableDocumentDataBase,
  copyType: "original" | "copy" = "original",
  batchLineItems?: DocumentLineItem[],
  pageMode?: "single" | "first" | "continuation" | "last",
  pageIndex?: number,
  totalPages?: number,
): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;top:0;left:0;width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;opacity:0;pointer-events:none;z-index:-1;isolation:isolate;overflow:hidden;`;
  document.body.appendChild(container);
  let root: { render: (...args: any[]) => void; unmount: () => void } | null =
    null;

  try {
    const { createRoot } = await import("react-dom/client");
    const { PrintDocument } = await import("../components/print/PrintDocument");
    const React = await import("react");

    const printData: PrintDocumentData = {
      ...data,
      template: "modern",
    };

    root = createRoot(container);

    await new Promise<void>((resolve) => {
      root?.render(
        React.createElement(PrintDocument, {
          data: printData,
          copyType,
          pageMode: pageMode ?? "single",
          pageIndex: pageIndex ?? 1,
          totalPages: totalPages ?? 1,
          batchLineItems,
        }),
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const sheet = container.querySelector<HTMLElement>(".print-sheet");
    if (!sheet) {
      throw new Error("Print sheet not found");
    }

    const images = sheet.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          }),
      ),
    );

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );

    const captureRect = sheet.getBoundingClientRect();

    return await html2canvas(sheet, {
      scale: PDF_CANVAS_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: captureRect.width,
      height: captureRect.height,
      windowWidth: captureRect.width,
      windowHeight: captureRect.height,
      onclone: (clonedDoc) => {
        const clonedSheet =
          clonedDoc.querySelector<HTMLElement>(".print-sheet");
        if (clonedSheet) {
          clonedSheet.style.width = `${A4_WIDTH_MM}mm`;
          clonedSheet.style.height = `${A4_HEIGHT_MM}mm`;
          clonedSheet.style.minHeight = `${A4_HEIGHT_MM}mm`;
          clonedSheet.style.overflow = "hidden";
          clonedSheet.style.border = "none";
          clonedSheet.style.borderRadius = "0";
          clonedSheet.style.boxShadow = "none";
        }
        const clonedTheme = clonedDoc.querySelector<HTMLElement>(
          ".print-theme-modern",
        );
        if (clonedTheme) {
          clonedTheme.style.border = "none";
          clonedTheme.style.borderRadius = "0";
          clonedTheme.style.boxShadow = "none";
        }
      },
    });
  } finally {
    root?.unmount();
    document.body.removeChild(container);
  }
}

async function renderAppendixCanvas(
  data: PrintableDocumentDataBase,
  template: HtmlPrintTemplate,
): Promise<HTMLCanvasElement | null> {
  const { appendix } = applyAppendixToData(data);
  if (!appendix.enabled) return null;

  const { default: html2canvas } = await import("html2canvas");
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;top:0;left:0;width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;opacity:0;pointer-events:none;z-index:-1;isolation:isolate;overflow:hidden;background:#ffffff;`;
  document.body.appendChild(container);
  let root: { render: (...args: any[]) => void; unmount: () => void } | null = null;
  try {
    const { createRoot } = await import("react-dom/client");
    const { PrintAppendix } = await import("../components/print/PrintAppendix");
    const React = await import("react");
    const printData: PrintDocumentData = { ...data, template, document: data.document };

    root = createRoot(container);
    await new Promise<void>((resolve) => {
      root?.render(
        React.createElement(PrintAppendix, { data: appendix, template }),
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const sheet = container.querySelector<HTMLElement>(".print-appendix");
    if (!sheet) return null;
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const rect = sheet.getBoundingClientRect();
    return await html2canvas(sheet, {
      scale: PDF_CANVAS_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: rect.width,
      height: rect.height,
      windowWidth: rect.width,
      windowHeight: rect.height,
    });
  } finally {
    root?.unmount();
    document.body.removeChild(container);
  }
}

async function renderModernPrintPages(
  data: PrintableDocumentDataBase,
  copyType: "original" | "copy" = "original",
): Promise<HTMLCanvasElement[]> {
  const batches = paginateLineItems(data.lineItems, "modern", {
    estimateHeight: makeLineItemEstimate(data, "modern"),
  });
  if (batches.length <= 1) {
    return [await renderModernPrintCanvas(data, copyType)];
  }
  return Promise.all(
    batches.map((batch, i) =>
      renderModernPrintCanvas(
        data,
        copyType,
        batch.items,
        batch.mode,
        i + 1,
        batches.length,
      ),
    ),
  );
}

async function appendAppendixToPdf(
  pdf: any,
  data: PrintableDocumentDataBase,
  template: HtmlPrintTemplate,
  firstPage: boolean,
): Promise<boolean> {
  const appendixCanvas = await renderAppendixCanvas(data, template);
  if (!appendixCanvas) return firstPage;
  if (!firstPage) pdf.addPage();
  pdf.addImage(
    appendixCanvas.toDataURL("image/png"),
    "PNG",
    0,
    0,
    A4_WIDTH_MM,
    A4_HEIGHT_MM,
  );
  return false;
}

export async function generateModernPDFDocument(
  data: PrintableDocumentDataBase,
  copyTypes: Array<"original" | "copy"> = ["original"],
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [A4_WIDTH_MM, A4_HEIGHT_MM],
  });

  let firstPage = true;
  for (const copyType of copyTypes) {
    const pages = await renderModernPrintPages(data, copyType);
    for (const canvas of pages) {
      if (!firstPage) {
        pdf.addPage();
      }
      firstPage = false;
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        A4_WIDTH_MM,
        A4_HEIGHT_MM,
      );
    }
  }

  return pdf;
}

export async function generateModernPDFBlob(
  data: PrintableDocumentDataBase,
): Promise<Blob> {
  const pdf = await generateModernPDFDocument(data, ["original"]);
  return pdf.output("blob");
}

async function renderClassicPrintCanvas(
  data: PrintableDocumentDataBase,
  copyType: "original" | "copy" = "original",
  batchLineItems?: DocumentLineItem[],
  pageMode?: "single" | "first" | "continuation" | "last",
  pageIndex?: number,
  totalPages?: number,
): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;top:0;left:0;width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;opacity:0;pointer-events:none;z-index:-1;isolation:isolate;overflow:hidden;`;
  document.body.appendChild(container);
  let root: { render: (...args: any[]) => void; unmount: () => void } | null =
    null;

  try {
    const { createRoot } = await import("react-dom/client");
    const { PrintDocumentClassic } =
      await import("../components/print/PrintDocumentClassic");
    const React = await import("react");

    const printData: PrintDocumentData = {
      ...data,
      template: "classic",
    };

    root = createRoot(container);

    await new Promise<void>((resolve) => {
      root?.render(
        React.createElement(PrintDocumentClassic, {
          data: printData,
          copyType,
          pageMode: pageMode ?? "single",
          pageIndex: pageIndex ?? 1,
          totalPages: totalPages ?? 1,
          batchLineItems,
        }),
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const sheet = container.querySelector<HTMLElement>(".print-sheet");
    if (!sheet) {
      throw new Error("Print sheet not found");
    }

    const images = sheet.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          }),
      ),
    );

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );

    const captureRect = sheet.getBoundingClientRect();

    return await html2canvas(sheet, {
      scale: PDF_CANVAS_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: captureRect.width,
      height: captureRect.height,
      windowWidth: captureRect.width,
      windowHeight: captureRect.height,
      onclone: (clonedDoc) => {
        const clonedSheet =
          clonedDoc.querySelector<HTMLElement>(".print-sheet");
        if (clonedSheet) {
          clonedSheet.style.width = `${A4_WIDTH_MM}mm`;
          clonedSheet.style.height = `${A4_HEIGHT_MM}mm`;
          clonedSheet.style.minHeight = `${A4_HEIGHT_MM}mm`;
          clonedSheet.style.overflow = "hidden";
          clonedSheet.style.border = "none";
          clonedSheet.style.borderRadius = "0";
          clonedSheet.style.boxShadow = "none";
        }
        const clonedTheme = clonedDoc.querySelector<HTMLElement>(
          ".print-theme-classic",
        );
        if (clonedTheme) {
          clonedTheme.style.border = "none";
          clonedTheme.style.borderRadius = "0";
          clonedTheme.style.boxShadow = "none";
        }
      },
    });
  } finally {
    root?.unmount();
    document.body.removeChild(container);
  }
}

async function renderClassicPrintPages(
  data: PrintableDocumentDataBase,
  copyType: "original" | "copy" = "original",
): Promise<HTMLCanvasElement[]> {
  const batches = paginateLineItems(data.lineItems, "classic", {
    estimateHeight: makeLineItemEstimate(data, "classic"),
  });
  if (batches.length <= 1) {
    return [await renderClassicPrintCanvas(data, copyType)];
  }
  return Promise.all(
    batches.map((batch, i) =>
      renderClassicPrintCanvas(
        data,
        copyType,
        batch.items,
        batch.mode,
        i + 1,
        batches.length,
      ),
    ),
  );
}

export async function generateClassicPDFDocument(
  data: PrintableDocumentDataBase,
  copyTypes: Array<"original" | "copy"> = ["original"],
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [A4_WIDTH_MM, A4_HEIGHT_MM],
  });

  let firstPage = true;
  for (const copyType of copyTypes) {
    const pages = await renderClassicPrintPages(data, copyType);
    for (const canvas of pages) {
      if (!firstPage) {
        pdf.addPage();
      }
      firstPage = false;
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        A4_WIDTH_MM,
        A4_HEIGHT_MM,
      );
    }
  }
  await appendAppendixToPdf(pdf, data, "classic", firstPage);
  return pdf;
}

export async function generateClassicPDFBlob(
  data: PrintableDocumentDataBase,
): Promise<Blob> {
  const pdf = await generateClassicPDFDocument(data, ["original"]);
  return pdf.output("blob");
}

export async function generatePDFDocument(
  data: PrintableDocumentDataBase,
  copyTypes: Array<"original" | "copy"> = ["original"],
) {
  if ((data as PrintDocumentData).template === "classic") {
    return generateClassicPDFDocument(data, copyTypes);
  }
  if ((data as PrintDocumentData).template === "classic_v2") {
    return generateClassicV2PDFDocument(data, copyTypes);
  }
  return generateModernPDFDocument(data, copyTypes);
}

export async function generatePDFBlob(
  data: PrintableDocumentDataBase,
): Promise<Blob> {
  if ((data as PrintDocumentData).template === "classic") {
    return generateClassicPDFBlob(data);
  }
  if ((data as PrintDocumentData).template === "classic_v2") {
    return generateClassicV2PDFBlob(data);
  }
  return generateModernPDFBlob(data);
}

async function renderClassicV2PrintCanvas(
  data: PrintableDocumentDataBase,
  copyType: "original" | "copy" = "original",
  batchLineItems?: DocumentLineItem[],
  pageMode?: "single" | "first" | "continuation" | "last",
  pageIndex?: number,
  totalPages?: number,
): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;top:0;left:0;width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;opacity:0;pointer-events:none;z-index:-1;isolation:isolate;overflow:hidden;`;
  document.body.appendChild(container);
  let root: { render: (...args: any[]) => void; unmount: () => void } | null =
    null;

  try {
    const { createRoot } = await import("react-dom/client");
    const { PrintDocumentClassicV2 } =
      await import("../components/print/PrintDocumentClassicV2");
    const React = await import("react");

    const printData: PrintDocumentData = {
      ...data,
      template: "classic_v2",
    };

    root = createRoot(container);

    await new Promise<void>((resolve) => {
      root?.render(
        React.createElement(PrintDocumentClassicV2, {
          data: printData,
          copyType,
          pageMode: pageMode ?? "single",
          pageIndex: pageIndex ?? 1,
          totalPages: totalPages ?? 1,
          batchLineItems,
        }),
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const sheet = container.querySelector<HTMLElement>(".print-sheet");
    if (!sheet) {
      throw new Error("Print sheet not found");
    }

    const images = sheet.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          }),
      ),
    );

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );

    const captureRect = sheet.getBoundingClientRect();

    return await html2canvas(sheet, {
      scale: PDF_CANVAS_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: captureRect.width,
      height: captureRect.height,
      windowWidth: captureRect.width,
      windowHeight: captureRect.height,
      onclone: (clonedDoc) => {
        const clonedSheet =
          clonedDoc.querySelector<HTMLElement>(".print-sheet");
        if (clonedSheet) {
          clonedSheet.style.width = `${A4_WIDTH_MM}mm`;
          clonedSheet.style.height = `${A4_HEIGHT_MM}mm`;
          clonedSheet.style.minHeight = `${A4_HEIGHT_MM}mm`;
          clonedSheet.style.overflow = "hidden";
          clonedSheet.style.border = "none";
          clonedSheet.style.borderRadius = "0";
          clonedSheet.style.boxShadow = "none";
        }
        const clonedTheme = clonedDoc.querySelector<HTMLElement>(
          ".print-theme-classic",
        );
        if (clonedTheme) {
          clonedTheme.style.border = "none";
          clonedTheme.style.borderRadius = "0";
          clonedTheme.style.boxShadow = "none";
        }
      },
    });
  } finally {
    root?.unmount();
    document.body.removeChild(container);
  }
}

async function renderClassicV2PrintPages(
  data: PrintableDocumentDataBase,
  copyType: "original" | "copy" = "original",
): Promise<HTMLCanvasElement[]> {
  const globalScale = getClassicV2FontScaleMult(
    data.clientProfile.classic_v2_font_scale,
  );
  const sectionScales = data.clientProfile.classic_v2_section_font_scales;
  const itemsScale = getClassicV2SectionScaleMult("items", sectionScales, globalScale);
  const budgetScales = {
    header: getClassicV2SectionScaleMult("header", sectionScales, globalScale),
    items: itemsScale,
    totals: getClassicV2SectionScaleMult("totals", sectionScales, globalScale),
    footer: getClassicV2SectionScaleMult("footer", sectionScales, globalScale),
  };
  const batches = paginateLineItems(data.lineItems, "classic", {
    estimateHeight: makeLineItemEstimate(data, "classic", itemsScale),
    fontScale: budgetScales,
  });
  if (batches.length <= 1) {
    return [await renderClassicV2PrintCanvas(data, copyType)];
  }
  return Promise.all(
    batches.map((batch, i) =>
      renderClassicV2PrintCanvas(
        data,
        copyType,
        batch.items,
        batch.mode,
        i + 1,
        batches.length,
      ),
    ),
  );
}

export async function generateClassicV2PDFDocument(
  data: PrintableDocumentDataBase,
  copyTypes: Array<"original" | "copy"> = ["original"],
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [A4_WIDTH_MM, A4_HEIGHT_MM],
  });

  let firstPage = true;
  for (const copyType of copyTypes) {
    const pages = await renderClassicV2PrintPages(data, copyType);
    for (const canvas of pages) {
      if (!firstPage) {
        pdf.addPage();
      }
      firstPage = false;
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        A4_WIDTH_MM,
        A4_HEIGHT_MM,
      );
    }
  }
  await appendAppendixToPdf(pdf, data, "classic_v2", firstPage);
  return pdf;
}

export async function generateClassicV2PDFBlob(
  data: PrintableDocumentDataBase,
): Promise<Blob> {
  const pdf = await generateClassicV2PDFDocument(data, ["original"]);
  return pdf.output("blob");
}
