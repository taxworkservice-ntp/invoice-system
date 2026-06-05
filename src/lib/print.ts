import type { BillingNoteInvoice, ClientProfile, Customer, Document, DocumentLineItem } from "../types";
import { getDocumentDetail } from "../hooks/useDocuments";
import { supabase } from "./supabase";
import { getR2PresignedUrl } from "./r2";

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
      clientProfile.logo_url = await getR2PresignedUrl(clientProfile.logo_url);
    } catch {
      clientProfile.logo_url = null;
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
