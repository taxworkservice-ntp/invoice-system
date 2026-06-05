import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MoreHorizontal, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Spinner } from "../../../components/ui/Spinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { supabase } from "../../../lib/supabase";
import { generateDocNumberBE } from "../../../lib/docNumber";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { isHtmlPrintTemplate } from "../../../lib/print";
import { deductStockOnDocumentSent } from "../../../lib/stock";
import { DOC_TYPE_LABELS, PAYMENT_METHOD_LABELS, STATUS_LABELS, VAT_DEFAULT } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import type {
  Document,
  DocumentLineItem,
  BillingNoteInvoice,
  Deal,
  Customer,
  ClientProfile,
  DocumentStatus,
  DocumentType,
} from "../../../types";

interface DocWithMeta {
  document: Document;
  stage: "quote" | "invoice" | "collect" | "done";
  line_items: DocumentLineItem[];
  billing_invoices: BillingNoteInvoice[];
}

type MainAction =
  | { type: "send_draft"; doc: Document; label: string; danger?: boolean }
  | { type: "convert"; doc: Document; label: string }
  | { type: "billing"; doc: Document; label: string }
  | { type: "collect"; doc: Document; label: string; danger?: boolean }
  | { type: "done"; label: string }
  | null;

function getDocStage(doc: Document): "quote" | "invoice" | "collect" | "done" {
  if (doc.status === "voided" || doc.status === "converted") return "done";
  if (doc.doc_type === "quotation") return "quote";
  if (doc.doc_type === "tax_invoice_receipt") return "done";
  if (doc.doc_type === "invoice" && doc.status !== "paid") return "invoice";
  if (doc.doc_type === "billing_note" && doc.status !== "paid") return "collect";
  if (doc.status === "paid" || doc.status === "generated") return "done";
  if (doc.doc_type === "receipt" || doc.doc_type === "delivery_note") return "done";
  if (doc.doc_type === "credit_note") {
    if (doc.status === "draft") return "collect";
    if (doc.status === "sent" || doc.status === "issued") return "done";
    return "done";
  }
  return "invoice";
}

function isOverdueDocument(doc: Document) {
  if (doc.status === "overdue") return true;
  if (doc.doc_type !== "billing_note" || !doc.due_date) return false;
  return new Date(doc.due_date) < new Date(new Date().toISOString().slice(0, 10)) && doc.status !== "paid";
}

function getDocumentAmount(doc: Document) {
  if (doc.doc_type === "quotation" || doc.doc_type === "invoice" || doc.doc_type === "tax_invoice_receipt") return doc.total_amount;
  return doc.net_payable;
}

function buildItemSummary(lineItems: DocumentLineItem[]) {
  if (lineItems.length === 0) return "";
  const summary = lineItems
    .slice(0, 2)
    .map((item) => `${item.item_name} × ${item.quantity}`)
    .join(", ");
  return lineItems.length > 2 ? `${summary} และอีก ${lineItems.length - 2} รายการ` : summary;
}

function getStatusPill(doc: Document | null) {
  if (!doc) return { label: "ยังไม่มีเอกสาร", className: "bg-stone-100 text-stone-500" };
  if (doc.status === "draft") return { label: "ร่าง", className: "bg-draft-bg text-draft-text" };
  if (doc.status === "paid") return { label: "ชำระแล้ว", className: "bg-paid-bg text-paid-text" };
  if (isOverdueDocument(doc)) return { label: "เกินกำหนด", className: "bg-overdue-bg text-overdue-text" };
  if (doc.doc_type === "quotation" && doc.status === "sent") return { label: "รอลูกค้าตอบ", className: "bg-amber-100 text-amber-700" };
  if (doc.doc_type === "invoice" && (doc.status === "sent" || doc.status === "in_billing")) {
    return { label: "รอวางบิล", className: "bg-sent-bg text-sent-text" };
  }
  if (doc.doc_type === "billing_note" && doc.status === "sent") return { label: "รอชำระ", className: "bg-sent-bg text-sent-text" };
  return { label: STATUS_LABELS[doc.status] || doc.status, className: "bg-stone-100 text-stone-600" };
}

