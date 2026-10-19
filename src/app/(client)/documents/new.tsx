import { Navigate, useSearchParams } from "react-router-dom";
import { BillingNoteForm } from "../../../components/documents/BillingNoteForm";
import { CreditNoteForm } from "../../../components/documents/CreditNoteForm";
import { DeliveryNoteFromQuotationForm } from "../../../components/documents/DeliveryNoteFromQuotationForm";
import { InvoiceFromDeliveryNotesForm } from "../../../components/documents/InvoiceFromDeliveryNotesForm";
import { InvoiceFromQuotationForm } from "../../../components/documents/InvoiceFromQuotationForm";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { resolveCreation } from "../../../lib/docCreation";
import { getWorkspaceExperience, getWorkspacePermissions } from "../../../lib/permissions";

/**
 * Document creation entry point. The destination is decided by
 * `resolveCreation` — the only place allowed to interpret `?type=`.
 * Anything unknown or not permitted for this role leaves before a form mounts.
 */
export default function NewDocumentPage() {
  const [searchParams] = useSearchParams();
  const { workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const experience = getWorkspaceExperience(workspaceRole, permissions);

  const resolution = resolveCreation({
    type: searchParams.get("type"),
    params: searchParams,
    experience,
  });

  if (resolution.status === "denied") {
    return <Navigate to="/home" replace />;
  }

  if (resolution.status === "invalid") {
    return <Navigate to="/home" replace />;
  }

  // The shared deal form owns these modes.
  if (resolution.form === "deal") {
    return <Navigate to={resolution.path} replace />;
  }

  const dealId = searchParams.get("dealId") || undefined;
  const customerId = searchParams.get("customer_id") || undefined;
  const quotationId = searchParams.get("quotationId") || undefined;
  const documentId = searchParams.get("documentId") || undefined;

  switch (resolution.form) {
    case "billing_note":
      return <BillingNoteForm dealId={dealId} initialCustomerId={customerId} />;
    case "credit_note":
      return (
        <CreditNoteForm
          dealId={dealId}
          docType={resolution.type === "debit_note" ? "debit_note" : undefined}
        />
      );
    case "invoice_from_delivery_notes":
      return <InvoiceFromDeliveryNotesForm />;
    case "invoice_from_quotation":
      return <InvoiceFromQuotationForm />;
    case "delivery_note_from_quotation":
      // resolveCreation guarantees a quotationId for this form.
      return (
        <DeliveryNoteFromQuotationForm
          quotationId={quotationId as string}
          documentId={documentId}
        />
      );
  }

  return <Navigate to="/home" replace />;
}
