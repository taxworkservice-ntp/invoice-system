import { Navigate, useParams } from "react-router-dom";
import { BillingNoteForm } from "../../../components/documents/BillingNoteForm";
import { CreditNoteForm } from "../../../components/documents/CreditNoteForm";
import { DeliveryNoteFromQuotationForm } from "../../../components/documents/DeliveryNoteFromQuotationForm";
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
  const [quotationId, setQuotationId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !profile) return;
    let cancelled = false;

    async function loadEditTarget() {
      setLoading(true);
      setError("");

      const { data } = await supabase
        .from("documents")
        .select("doc_type, deal_id, status, converted_from_id")
        .eq("id", id)
        .single();

      if (!data || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      setDocType(data.doc_type);
      setDealId(data.deal_id);
      setStatus(data.status);

      if (data.doc_type === "delivery_note" && data.status === "draft") {
        let sourceQuotationId = data.converted_from_id || null;

        if (!sourceQuotationId) {
          const { data: lines } = await supabase
            .from("document_line_items")
            .select("source_document_id")
            .eq("document_id", id)
            .not("source_document_id", "is", null)
            .limit(1);
          sourceQuotationId = lines?.[0]?.source_document_id || null;
        }

        if (!cancelled) {
          if (sourceQuotationId) {
            setQuotationId(sourceQuotationId);
          } else {
            setError("ไม่พบใบเสนอราคาต้นทางของร่างใบส่งของนี้");
          }
        }
      }

      if (!cancelled) setLoading(false);
    }

    void loadEditTarget();
    return () => {
      cancelled = true;
    };
  }, [id, profile]);

  if (!id) return <Navigate to="/documents" replace />;
  if (loading) return <AppShell title="กำลังโหลด..." showBack><Spinner /></AppShell>;
  if (error) return <AppShell title="แก้ไขเอกสาร" showBack><div className="py-12 text-center text-sm text-red-600">{error}</div></AppShell>;

  if (docType === "credit_note") {
    return <CreditNoteForm documentId={id} />;
  }

  if (docType === "billing_note") {
    return <BillingNoteForm documentId={id} />;
  }

  if (docType === "invoice" && status === "draft") {
    return <NewDealPage documentId={id} initialType="invoice" />;
  }

  if (docType === "delivery_note" && status === "draft" && quotationId) {
    return <DeliveryNoteFromQuotationForm quotationId={quotationId} documentId={id} />;
  }

  if (dealId) {
    return <Navigate to={`/deals/${dealId}`} replace />;
  }

  return <Navigate to={`/documents/${id}`} replace />;
}
