import { Navigate, useSearchParams } from "react-router-dom";
import { BillingNoteForm } from "../../../components/documents/BillingNoteForm";
import { CreditNoteForm } from "../../../components/documents/CreditNoteForm";

export default function NewDocumentPage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type");
  const dealId = searchParams.get("dealId") || undefined;

  if (type === "billing_note") {
    return <BillingNoteForm dealId={dealId} />;
  }

  if (type === "credit_note") {
    return <CreditNoteForm dealId={dealId} />;
  }

  const nextParams = new URLSearchParams(searchParams);
  return <Navigate to={`/deals/new?${nextParams.toString()}`} replace />;
}
