import { Navigate, useSearchParams } from "react-router-dom";
import { BillingNoteForm } from "../../../components/documents/BillingNoteForm";
import { CreditNoteForm } from "../../../components/documents/CreditNoteForm";
import { DeliveryNoteFromQuotationForm } from "../../../components/documents/DeliveryNoteFromQuotationForm";
import { InvoiceFromDeliveryNotesForm } from "../../../components/documents/InvoiceFromDeliveryNotesForm";
import { InvoiceFromQuotationForm } from "../../../components/documents/InvoiceFromQuotationForm";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { getWorkspaceExperience, getWorkspacePermissions } from "../../../lib/permissions";

export default function NewDocumentPage() {
  const [searchParams] = useSearchParams();
  const { workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const experience = getWorkspaceExperience(workspaceRole, permissions);
  const type = searchParams.get("type");
  const dealId = searchParams.get("dealId") || undefined;
  const quotationId = searchParams.get("quotationId") || undefined;
  const documentId = searchParams.get("documentId") || undefined;

  if (experience.isSimpleMode && !experience.canShowAdvancedDealOptions && type !== "delivery_note_from_quotation") {
    return <Navigate to="/home" replace />;
  }

  if (type === "billing_note") {
    return <BillingNoteForm dealId={dealId} />;
  }

  if (type === "credit_note") {
    return <CreditNoteForm dealId={dealId} />;
  }

  if (type === "invoice_from_delivery_notes") {
    return <InvoiceFromDeliveryNotesForm />;
  }

  if (type === "invoice_from_quotation") {
    return <InvoiceFromQuotationForm />;
  }

  if (type === "delivery_note_from_quotation" && quotationId) {
    return <DeliveryNoteFromQuotationForm quotationId={quotationId} documentId={documentId} />;
  }

  const nextParams = new URLSearchParams(searchParams);
  return <Navigate to={`/deals/new?${nextParams.toString()}`} replace />;
}
