import type { BillingNoteInvoice, ClientProfile, Customer, Document, DocumentLineItem } from "../types";
import { getDocumentDetail } from "../hooks/useDocuments";
import { supabase } from "./supabase";
import { getR2PresignedUrl, getProxiedImageUrl } from "./r2";

export type HtmlPrintTemplate = "modern";

export interface PrintDocumentData {
  document: Document;
  lineItems: DocumentLineItem[];
  billingNoteInvoices: BillingNoteInvoice[];
  clientProfile: ClientProfile;
  customer: Customer;
  referenceDoc?: Document;
  template: HtmlPrintTemplate;
  lineDiscountTotal: number;
  grossSubtotal: number;
}

export interface PrintableDocumentDataBase {
  document: Document;
  lineItems: DocumentLineItem[];
  billingNoteInvoices: BillingNoteInvoice[];
  clientProfile: ClientProfile;
  customer: Customer;
  referenceDoc?: Document;
  lineDiscountTotal: number;
  grossSubtotal: number;
}

export function isHtmlPrintTemplate(template: string | null | undefined): template is HtmlPrintTemplate {
  return template === "modern";
}

export async function getPrintableDocumentDataBase(documentId: string): Promise<PrintableDocumentDataBase> {
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

  let referenceDoc: Document | undefined;
  const referenceId =
    document.doc_type === "credit_note" || document.doc_type === "delivery_note"
      ? document.converted_from_id || document.copied_from_id || undefined
      : undefined;

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

  if (document.doc_type === "receipt" && document.deal_id) {
    const { data: dealDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("deal_id", document.deal_id)
      .order("created_at", { ascending: true });

    const docList = (dealDocs || []) as Document[];

    const billingNote = docList.find((d) => d.doc_type === "billing_note");
    const sourceInvoice = docList.find((d) => d.doc_type === "invoice" || d.doc_type === "tax_invoice_receipt");

    if (billingNote) {
      const { data: linkedInvoices } = await supabase
        .from("billing_note_invoices")
        .select("invoice_id")
        .eq("billing_note_id", billingNote.id);

      const linkedIds = (linkedInvoices || []).map((r: { invoice_id: string }) => r.invoice_id);

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

  const lineDiscountTotal = lineItems.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
  const grossSubtotal = document.subtotal + (document.discount_amount || 0) + lineDiscountTotal;

  if (clientProfile.logo_url) {
    try {
      clientProfile.logo_url = getProxiedImageUrl(clientProfile.logo_url);
    } catch {
      clientProfile.logo_url = null;
    }
  }

  if (clientProfile.signature_url) {
    try {
      clientProfile.signature_url = getProxiedImageUrl(clientProfile.signature_url);
    } catch {
      clientProfile.signature_url = null;
    }
  }

  if (clientProfile.stamp_url) {
    try {
      clientProfile.stamp_url = getProxiedImageUrl(clientProfile.stamp_url);
    } catch {
      clientProfile.stamp_url = null;
    }
  }

  return {
    document,
    lineItems,
    billingNoteInvoices: document.billing_invoices || [],
    clientProfile,
    customer,
    referenceDoc,
    lineDiscountTotal,
    grossSubtotal,
  };
}

export async function getPrintDocumentData(documentId: string): Promise<PrintDocumentData> {
  const baseData = await getPrintableDocumentDataBase(documentId);

  if (!isHtmlPrintTemplate(baseData.clientProfile.pdf_template)) {
    throw new Error("This document is configured to use the classic PDF renderer.");
  }

  return {
    ...baseData,
    template: baseData.clientProfile.pdf_template,
  };
}

export async function openClassicPdfFallback(data: {
  document: Document;
  lineItems: DocumentLineItem[];
  billingNoteInvoices: BillingNoteInvoice[];
  clientProfile: ClientProfile;
  customer: Customer;
  referenceDoc?: Document;
}) {
  const { generatePDFBlob } = await import("./pdf");
  const blob = await generatePDFBlob({
    document: data.document,
    lineItems: data.lineItems,
    billingNoteInvoices: data.billingNoteInvoices,
    clientProfile: { ...data.clientProfile, pdf_template: "classic" },
    customer: data.customer,
    referenceDoc: data.referenceDoc,
  });

  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function renderModernPrintCanvas(
  data: PrintableDocumentDataBase,
  copyType: "original" | "copy" = "original",
): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:0;left:0;width:210mm;opacity:0;pointer-events:none;z-index:-1;isolation:isolate;";
  document.body.appendChild(container);
  let root: { render: (...args: any[]) => void; unmount: () => void } | null = null;

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
      root?.render(React.createElement(PrintDocument, { data: printData, copyType }));
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

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    return await html2canvas(sheet, {
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
      backgroundColor: "#ffffff",
      width: sheet.scrollWidth,
      height: sheet.scrollHeight,
      windowWidth: sheet.scrollWidth,
      windowHeight: sheet.scrollHeight,
    });
  } finally {
    root?.unmount();
    document.body.removeChild(container);
  }
}

export async function generateModernPDFDocument(
  data: PrintableDocumentDataBase,
  copyTypes: Array<"original" | "copy"> = ["original"],
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (const [index, copyType] of copyTypes.entries()) {
    const canvas = await renderModernPrintCanvas(data, copyType);
    if (index > 0) {
      pdf.addPage();
    }
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pageW, pageH);
  }

  return pdf;
}

export async function generateModernPDFBlob(data: PrintableDocumentDataBase): Promise<Blob> {
  const pdf = await generateModernPDFDocument(data, ["original"]);
  return pdf.output("blob");
}