export default function DealDetailPage() {
  const { id: dealId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;

  const [deal, setDeal] = useState<Deal | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [docsWithMeta, setDocsWithMeta] = useState<DocWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidDocument, setVoidDocument] = useState<Document | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payDocument, setPayDocument] = useState<Document | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [amountReceived, setAmountReceived] = useState(0);
  const [whtCertificateNo, setWhtCertificateNo] = useState("");
  const [paying, setPaying] = useState(false);

  const [confirmConvertDoc, setConfirmConvertDoc] = useState<Document | null>(null);
  const [confirmBillingDoc, setConfirmBillingDoc] = useState<Document | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyingDeal, setCopyingDeal] = useState(false);

  const toast = useToast();
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchDealData = useCallback(async () => {
    if (!dealId || !userId) return;
    setLoading(true);

    const { data: dealData } = await supabase
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .single();

    if (!dealData) {
      setLoading(false);
      return;
    }

    const currentDeal = dealData as Deal;
    setDeal(currentDeal);

    const [
      { data: clientData },
      { data: customerData },
      { data: docsData },
    ] = await Promise.all([
      supabase.from("client_profiles").select("*").eq("user_id", userId).single(),
      supabase.from("customers").select("*").eq("id", currentDeal.customer_id).single(),
      supabase.from("documents").select("*").eq("deal_id", dealId).order("created_at", { ascending: true }),
    ]);

    if (clientData) setClientProfile(clientData as ClientProfile);
    if (customerData) setCustomer(customerData as Customer);

    const docs = (docsData || []) as Document[];
    const docIds = docs.map((doc) => doc.id);
    const billingNoteIds = docs.filter((doc) => doc.doc_type === "billing_note").map((doc) => doc.id);

    const [
      { data: lineItemsData },
      { data: billingInvoicesData },
    ] = await Promise.all([
      docIds.length
        ? supabase.from("document_line_items").select("*").in("document_id", docIds).order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as DocumentLineItem[] }),
      billingNoteIds.length
        ? supabase.from("billing_note_invoices").select("*").in("billing_note_id", billingNoteIds)
        : Promise.resolve({ data: [] as BillingNoteInvoice[] }),
    ]);

    const lineItemsByDoc = new Map<string, DocumentLineItem[]>();
    ((lineItemsData || []) as DocumentLineItem[]).forEach((item) => {
      const current = lineItemsByDoc.get(item.document_id) || [];
      current.push(item);
      lineItemsByDoc.set(item.document_id, current);
    });

    const billingByDoc = new Map<string, BillingNoteInvoice[]>();
    ((billingInvoicesData || []) as BillingNoteInvoice[]).forEach((item) => {
      const current = billingByDoc.get(item.billing_note_id) || [];
      current.push(item);
      billingByDoc.set(item.billing_note_id, current);
    });

    setDocsWithMeta(
      docs.map((doc) => ({
        document: doc,
        stage: getDocStage(doc),
        line_items: lineItemsByDoc.get(doc.id) || [],
        billing_invoices: billingByDoc.get(doc.id) || [],
      }))
    );

    setLoading(false);
  }, [dealId, userId]);

  useEffect(() => {
    fetchDealData();
  }, [fetchDealData]);

  const handleViewPDF = async (doc: Document, lineItems: DocumentLineItem[], billingInvoices: BillingNoteInvoice[]) => {
    if (!customer || !clientProfile) return;
    setPdfLoadingId(doc.id);
    try {
      if (isHtmlPrintTemplate(clientProfile.pdf_template)) {
        const previewUrl = `/documents/${doc.id}/print`;
        window.open(previewUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const { generatePDFBlob } = await import("../../../lib/pdf");

      let referenceDoc: Document | undefined;
      if (doc.doc_type === "credit_note" && doc.converted_from_id) {
        const { data: refDoc } = await supabase
          .from("documents")
          .select("*")
          .eq("id", doc.converted_from_id)
          .single();
        if (refDoc) referenceDoc = refDoc as unknown as Document;
      }

      const blob = await generatePDFBlob({
        document: doc,
        lineItems: doc.doc_type === "billing_note" ? [] : lineItems,
        billingNoteInvoices: doc.doc_type === "billing_note" ? billingInvoices : [],
        clientProfile,
        customer,
        referenceDoc,
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("ไม่สามารถสร้าง PDF ได้");
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleSendDraft = async (doc: Document) => {
    if (!userId) return;
    setActionLoadingId(doc.id);
    try {
      await supabase
        .from("documents")
        .update({ status: "sent" as DocumentStatus })
        .eq("id", doc.id);

      if (doc.doc_type === "invoice") {
        const { warnings } = await deductStockOnDocumentSent(doc.id, userId);
        warnings.forEach((w) =>
          toast.info(`⚠ ${w.itemName} สต็อกไม่พอ (มี ${w.available} ${w.unit} แต่ใช้ ${w.requested} ${w.unit})`)
        );
      }

      toast.success("อัปเดตสถานะเอกสารแล้ว");
      fetchDealData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConvertToInvoice = async (quotation: Document) => {
    if (!userId || !dealId || !customer) return;
    setActionLoadingId(quotation.id);
    try {
      const docNumber = await generateDocNumberBE(userId, "invoice");
      const now = new Date().toISOString().slice(0, 10);

      const lineItems = docsWithMeta.find((item) => item.document.id === quotation.id)?.line_items || [];

      const { data: invoiceDoc, error } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          deal_id: dealId,
          customer_id: customer.id,
          doc_type: "invoice",
          doc_number: docNumber,
          status: "sent",
          issue_date: now,
          vat_registered: quotation.vat_registered,
          vat_rate: quotation.vat_rate,
          wht_rate: quotation.wht_rate,
          discount_percent: quotation.discount_percent,
          discount_amount: quotation.discount_amount,
          subtotal: quotation.subtotal,
          vat_amount: quotation.vat_amount,
          total_amount: quotation.total_amount,
          wht_amount: quotation.wht_amount,
          net_payable: quotation.net_payable,
          converted_from_id: quotation.id,
        })
        .select("*")
        .single();
      if (error) throw error;

      if (lineItems.length > 0) {
        await supabase.from("document_line_items").insert(
          lineItems.map((li, idx) => ({
            document_id: invoiceDoc.id,
            user_id: userId,
            item_id: li.item_id,
            item_name: li.item_name,
            item_type: li.item_type,
            unit: li.unit,
            unit_price: li.unit_price,
            quantity: li.quantity,
            discount_percent: li.discount_percent,
            discount_amount: li.discount_amount,
            qty_carton: li.qty_carton,
            carton_unit: li.carton_unit,
            line_total: li.line_total,
            sort_order: idx,
          }))
        );
      }

      await deductStockOnDocumentSent(invoiceDoc.id, userId);

      await supabase
        .from("documents")
        .update({ status: "converted" as DocumentStatus })
        .eq("id", quotation.id);

      toast.success("แปลงเป็นใบแจ้งหนี้สำเร็จ");
      fetchDealData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateBillingNote = async (invoice: Document) => {
    if (!dealId) return;
    setConfirmBillingDoc(null);
    navigate(`/documents/new?type=billing_note&dealId=${dealId}`);
    return;
    if (!userId || !dealId || !customer) return;
    setActionLoadingId(invoice.id);
    try {
      const docNumber = await generateDocNumberBE(userId!, "billing_note");
      const now = new Date().toISOString().slice(0, 10);

      const { data: bnDoc, error } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          deal_id: dealId,
          customer_id: customer!.id,
          doc_type: "billing_note",
          doc_number: docNumber,
          status: "draft",
          issue_date: now,
          vat_registered: invoice.vat_registered,
          vat_rate: invoice.vat_rate,
          wht_rate: invoice.wht_rate,
          discount_percent: invoice.discount_percent,
          discount_amount: invoice.discount_amount,
          subtotal: invoice.subtotal,
          vat_amount: invoice.vat_amount,
          total_amount: invoice.total_amount,
          wht_amount: invoice.wht_amount,
          net_payable: invoice.net_payable,
          converted_from_id: invoice.id,
        })
        .select("*")
        .single();
      if (error) throw error;

      await supabase.from("billing_note_invoices").insert({
        billing_note_id: bnDoc.id,
        invoice_id: invoice.id,
        user_id: userId,
        invoice_number: invoice.doc_number || "",
        issue_date: invoice.issue_date || null,
        subtotal: invoice.subtotal,
        vat_amount: invoice.vat_amount,
        total_amount: invoice.total_amount,
      });

      await supabase
        .from("documents")
        .update({ status: "in_billing" as DocumentStatus })
        .eq("id", invoice.id);

      toast.success("สร้างใบวางบิลสำเร็จ");
      fetchDealData();
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenPaymentModal = (doc: Document) => {
    setPayDocument(doc);
    setAmountReceived(doc.net_payable);
    setPaymentMethod("bank_transfer");
    setWhtCertificateNo("");
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!payDocument || !userId || !dealId) return;
    setPaying(true);
    try {
      const now = new Date().toISOString();

      await supabase
        .from("documents")
        .update({
          status: "paid" as DocumentStatus,
          paid_at: now,
          payment_method: paymentMethod,
          amount_received: amountReceived,
          wht_certificate_no: whtCertificateNo || null,
        })
        .eq("id", payDocument.id);

      const { data: linked } = await supabase
        .from("billing_note_invoices")
        .select("invoice_id")
        .eq("billing_note_id", payDocument.id);

      const linkedInvoiceIds = (linked || []).map((item: { invoice_id: string }) => item.invoice_id);
      if (linkedInvoiceIds.length > 0) {
        await supabase
          .from("documents")
          .update({ status: "paid" as DocumentStatus, paid_at: now })
          .in("id", linkedInvoiceIds);
      }

      const docNumber = await generateDocNumberBE(userId, "receipt");
      const today = now.slice(0, 10);

      await supabase.from("documents").insert({
        user_id: userId,
        deal_id: dealId,
        customer_id: payDocument.customer_id,
        doc_type: "receipt",
        doc_number: docNumber,
        status: "generated" as DocumentStatus,
        issue_date: today,
        vat_registered: payDocument.vat_registered,
        vat_rate: payDocument.vat_rate,
        wht_rate: payDocument.wht_rate,
        discount_percent: payDocument.discount_percent,
        discount_amount: payDocument.discount_amount,
        subtotal: payDocument.subtotal,
        vat_amount: payDocument.vat_amount,
        total_amount: payDocument.total_amount,
        wht_amount: payDocument.wht_amount,
        net_payable: amountReceived,
        payment_method: paymentMethod,
        amount_received: amountReceived,
        wht_certificate_no: whtCertificateNo || null,
        paid_at: now,
      });

      toast.success("บันทึกรับเงินสำเร็จ");
      setPaymentModalOpen(false);
      setPayDocument(null);
      fetchDealData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setPaying(false);
    }
  };

  const handleCreateDeliveryNote = async () => {
    if (!userId || !dealId || !customer) return;
    setActionLoadingId("delivery");
    try {
      const docNumber = await generateDocNumberBE(userId, "delivery_note");
      const now = new Date().toISOString().slice(0, 10);

      const quotationOrInvoice = docsWithMeta.find(
        (d) => d.document.doc_type === "quotation" || d.document.doc_type === "invoice"
      );

      const { data: dnDoc, error } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          deal_id: dealId,
          customer_id: customer.id,
          doc_type: "delivery_note",
          doc_number: docNumber,
          status: "generated" as DocumentStatus,
          issue_date: now,
          vat_registered: quotationOrInvoice?.document.vat_registered ?? false,
          vat_rate: quotationOrInvoice?.document.vat_rate ?? VAT_DEFAULT,
          wht_rate: quotationOrInvoice?.document.wht_rate ?? 0,
          discount_percent: quotationOrInvoice?.document.discount_percent ?? 0,
          discount_amount: quotationOrInvoice?.document.discount_amount ?? 0,
          subtotal: 0,
          vat_amount: 0,
          total_amount: 0,
          wht_amount: 0,
          net_payable: 0,
        })
        .select("*")
        .single();
      if (error) throw error;

      if (quotationOrInvoice && quotationOrInvoice.line_items.length > 0) {
        await supabase.from("document_line_items").insert(
          quotationOrInvoice.line_items.map((li, idx) => ({
            document_id: dnDoc.id,
            user_id: userId,
            item_id: li.item_id,
            item_name: li.item_name,
            item_type: li.item_type,
            unit: li.unit,
            unit_price: li.unit_price,
            quantity: li.quantity,
            discount_percent: li.discount_percent,
            discount_amount: li.discount_amount,
            qty_carton: li.qty_carton,
            carton_unit: li.carton_unit,
            line_total: li.line_total,
            sort_order: idx,
          }))
        );
      }

      toast.success("สร้างใบส่งของสำเร็จ");
      fetchDealData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateCreditNote = () => {
    navigate(`/documents/new?type=credit_note&dealId=${dealId}`);
  };

  const handleOpenVoidModal = (doc: Document) => {
    setVoidDocument(doc);
    setVoidReason("");
    setVoidModalOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!voidDocument || !userId || !dealId) return;
    setVoiding(true);
    try {
      const now = new Date().toISOString().slice(0, 10);

      await supabase
        .from("documents")
        .update({
          status: "voided" as DocumentStatus,
          voided_at: new Date().toISOString(),
          voided_reason: voidReason || null,
        })
        .eq("id", voidDocument.id);

      const newDocNumber = await generateDocNumberBE(userId, voidDocument.doc_type);

      const { data: newDoc } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          deal_id: dealId,
          customer_id: voidDocument.customer_id,
          doc_type: voidDocument.doc_type,
          doc_number: newDocNumber,
          status: "draft" as DocumentStatus,
          issue_date: now,
          vat_registered: voidDocument.vat_registered,
          vat_rate: voidDocument.vat_rate,
          wht_rate: voidDocument.wht_rate,
          discount_percent: voidDocument.discount_percent,
          discount_amount: voidDocument.discount_amount,
          subtotal: voidDocument.subtotal,
          vat_amount: voidDocument.vat_amount,
          total_amount: voidDocument.total_amount,
          wht_amount: voidDocument.wht_amount,
          net_payable: voidDocument.net_payable,
          copied_from_id: voidDocument.id,
        })
        .select("*")
        .single();

      if (newDoc) {
        const sourceDoc = docsWithMeta.find((item) => item.document.id === voidDocument.id);

        if (sourceDoc && sourceDoc.line_items.length > 0) {
          await supabase.from("document_line_items").insert(
            sourceDoc.line_items.map((li, idx) => ({
              document_id: newDoc.id,
              user_id: userId,
              item_id: li.item_id,
              item_name: li.item_name,
              item_type: li.item_type,
              unit: li.unit,
              unit_price: li.unit_price,
              quantity: li.quantity,
              discount_percent: li.discount_percent,
              discount_amount: li.discount_amount,
              qty_carton: li.qty_carton,
              carton_unit: li.carton_unit,
              line_total: li.line_total,
              sort_order: idx,
            }))
          );
        }

        if (voidDocument.doc_type === "billing_note" && sourceDoc && sourceDoc.billing_invoices.length > 0) {
          await supabase.from("billing_note_invoices").insert(
            sourceDoc.billing_invoices.map((bn) => ({
              billing_note_id: newDoc.id,
              invoice_id: bn.invoice_id,
              user_id: userId,
              invoice_number: bn.invoice_number,
              issue_date: bn.issue_date || null,
              subtotal: bn.subtotal,
              vat_amount: bn.vat_amount,
              total_amount: bn.total_amount,
            }))
          );
        }
      }

      toast.success("ยกเลิกและสร้างสำเนาใหม่สำเร็จ");
      setVoidModalOpen(false);
      setVoidDocument(null);
      fetchDealData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setVoiding(false);
    }
  };

  const handleCurrentDocAction = () => {
    if (!activeDoc) return;
    if (activeDoc.document.status === "draft") {
      if (activeDoc.document.doc_type === "billing_note") {
        navigate(`/documents/${activeDoc.document.id}/edit`);
        return;
      }
      navigate(`/documents/${activeDoc.document.id}`);
      return;
    }
    handleOpenVoidModal(activeDoc.document);
  };

  const handleCopyDeal = async () => {
    if (!userId || !customer) return;
    setCopyingDeal(true);
    try {
      const sourceDoc =
        docsWithMeta.find((item) => item.document.doc_type === "quotation") ||
        docsWithMeta.find((item) => item.document.doc_type === "invoice");

      const { data: newDeal, error: dealError } = await supabase
        .from("deals")
        .insert({
          user_id: userId,
          customer_id: customer.id,
          title: deal?.title || customer.name,
        })
        .select("*")
        .single();
      if (dealError || !newDeal) throw dealError || new Error("ไม่สามารถสร้างดีลใหม่ได้");

      if (sourceDoc) {
        const docNumber = await generateDocNumberBE(userId, "quotation");
        const { data: quotationDoc, error: docError } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            deal_id: newDeal.id,
            customer_id: customer.id,
            doc_type: "quotation",
            doc_number: docNumber,
            status: "draft" as DocumentStatus,
            issue_date: new Date().toISOString().slice(0, 10),
            vat_registered: sourceDoc.document.vat_registered,
            vat_rate: sourceDoc.document.vat_rate,
            wht_rate: sourceDoc.document.wht_rate,
            discount_percent: sourceDoc.document.discount_percent,
            discount_amount: sourceDoc.document.discount_amount,
            subtotal: sourceDoc.document.subtotal,
            vat_amount: sourceDoc.document.vat_amount,
            total_amount: sourceDoc.document.total_amount,
            wht_amount: sourceDoc.document.wht_amount,
            net_payable: sourceDoc.document.net_payable,
          })
          .select("*")
          .single();
        if (docError) throw docError;

        if (sourceDoc.line_items.length > 0) {
          await supabase.from("document_line_items").insert(
            sourceDoc.line_items.map((li, idx) => ({
              document_id: quotationDoc.id,
              user_id: userId,
              item_id: li.item_id,
              item_name: li.item_name,
              item_type: li.item_type,
              unit: li.unit,
              unit_price: li.unit_price,
              quantity: li.quantity,
              discount_percent: li.discount_percent,
              discount_amount: li.discount_amount,
              qty_carton: li.qty_carton,
              carton_unit: li.carton_unit,
              line_total: li.line_total,
              sort_order: idx,
            }))
          );
        }
      }

      setMenuOpen(false);
      toast.success("สร้างดีลใหม่จากรายการเดิมแล้ว");
      navigate(`/deals/${newDeal.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setCopyingDeal(false);
    }
  };

  const nonVoidedDocs = useMemo(
    () => docsWithMeta.filter((item) => item.document.status !== "voided"),
    [docsWithMeta]
  );

  const voidedDocs = useMemo(
    () => docsWithMeta.filter((item) => item.document.status === "voided"),
    [docsWithMeta]
  );

  const activeDoc = useMemo(() => {
    const unresolved = nonVoidedDocs.filter((item) => item.stage !== "done");
    if (unresolved.length > 0) return unresolved[unresolved.length - 1];
    return nonVoidedDocs[nonVoidedDocs.length - 1] || null;
  }, [nonVoidedDocs]);

  const amountDoc = useMemo(() => {
    return (
      [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "billing_note") ||
      [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "invoice") ||
      [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "quotation") ||
      null
    );
  }, [nonVoidedDocs]);

  const firstItemDoc = useMemo(
    () => nonVoidedDocs.find((item) => item.line_items.length > 0) || null,
    [nonVoidedDocs]
  );

  const itemSummary = useMemo(
    () => buildItemSummary(firstItemDoc?.line_items || []),
    [firstItemDoc]
  );

  const hasProductItems = useMemo(
    () => docsWithMeta.some((item) => item.line_items.some((line) => line.item_type === "product")),
    [docsWithMeta]
  );

  const allDone = nonVoidedDocs.length > 0 && nonVoidedDocs.every((item) => item.stage === "done");
  const hasPaidDocs = nonVoidedDocs.some(
    (item) => item.document.status === "paid" || (item.document.doc_type === "tax_invoice_receipt" && item.document.status === "issued")
  );
  const statusDoc = useMemo(() => {
    if (!allDone) return activeDoc?.document || null;

    const latestReceipt = [...nonVoidedDocs]
      .reverse()
      .find((item) => item.document.doc_type === "receipt");
    if (latestReceipt) return latestReceipt.document;

    const latestCombined = [...nonVoidedDocs]
      .reverse()
      .find((item) => item.document.doc_type === "tax_invoice_receipt");
    if (latestCombined) return latestCombined.document;

    const latestPaid = [...nonVoidedDocs]
      .reverse()
      .find((item) => item.document.status === "paid");
    if (latestPaid) return latestPaid.document;

    return activeDoc?.document || nonVoidedDocs[nonVoidedDocs.length - 1]?.document || null;
  }, [activeDoc, allDone, nonVoidedDocs]);
  const title = deal?.title || customer?.name || "ดีล";
  const statusPill = getStatusPill(statusDoc);
  const isOverdue = statusDoc ? isOverdueDocument(statusDoc) : false;
  const amountLabel =
    amountDoc?.document.doc_type === "billing_note"
      ? "ยอดที่ต้องรับ"
      : amountDoc?.document.doc_type === "invoice"
        ? "ยอดในใบแจ้งหนี้"
        : "ยอดในใบเสนอราคา";

  const currentStage = allDone
    ? 4
    : activeDoc?.document.doc_type === "quotation"
      ? 1
      : activeDoc?.document.doc_type === "invoice"
        ? 2
        : activeDoc?.document.doc_type === "billing_note"
          ? 3
          : 4;

  const skippedStage1 = !nonVoidedDocs.some((item) => item.document.doc_type === "quotation");

  const mainAction: MainAction = useMemo(() => {
    if (!activeDoc) return null;
    const doc = activeDoc.document;
    if (allDone) return { type: "done", label: "เสร็จสิ้น ✓" };
    if (doc.status === "draft") {
      return {
        type: "send_draft",
        doc,
        label:
          doc.doc_type === "quotation"
            ? "ส่งใบเสนอราคาแล้ว"
            : doc.doc_type === "invoice"
              ? "ส่งใบแจ้งหนี้แล้ว"
              : "ส่งใบวางบิลแล้ว",
      };
    }
    if (doc.doc_type === "quotation" && doc.status === "sent") {
      return { type: "convert", doc, label: "ลูกค้าตกลงแล้ว" };
    }
    if (doc.doc_type === "invoice" && doc.status === "sent") {
      return { type: "billing", doc, label: "วางบิล" };
    }
    if (doc.doc_type === "billing_note" && (doc.status === "sent" || doc.status === "overdue")) {
      return {
        type: "collect",
        doc,
        label: isOverdueDocument(doc) ? "เกินกำหนด — รับเงินแล้ว?" : "รับเงินแล้ว",
        danger: isOverdueDocument(doc),
      };
    }
    return null;
  }, [activeDoc, allDone]);

  const actionHint = useMemo(() => {
    if (!activeDoc?.document.doc_number) return "";
    if (activeDoc.document.due_date) {
      return `ครบกำหนด ${formatBuddhistDate(activeDoc.document.due_date)} • ${activeDoc.document.doc_number}`;
    }
    return activeDoc.document.doc_number;
  }, [activeDoc]);

  if (loading) {
    return (
      <AppShell title="ดีล" showBack>
        <div className="space-y-3 animate-pulse">
          <div className="h-16 rounded-card bg-stone-200" />
          <div className="h-44 rounded-card bg-stone-200" />
          <div className="h-72 rounded-card bg-stone-200" />
          <div className="h-24 rounded-card bg-stone-200" />
        </div>
      </AppShell>
    );
  }

  if (!deal) {
    return (
      <AppShell title="ดีล" showBack>
        <EmptyState title="ไม่พบข้อมูลดีลนี้" description="ดีลนี้อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึง" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={title}
      showBack
      action={(
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="เมนูเพิ่มเติม"
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      )}
    >
      <div className="space-y-3">
        <Card className="border-[0.5px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-gray-900 truncate">{customer?.name || title}</div>
              {itemSummary ? (
                <div className="mt-1 text-xs text-gray-500 leading-5">{itemSummary}</div>
              ) : customer?.address ? (
                <div className="mt-1 text-xs text-gray-500 leading-5 line-clamp-2">{customer.address}</div>
              ) : (
                <div className="mt-1 text-xs text-gray-400">ยังไม่มีรายการสินค้า</div>
              )}
              <span className={`mt-2 inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${statusPill.className}`}>
                {statusPill.label}
              </span>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold text-gray-900">฿{formatCurrency(amountDoc ? getDocumentAmount(amountDoc.document) : 0)}</div>
              <div className="mt-1 text-[11px] text-gray-500">{amountLabel}</div>
            </div>
          </div>
          {isOverdue && activeDoc?.document.due_date && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>เอกสารนี้เกินกำหนดชำระแล้ว ตั้งแต่ {formatBuddhistDate(activeDoc.document.due_date)}</span>
            </div>
          )}
        </Card>

        <Card className="border-[0.5px]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">ขั้นตอน</div>
            <div className="text-[11px] text-gray-400">{currentStage}/4</div>
          </div>
          <div className="flex items-start mb-4">
            {[
              { step: 1, top: "ใบเสนอ", bottom: "ราคา" },
              { step: 2, top: "ใบแจ้ง", bottom: "หนี้" },
              { step: 3, top: "วางบิล", bottom: "เก็บเงิน" },
              { step: 4, top: "เสร็จ", bottom: "สิ้น" },
            ].map((stage, index) => {
              const isDone = currentStage > stage.step || (allDone && stage.step === 4);
              const isActive = currentStage === stage.step && !allDone;
              const isSkipped = stage.step === 1 && skippedStage1;
              const connectorDone = index < 3 && currentStage > stage.step + 0;
              return (
                <div key={stage.step} className="flex items-start flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={[
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold relative z-[1]",
                        isSkipped ? "bg-stone-100 text-stone-400" : "",
                        isDone ? "bg-paid-bg text-paid-text" : "",
                        isActive ? "bg-primary text-white shadow-[0_0_0_4px_rgba(55,138,221,0.12)]" : "",
                        !isDone && !isActive && !isSkipped ? "bg-stone-100 text-stone-400" : "",
                      ].join(" ")}
                    >
                      {isSkipped ? "–" : isDone ? "✓" : stage.step}
                    </div>
                    <div className={`mt-1.5 text-[10px] leading-4 text-center ${isDone ? "text-paid-text" : isActive ? "text-primary font-semibold" : "text-gray-500"}`}>
                      {stage.top}
                      <br />
                      {stage.bottom}
                    </div>
                  </div>
                  {index < 3 && (
                    <div className={`mt-[15px] h-0.5 flex-1 ${connectorDone ? "bg-green-200" : "bg-card-border"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {mainAction?.type === "done" ? (
            <div className="text-center text-sm font-semibold text-paid-text py-1">{mainAction.label}</div>
          ) : mainAction ? (
            <>
              <Button
                className={`w-full justify-center py-3 text-sm ${"danger" in mainAction && mainAction.danger ? "!bg-[#C0392B] hover:!bg-[#A93226]" : ""}`}
                loading={actionLoadingId === mainAction.doc.id}
                onClick={() => {
                  if (mainAction.type === "send_draft") handleSendDraft(mainAction.doc);
                  if (mainAction.type === "convert") setConfirmConvertDoc(mainAction.doc);
                  if (mainAction.type === "billing") setConfirmBillingDoc(mainAction.doc);
                  if (mainAction.type === "collect") handleOpenPaymentModal(mainAction.doc);
                }}
              >
                {mainAction.label}
              </Button>
              {actionHint && (
                <div className={`mt-2 text-center text-[11px] ${isOverdue ? "text-red-700" : "text-gray-500"}`}>{actionHint}</div>
              )}
            </>
          ) : (
            <div className="text-center text-xs text-gray-500">ไม่มีการดำเนินการที่ต้องทำตอนนี้</div>
          )}
        </Card>

        <div>
          <div className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">ประวัติเอกสาร</div>
          {nonVoidedDocs.length === 0 ? (
            <Card className="border-[0.5px]">
              <EmptyState title="ยังไม่มีเอกสาร" description="กดปุ่มด้านบนเพื่อเริ่มต้นขั้นตอนของดีลนี้" />
            </Card>
          ) : (
            <div className="space-y-0">
              {nonVoidedDocs.map((item, index) => {
                const doc = item.document;
                const isCurrent = activeDoc?.document.id === doc.id;
                const overdue = isOverdueDocument(doc);
                return (
                  <div key={doc.id} className="flex gap-3">
                    <div className="w-7 flex flex-col items-center shrink-0">
                      <div
                        className={[
                          "mt-1 rounded-full",
                          isCurrent ? "w-3 h-3 bg-primary shadow-[0_0_0_3px_rgba(55,138,221,0.12)]" : "w-2.5 h-2.5",
                          doc.status === "draft" ? "bg-stone-300" : "",
                          doc.status === "paid" || doc.status === "generated" ? "bg-paid-text" : "",
                          doc.status === "converted" ? "bg-stone-400" : "",
                          overdue ? "bg-[#C0392B]" : "",
                          (doc.status === "sent" || doc.status === "in_billing") && !overdue && !isCurrent ? "bg-primary" : "",
                        ].join(" ")}
                      />
                      {index < nonVoidedDocs.length - 1 && <div className="mt-1 w-px flex-1 bg-card-border" />}
                    </div>
                    <Card
                      className={`mb-2 flex-1 border-[0.5px] ${isCurrent ? "border-primary bg-blue-50/30" : ""}`}
                      onClick={() => navigate(`/documents/${doc.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold ${isCurrent ? "text-primary" : "text-gray-900"}`}>
                            {documentTypeLabel(doc.doc_type, doc.vat_registered).thai}
                          </div>
                          <div className={`mt-0.5 text-[11px] ${doc.status === "voided" ? "line-through" : "text-gray-500"}`}>
                            {doc.doc_number || "ยังไม่มีเลขเอกสาร"}
                          </div>
                          <div className="mt-1 text-[10px] text-gray-400">
                            {formatBuddhistDate(doc.issue_date)}
                            {doc.due_date ? (
                              <>
                                {" • ครบ "}
                                <span className={overdue ? "text-red-700" : ""}>{formatBuddhistDate(doc.due_date)}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="text-[13px] font-semibold text-gray-900">฿{formatCurrency(getDocumentAmount(doc))}</div>
                          <Badge status={overdue ? "overdue" : doc.status} />
                          <button
                            className="text-[10px] text-primary hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleViewPDF(doc, item.line_items, item.billing_invoices);
                            }}
                          >
                            {pdfLoadingId === doc.id ? "..." : "ดู PDF"}
                          </button>
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}

              {voidedDocs.length > 0 && (
                <button
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
                  onClick={() => setShowVoided((prev) => !prev)}
                >
                  {showVoided ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  แสดงเอกสารที่ยกเลิก ({voidedDocs.length})
                </button>
              )}

              {showVoided && voidedDocs.map((item) => {
                const doc = item.document;
                return (
                  <div key={doc.id} className="flex gap-3 opacity-50">
                    <div className="w-7 flex flex-col items-center shrink-0">
                      <div className="mt-1 w-2.5 h-2.5 rounded-full bg-stone-300" />
                    </div>
                    <Card className="mb-2 flex-1 border-[0.5px]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-700">{documentTypeLabel(doc.doc_type, doc.vat_registered).thai}</div>
                          <div className="mt-0.5 text-[11px] text-gray-500 line-through">{doc.doc_number || "ยังไม่มีเลขเอกสาร"}</div>
                          <div className="mt-1 text-[10px] text-gray-400">{formatBuddhistDate(doc.issue_date)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="text-[13px] font-semibold text-gray-800">฿{formatCurrency(getDocumentAmount(doc))}</div>
                          <Badge status="voided" />
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Card className="border-[0.5px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">เพิ่มเติม</div>
          {activeDoc && (
            <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700">
              {activeDoc.document.status === "draft"
                ? "Draft documents can be edited directly."
                : "For sent or later documents, this action voids the current version and creates a fresh draft copy."}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {hasProductItems && (
              <Button
                variant="secondary"
                className="justify-center !bg-page-bg"
                loading={actionLoadingId === "delivery"}
                onClick={handleCreateDeliveryNote}
              >
                บันทึกการส่งของ
              </Button>
            )}
            <Button variant="secondary" className="justify-center !bg-page-bg" onClick={handleCurrentDocAction}>
              {activeDoc?.document.status === "draft" ? "แก้ไขฉบับร่าง" : "ยกเลิก / แก้ไข"}
            </Button>
            {allDone && hasPaidDocs && (
              <Button
                variant="secondary"
                className={`justify-center !bg-page-bg ${hasProductItems ? "" : "col-span-2"}`}
                onClick={handleCreateCreditNote}
              >
                ออกใบลดหนี้
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="ตัวเลือกเพิ่มเติม">
        <div className="space-y-2">
          <Button variant="secondary" className="w-full justify-center" loading={copyingDeal} onClick={handleCopyDeal}>
            สร้างดีลใหม่จากรายการนี้
          </Button>
        </div>
      </Modal>

      <Modal open={confirmConvertDoc !== null} onClose={() => setConfirmConvertDoc(null)} title="ยืนยันการแปลงเป็นใบแจ้งหนี้">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">คุณต้องการแปลงใบเสนอราคาเป็นใบแจ้งหนี้ใช่หรือไม่?</p>
          {confirmConvertDoc && (
            <p className="text-sm">
              ยอดรวม: <span className="font-semibold">฿{formatCurrency(confirmConvertDoc.net_payable)}</span>
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmConvertDoc(null)}>ยกเลิก</Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={actionLoadingId === confirmConvertDoc?.id}
              onClick={() => {
                if (confirmConvertDoc) {
                  handleConvertToInvoice(confirmConvertDoc);
                  setConfirmConvertDoc(null);
                }
              }}
            >
              {actionLoadingId === confirmConvertDoc?.id ? "..." : "ยืนยัน"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmBillingDoc !== null} onClose={() => setConfirmBillingDoc(null)} title="ยืนยันการสร้างใบวางบิล">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">คุณต้องการสร้างใบวางบิลใช่หรือไม่?</p>
          {confirmBillingDoc && (
            <p className="text-sm">
              ยอดรวม: <span className="font-semibold">฿{formatCurrency(confirmBillingDoc.net_payable)}</span>
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmBillingDoc(null)}>ยกเลิก</Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={actionLoadingId === confirmBillingDoc?.id}
              onClick={() => {
                if (confirmBillingDoc) {
                  handleCreateBillingNote(confirmBillingDoc);
                  setConfirmBillingDoc(null);
                }
              }}
            >
              {actionLoadingId === confirmBillingDoc?.id ? "..." : "ยืนยัน"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={voidModalOpen} onClose={() => setVoidModalOpen(false)} title="ยกเลิกและสร้างใหม่">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            การยกเลิกจะเปลี่ยนสถานะเอกสารเป็น <b>ยกเลิก</b> และสร้างสำเนาใหม่ในสถานะ <b>ร่าง</b>
          </p>
          <Input
            label="เหตุผลการยกเลิก"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="ไม่บังคับ"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setVoidModalOpen(false)}>
              ปิด
            </Button>
            <Button variant="danger" onClick={handleConfirmVoid} disabled={voiding}>
              {voiding ? "กำลังยกเลิก..." : "ยืนยันการยกเลิก"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="ยืนยันการรับเงิน">
        <div className="space-y-4">
          {payDocument && (
            <>
              <div className="rounded-lg bg-stone-50 border border-card-border px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">ยอดในใบวางบิล</span>
                  <span className="font-semibold">฿{formatCurrency(payDocument.net_payable)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-gray-500">หัก ณ ที่จ่าย</span>
                  <span className="font-medium text-gray-700">฿{formatCurrency(payDocument.wht_amount)}</span>
                </div>
                <div className="mt-3 border-t border-card-border pt-2 flex items-center justify-between">
                  <span className="font-medium text-gray-700">ยอดที่รับจริง</span>
                  <span className="text-base font-semibold">฿{formatCurrency(amountReceived)}</span>
                </div>
              </div>

              <Input
                label="จำนวนเงินที่รับ"
                type="number"
                step="0.01"
                value={amountReceived || ""}
                onChange={(e) => setAmountReceived(parseFloat(e.target.value) || 0)}
              />

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">วิธีชำระเงิน</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <Input
                label="เลขที่ใบหักภาษี ณ ที่จ่าย"
                value={whtCertificateNo}
                onChange={(e) => setWhtCertificateNo(e.target.value)}
                placeholder="กรอกถ้ามี"
              />

              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setPaymentModalOpen(false)}>
                  ปิด
                </Button>
                <Button onClick={handleConfirmPayment} disabled={paying || amountReceived <= 0}>
                  {paying ? "กำลังบันทึก..." : "ยืนยันการรับเงิน"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </AppShell>
  );
}
