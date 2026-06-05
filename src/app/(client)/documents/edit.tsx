import { Navigate, useParams } from "react-router-dom";
import { BillingNoteForm } from "../../../components/documents/BillingNoteForm";
import { CreditNoteForm } from "../../../components/documents/CreditNoteForm";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { useState, useEffect } from "react";
import { Spinner } from "../../../components/ui/Spinner";
import { AppShell } from "../../../components/layout/AppShell";

export default function EditDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [docType, setDocType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !profile) return;
    supabase
      .from("documents")
      .select("doc_type")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) setDocType(data.doc_type);
        setLoading(false);
      });
  }, [id, profile]);

  if (!id) return <Navigate to="/documents" replace />;
  if (loading) return <AppShell title="กำลังโหลด..." showBack><Spinner /></AppShell>;

  if (docType === "credit_note") {
    return <CreditNoteForm documentId={id} />;
  }

  return <BillingNoteForm documentId={id} />;
}
