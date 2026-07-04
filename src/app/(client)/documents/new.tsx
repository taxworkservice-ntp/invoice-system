import { Navigate, useSearchParams } from "react-router-dom";
import { BillingNoteForm } from "../../../components/documents/BillingNoteForm";
import { CreditNoteForm } from "../../../components/documents/CreditNoteForm";
import { DeliveryNoteFromQuotationForm } from "../../../components/documents/DeliveryNoteFromQuotationForm";
import { InvoiceFromDeliveryNotesForm } from "../../../components/documents/InvoiceFromDeliveryNotesForm";

export default function NewDocumentPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type");
  const dealId = searchParams.get("dealId") || undefined;
  const quotationId = searchParams.get("quotationId") || undefined;
  const documentId = searchParams.get("documentId") || undefined;

  if (type === "billing_note") {
    return <BillingNoteForm dealId={dealId} />;
  }

  if (type === "credit_note") {
    return <CreditNoteForm dealId={dealId} />;
  }

  if (type === "invoice_from_delivery_notes") {
    return <InvoiceFromDeliveryNotesForm />;
  }

  if (type === "delivery_note_from_quotation" && quotationId) {
    return <DeliveryNoteFromQuotationForm quotationId={quotationId} documentId={documentId} />;
  }

  const nextParams = new URLSearchParams(searchParams);
  return <Navigate to={`/deals/new?${nextParams.toString()}`} replace />;
}
