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
import { getProxiedImageUrl } from "./r2";
import { paginateLineItems } from "./pagination";

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
    { number: string; issue_date: string | null }
  >;
  showInlineDeliveryNotes: boolean;
  isDeliveryNoteSummaryInvoice: boolean;
  invoiceNumberMap: Record<string, string>;
  receiptOutstanding?: number;
  receiptPaymentNumber?: number;
  receiptCumulativePaid?: number;
  bankAccount?: BankAccount;
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
    { number: string; issue_date: string | null }
  >;
  showInlineDeliveryNotes: boolean;
  isDeliveryNoteSummaryInvoice: boolean;
  invoiceNumberMap: Record<string, string>;
  receiptOutstanding?: number;
  receiptPaymentNumber?: number;
  receiptCumulativePaid?: number;
  bankAccount?: BankAccount;
}

export function isHtmlPrintTemplate(
  template: string | null | undefined,
): template is HtmlPrintTemplate {
  return template === "modern" || template === "classic" || template === "classic_v2";
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
      referenceDoc = referenceData as Document;
    }
  }

  let lineItems = document.line_items || [];

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

    const billingNote =
      docList.find((d) => d.id === document.converted_from_id && d.doc_type === "billing_note") ||
      docList.find((d) => d.doc_type === "billing_note");
    const sourceInvoice =
      docList.find(
        (d) => d.id === document.converted_from_id && (d.doc_type === "invoice" || d.doc_type === "tax_invoice_receipt"),
      ) ||
      docList.find(
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
        referenceDoc = invoices[invoices.length - 1] || billingNote;

        const { data: allItems } = await supabase
          .from("document_line_items")
          .select("*")
          .in("document_id", linkedIds)
          .order("sort_order", { ascending: true });

        if (allItems && allItems.length > 0) {
          lineItems = allItems as DocumentLineItem[];
        }
      } else {
        referenceDoc = billingNote;
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
        lineItems = invItems as DocumentLineItem[];
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
  const lineDeliveryNoteMap: Record<
    string,
    { number: string; issue_date: string | null }
  > = {};
  for (const item of lineItems) {
    const dn = item.source_document_id
      ? dnBySourceId.get(item.source_document_id)
      : undefined;
    if (dn) {
      lineDeliveryNoteMap[item.id] = {
        number: dn.delivery_note_number,
        issue_date: dn.issue_date,
      };
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

  return {
    document,
    lineItems,
    billingNoteInvoices: document.billing_invoices || [],
    receiptInvoices: document.receipt_invoices || [],
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

async function renderModernPrintPages(
  data: PrintableDocumentDataBase,
  copyType: "original" | "copy" = "original",
): Promise<HTMLCanvasElement[]> {
  const batches = paginateLineItems(data.lineItems, "modern");
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
  const batches = paginateLineItems(data.lineItems, "classic");
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
  const batches = paginateLineItems(data.lineItems, "classic");
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

  return pdf;
}

export async function generateClassicV2PDFBlob(
  data: PrintableDocumentDataBase,
): Promise<Blob> {
  const pdf = await generateClassicV2PDFDocument(data, ["original"]);
  return pdf.output("blob");
}
