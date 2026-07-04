import { Navigate, useParams } from "react-router-dom";
import { BillingNoteForm } from "../../../components/documents/BillingNoteForm";
import { CreditNoteForm } from "../../../components/documents/CreditNoteForm";
import NewDealPage from "../deals/new";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { useState, useEffect } from "react";
import { Spinner } from "../../../components/ui/Spinner";
import { AppShell } from "../../../components/layout/AppShell";

export default function EditDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [docType, setDocType] = useState<string | null>(null);
  const [dealId, setDealId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !profile) return;
    supabase
      .from("documents")
      .select("doc_type, deal_id, status")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDocType(data.doc_type);
          setDealId(data.deal_id);
          setStatus(data.status);
        }
        setLoading(false);
      });
  }, [id, profile]);

  if (!id) return <Navigate to="/documents" replace />;
  if (loading) return <AppShell title="กำลังโหลด..." showBack><Spinner /></AppShell>;

  if (docType === "credit_note") {
    return <CreditNoteForm documentId={id} />;
  }

  if (docType === "billing_note") {
    return <BillingNoteForm documentId={id} />;
  }

  if (docType === "invoice" && status === "draft") {
    return <NewDealPage documentId={id} initialType="invoice" />;
  }

  if (dealId) {
    return <Navigate to={`/deals/${dealId}`} replace />;
  }

  return <Navigate to={`/documents/${id}`} replace />;
}
