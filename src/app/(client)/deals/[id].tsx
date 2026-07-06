import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MoreHorizontal, ChevronDown, ChevronUp, AlertTriangle, Phone, Copy, CheckCircle2, Download, PackageCheck, ExternalLink } from "lucide-react";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { EmptyState } from "../../../components/ui/EmptyState";
import { supabase } from "../../../lib/supabase";
import { generateDocNumberBE } from "../../../lib/docNumber";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { buildReceiptInvoiceRecords, getReceiptInvoiceSources } from "../../../lib/receiptInvoices";
import { sendDocumentWithSideEffects } from "../../../lib/documentSend";
import { voidDocumentWithSideEffects } from "../../../lib/documentVoid";
import {
  buildReceiptBackdateFields,
  composeReceiptBackdateReason,
  isPastDate,
  RECEIPT_BACKDATE_REASON_OPTIONS,
  toLocalMiddayIso,
  todayString,
} from "../../../lib/receiptBackdating";
import { deductStockOnDocumentSent, restoreStockOnVoid } from "../../../lib/stock";
import { EditableDocNumber } from "../../../components/documents/EditableDocNumber";
import { DealNotes } from "../../../components/deals/DealNotes";
import { DOC_TYPE_LABELS, PAYMENT_METHOD_LABELS, STATUS_LABELS } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import { getWorkspacePermissions } from "../../../lib/permissions";
import type {
  Document,
  DocumentLineItem,
  BillingNoteInvoice,
  Deal,
  Customer,
  ClientProfile,
  DocumentStatus,
  DocumentType,
  PaymentMethod,
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
  | { type: "delivery_from_quote"; doc: Document; label: string }
  | { type: "invoice_from_dns"; doc: Document; label: string }
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
  if (doc.doc_type === "delivery_note") {
    return "invoice";
  }
  if (doc.doc_type === "receipt") return "done";
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
  if (doc.doc_type === "quotation" || doc.doc_type === "invoice" || doc.doc_type === "tax_invoice_receipt" || doc.doc_type === "delivery_note") return doc.total_amount;
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

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatQty(value: number) {
  return round3(value).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
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
  const { profile, loading: authLoading, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const userId = profile?.id;
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email || "");
    });
  }, []);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [docsWithMeta, setDocsWithMeta] = useState<DocWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidDocument, setVoidDocument] = useState<Document | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidAndRecreate, setVoidAndRecreate] = useState(true);
  const [voiding, setVoiding] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payDocument, setPayDocument] = useState<Document | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [amountReceived, setAmountReceived] = useState(0);
  const [whtCertificateNo, setWhtCertificateNo] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayString());
  const [paymentBackdateReason, setPaymentBackdateReason] = useState("");
  const [paymentBackdateNote, setPaymentBackdateNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentMismatchConfirm, setPaymentMismatchConfirm] = useState(false);

  const [confirmConvertDoc, setConfirmConvertDoc] = useState<Document | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyingDeal, setCopyingDeal] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");

  const toast = useToast();
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const fetchDealData = useCallback(async () => {
    if (!dealId || !userId) {
      if (userId === undefined && !deal) {
        return;
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
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
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dealId, userId]);

  useEffect(() => {
    fetchDealData();
  }, [fetchDealData]);

  const handleDownloadAll = async () => {
    if (!clientProfile || !customer) return;
    const toDownload = nonVoidedDocs.filter((item) => !(item.document.status === "voided"));
    if (toDownload.length === 0) {
      toast.error("ไม่มีเอกสารที่สามารถดาวน์โหลดได้");
      return;
    }
    setBulkDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const { getPrintableDocumentDataBase, generatePDFBlob } = await import("../../../lib/print");

      for (let i = 0; i < toDownload.length; i++) {
        const item = toDownload[i];
        const doc = item.document;

        try {
          const data = await getPrintableDocumentDataBase(doc.id);
          // Stamp the template from the deal's customer/client profile
          // so the dispatcher picks the right generator.
          const template = clientProfile?.pdf_template === "classic" ? "classic" : "modern";
          const blob = await generatePDFBlob({ ...data, template } as Parameters<typeof generatePDFBlob>[0]);
          const name = `${doc.doc_number || `doc_${i + 1}`}.pdf`;
          if (blob) zip.file(name, blob, { binary: true });
        } catch {
          toast.error(`ไม่สามารถสร้าง PDF สำหรับ ${doc.doc_number || doc.id}`);
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deal_documents_${dealId?.slice(0, 8) || "download"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`ดาวน์โหลด ${toDownload.length} ไฟล์เรียบร้อย`);
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleOpenPreview = (doc: Document) => {
    window.open(`/documents/${doc.id}/print`, "_blank", "noopener,noreferrer");
  };

  const handleSendDraft = async (doc: Document) => {
    if (!userId) return;
    if (!permissions.canSendDocuments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    setActionLoadingId(doc.id);
    try {
      const { warnings } = await sendDocumentWithSideEffects(doc, userId);
      warnings.forEach((w) =>
        toast.info(`${w.itemName} สต็อกไม่พอ (มี ${w.available} ${w.unit} แต่ใช้ ${w.requested} ${w.unit})`)
      );

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
    if (!permissions.canSendDocuments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    setActionLoadingId(quotation.id);
    let createdInvoiceId: string | null = null;
    try {
      if (quotation.status !== "sent") {
        throw new Error("แปลงได้เฉพาะใบเสนอราคาที่ส่งแล้วเท่านั้น");
      }

      const existingInvoice = docsWithMeta.find(
        (item) =>
          item.document.doc_type === "invoice" &&
          item.document.converted_from_id === quotation.id &&
          item.document.status !== "voided",
      );
      if (existingInvoice) {
        throw new Error("ใบเสนอราคานี้ถูกแปลงเป็นใบแจ้งหนี้แล้ว");
      }

      const { data: persistedInvoice, error: existingInvoiceError } = await supabase
        .from("documents")
        .select("id")
        .eq("user_id", userId)
        .eq("converted_from_id", quotation.id)
        .eq("doc_type", "invoice")
        .neq("status", "voided")
        .limit(1)
        .maybeSingle();
      if (existingInvoiceError) throw existingInvoiceError;
      if (persistedInvoice) {
        throw new Error("ใบเสนอราคานี้ถูกแปลงเป็นใบแจ้งหนี้แล้ว");
      }

      const issueDate = quotation.issue_date || new Date().toISOString().slice(0, 10);
      const docNumber = docNumberOverride || await generateDocNumberBE(userId, "invoice", issueDate);

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
          issue_date: issueDate,
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
      createdInvoiceId = invoiceDoc.id;

      if (lineItems.length > 0) {
        const { error: lineError } = await supabase.from("document_line_items").insert(
          lineItems.map((li, idx) => ({
            document_id: invoiceDoc.id,
            user_id: userId,
            item_id: li.item_id,
            item_name: li.item_name,
            line_note: li.line_note || null,
            item_sku: li.item_sku,
            item_type: li.item_type,
            unit: li.unit,
            unit_price: li.unit_price,
            quantity: li.quantity,
            base_quantity: li.base_quantity,
            discount_percent: li.discount_percent,
            discount_amount: li.discount_amount,
            qty_carton: li.qty_carton,
            carton_unit: li.carton_unit,
            source_document_id: quotation.id,
            source_line_item_id: li.id,
            line_total: li.line_total,
            sort_order: idx,
          }))
        );
        if (lineError) throw lineError;
      }

      await deductStockOnDocumentSent(invoiceDoc.id, userId);

      const { error: quotationUpdateError } = await supabase
        .from("documents")
        .update({ status: "converted" as DocumentStatus })
        .eq("id", quotation.id);
      if (quotationUpdateError) throw quotationUpdateError;

      toast.success("แปลงเป็นใบแจ้งหนี้สำเร็จ");
      fetchDealData();
    } catch (err: unknown) {
      if (createdInvoiceId) {
        await restoreStockOnVoid(createdInvoiceId, userId).catch(() => undefined);
        await supabase.from("document_line_items").delete().eq("document_id", createdInvoiceId);
        await supabase.from("documents").delete().eq("id", createdInvoiceId);
      }
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenPaymentModal = (doc: Document) => {
    if (!permissions.canRecordPayments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    setPayDocument(doc);
    setAmountReceived(doc.net_payable);
    setPaymentMismatchConfirm(false);
    setPaymentMethod("bank_transfer");
    setWhtCertificateNo("");
    setPaymentDate(todayString());
    setPaymentBackdateReason("");
    setPaymentBackdateNote("");
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!payDocument || !userId || !dealId) return;
    if (!permissions.canRecordPayments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (amountReceived !== payDocument.net_payable) {
      setPaymentMismatchConfirm(true);
      return;
    }
    await executeConfirmPayment();
  };

  const executeConfirmPayment = async () => {
    if (!payDocument || !userId || !dealId) return;
    if (isPastDate(paymentDate) && !paymentBackdateReason) {
      toast.error("กรุณาเลือกเหตุผลในการออกใบเสร็จย้อนหลัง");
      return;
    }
    setPaying(true);
    try {
      const paidAt = toLocalMiddayIso(paymentDate);
      const receiptBackdateFields = buildReceiptBackdateFields({
        selectedDate: paymentDate,
        userId,
        reason: composeReceiptBackdateReason(paymentBackdateReason, paymentBackdateNote),
      });
      const receiptInvoiceSources = await getReceiptInvoiceSources(payDocument, userId);

      await supabase
        .from("documents")
        .update({
          status: "paid" as DocumentStatus,
          paid_at: paidAt,
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
          .update({ status: "paid" as DocumentStatus, paid_at: paidAt })
          .in("id", linkedInvoiceIds);
      }

      const issueDate = paymentDate;
      const docNumber = docNumberOverride || await generateDocNumberBE(userId, "receipt", issueDate);

      const { data: receipt, error: receiptError } = await supabase.from("documents").insert({
        user_id: userId,
        deal_id: dealId,
        customer_id: payDocument.customer_id,
        doc_type: "receipt",
        doc_number: docNumber,
        status: "generated" as DocumentStatus,
        issue_date: issueDate,
        converted_from_id: payDocument.id,
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
        paid_at: paidAt,
        ...receiptBackdateFields,
      }).select("id").single();
      if (receiptError || !receipt) throw receiptError || new Error("ไม่สามารถสร้างใบเสร็จได้");

      if (receiptInvoiceSources.length > 0) {
        const { error: receiptInvoiceError } = await supabase.from("receipt_invoices").insert(
          buildReceiptInvoiceRecords({
            receiptId: receipt.id,
            userId,
            sourceDocument: payDocument,
            invoices: receiptInvoiceSources,
          }),
        );
        if (receiptInvoiceError) throw receiptInvoiceError;
      }

      toast.success("บันทึกรับเงินสำเร็จ");
      setPaymentModalOpen(false);
      setPaymentMismatchConfirm(false);
      setPayDocument(null);
      setPaymentBackdateReason("");
      setPaymentBackdateNote("");
      fetchDealData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setPaying(false);
    }
  };

  const handleCreateCreditNote = () => {
    navigate(`/documents/new?type=credit_note&dealId=${dealId}`);
  };

  const handleOpenVoidModal = (doc: Document, recreate: boolean) => {
    if (!permissions.canVoidDocuments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    setVoidDocument(doc);
    setVoidReason("");
    setVoidAndRecreate(recreate);
    setVoidModalOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!voidDocument || !userId || !dealId) return;
    if (!permissions.canVoidDocuments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (voidAndRecreate && !voidReason.trim()) {
      toast.error("กรุณาระบุเหตุผลในการแก้ไขโดยออกฉบับใหม่");
      return;
    }
    let recreatedId: string | null = null;
    let recreatedIsUtility = false;
    setVoiding(true);
    try {
      await voidDocumentWithSideEffects(voidDocument, userId, voidReason);

      if (voidAndRecreate) {
        const issueDate = voidDocument.issue_date || new Date().toISOString().slice(0, 10);
        const newDocNumber = docNumberOverride || await generateDocNumberBE(userId, voidDocument.doc_type, issueDate);

        const { data: newDoc } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            deal_id: dealId,
            customer_id: voidDocument.customer_id,
            doc_type: voidDocument.doc_type,
            doc_number: newDocNumber,
            status: "draft" as DocumentStatus,
            issue_date: issueDate,
            due_date: voidDocument.due_date,
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
            note: voidDocument.note,
            payment_method: null,
            amount_received: null,
            paid_at: null,
            wht_certificate_no: null,
            copied_from_id: voidDocument.id,
          })
          .select("*")
          .single();

        if (newDoc) {
          recreatedId = newDoc.id;
          const sourceDoc = docsWithMeta.find((item) => item.document.id === voidDocument.id);
          recreatedIsUtility = sourceDoc?.line_items.some((li) => (li.line_note || "").includes("[USAGE_BILL]")) ?? false;

          if (sourceDoc && sourceDoc.line_items.length > 0) {
            await supabase.from("document_line_items").insert(
              sourceDoc.line_items.map((li, idx) => ({
                document_id: newDoc.id,
                user_id: userId,
                item_id: li.item_id,
                item_name: li.item_name,
                line_note: li.line_note || null,
                item_sku: li.item_sku,
                item_type: li.item_type,
                unit: li.unit,
                unit_price: li.unit_price,
                quantity: li.quantity,
                base_quantity: li.base_quantity,
                discount_percent: li.discount_percent,
                discount_amount: li.discount_amount,
                qty_carton: li.qty_carton,
                carton_unit: li.carton_unit,
                source_document_id: li.source_document_id,
                source_line_item_id: li.source_line_item_id,
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
      }

      toast.success(voidAndRecreate ? "ยกเลิกและสร้างสำเนาใหม่สำเร็จ" : "ยกเลิกเอกสารสำเร็จ");
      setVoidModalOpen(false);
      setVoidDocument(null);

      if (recreatedId && recreatedIsUtility) {
        navigate(`/documents/${recreatedId}/edit-utility`);
        return;
      }

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
      const isUtilityBill = activeDoc.line_items.some((li) => (li.line_note || "").includes("[USAGE_BILL]"));
      if (isUtilityBill) {
        navigate(`/documents/${activeDoc.document.id}/edit-utility`);
        return;
      }
      if (activeDoc.document.doc_type === "delivery_note") {
        navigate(`/documents/${activeDoc.document.id}/edit`);
        return;
      }
      navigate(`/documents/${activeDoc.document.id}/edit`);
      return;
    }
    if (activeDoc.document.doc_type === "billing_note" && activeDoc.document.status !== "paid") {
      navigate(`/documents/${activeDoc.document.id}/edit`);
      return;
    }
    handleOpenVoidModal(activeDoc.document, true);
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
      if (dealError || !newDeal) throw dealError || new Error("ไม่สามารถเริ่มงานขายใหม่ได้");

      if (sourceDoc) {
        const issueDate = new Date().toISOString().slice(0, 10);
        const docNumber = docNumberOverride || await generateDocNumberBE(userId, "quotation", issueDate);
        const { data: quotationDoc, error: docError } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            deal_id: newDeal.id,
            customer_id: customer.id,
            doc_type: "quotation",
            doc_number: docNumber,
            status: "draft" as DocumentStatus,
            issue_date: issueDate,
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
              line_note: li.line_note || null,
              item_sku: li.item_sku,
              item_type: li.item_type,
              unit: li.unit,
              unit_price: li.unit_price,
              quantity: li.quantity,
              base_quantity: li.base_quantity,
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
      toast.success("เริ่มงานขายใหม่จากรายการเดิมแล้ว");
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

  const replacementBySourceId = useMemo(() => {
    const map = new Map<string, Document>();
    for (const item of docsWithMeta) {
      const sourceId = item.document.copied_from_id;
      if (sourceId && item.document.status !== "voided") {
        map.set(sourceId, item.document);
      }
    }
    return map;
  }, [docsWithMeta]);

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
      [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "delivery_note") ||
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

  const latestQuotation = useMemo(
    () => [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "quotation") || null,
    [nonVoidedDocs]
  );

  const deliveryProgress = useMemo(() => {
    if (!latestQuotation) return null;

    const quote = latestQuotation.document;
    const quoteLines = latestQuotation.line_items;
    if (quoteLines.length === 0) return null;

    const deliveredByLine = new Map<string, number>();
    const pendingByLine = new Map<string, number>();

    for (const item of nonVoidedDocs) {
      const doc = item.document;
      if (doc.doc_type !== "delivery_note") continue;
      if (doc.status === "voided") continue;

      for (const line of item.line_items) {
        if (line.source_document_id !== quote.id || !line.source_line_item_id) continue;
        if (doc.status === "sent" || doc.status === "converted") {
          deliveredByLine.set(
            line.source_line_item_id,
            round3((deliveredByLine.get(line.source_line_item_id) || 0) + line.quantity),
          );
        } else if (doc.status === "draft") {
          pendingByLine.set(
            line.source_line_item_id,
            round3((pendingByLine.get(line.source_line_item_id) || 0) + line.quantity),
          );
        }
      }
    }

    const rows = quoteLines.map((line) => {
      const delivered = deliveredByLine.get(line.id) || 0;
      const pending = pendingByLine.get(line.id) || 0;
      const remaining = round3(line.quantity - delivered);
      return { line, delivered, pending, remaining, over: delivered > line.quantity };
    });

    const totalQuoted = round3(rows.reduce((sum, row) => sum + row.line.quantity, 0));
    const totalDelivered = round3(rows.reduce((sum, row) => sum + row.delivered, 0));
    const totalPending = round3(rows.reduce((sum, row) => sum + row.pending, 0));
    const allDelivered = rows.every((row) => row.delivered >= row.line.quantity);
    const hasOverDelivery = rows.some((row) => row.over);

    return {
      quotation: quote,
      rows,
      totalQuoted,
      totalDelivered,
      totalPending,
      allDelivered,
      hasOverDelivery,
    };
  }, [latestQuotation, nonVoidedDocs]);

  const hasQuotationDeliveryActivity = useMemo(() => {
    if (!latestQuotation) return false;
    const quoteId = latestQuotation.document.id;
    return nonVoidedDocs.some((item) => {
      if (item.document.doc_type !== "delivery_note") return false;
      if (item.document.converted_from_id === quoteId) return true;
      return item.line_items.some((line) => line.source_document_id === quoteId);
    });
  }, [latestQuotation, nonVoidedDocs]);

  const allDone = nonVoidedDocs.length > 0 && nonVoidedDocs.every((item) => item.stage === "done");
  const hasPaidDocs = nonVoidedDocs.some(
    (item) => item.document.status === "paid" || (item.document.doc_type === "tax_invoice_receipt" && item.document.status === "issued")
  );
  const deliveryNotes = useMemo(
    () => nonVoidedDocs.filter((item) => item.document.doc_type === "delivery_note"),
    [nonVoidedDocs]
  );
  const dnAction = useMemo(() => {
    if (!latestQuotation || latestQuotation.document.status !== "sent") return null;
    const draftDn = nonVoidedDocs.find(
      (item) => item.document.doc_type === "delivery_note" && item.document.status === "draft",
    );
    const sentCount = nonVoidedDocs.filter(
      (item) => item.document.doc_type === "delivery_note" && item.document.status === "sent",
    ).length;
    const allDelivered = deliveryProgress?.allDelivered ?? false;

    if (draftDn) {
      return {
        kind: "draft" as const,
        label: `แก้ไขร่าง ${draftDn.document.doc_number || ""}`.trim(),
        badge: "ร่างค้าง",
        disabled: false,
        target: { type: "document" as const, id: draftDn.document.id },
      };
    }
    if (allDelivered) {
      return {
        kind: "done" as const,
        label: "ส่งครบแล้ว",
        badge: sentCount > 0 ? `· มี ${sentCount} ฉบับ` : null,
        disabled: true,
        target: null,
      };
    }
    return {
      kind: "open_form" as const,
      label: "ออกใบส่งของ",
      badge: sentCount > 0 ? `· มี ${sentCount} ฉบับ` : null,
      disabled: false,
      target: { type: "form" as const, quotationId: latestQuotation.document.id },
    };
  }, [latestQuotation, nonVoidedDocs, deliveryProgress]);
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
  const title = deal?.title || customer?.name || "งานขาย";
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
        : activeDoc?.document.doc_type === "delivery_note"
          ? 2
          : activeDoc?.document.doc_type === "billing_note"
            ? 3
            : 4;

  const skippedStage1 = !nonVoidedDocs.some((item) => item.document.doc_type === "quotation");

  const mainAction: MainAction = useMemo(() => {
    if (!activeDoc) return null;
    const doc = activeDoc.document;
    if (allDone) return { type: "done", label: "เสร็จสิ้น" };
    if (doc.status === "draft") {
      if (!permissions.canSendDocuments) return null;
      return {
        type: "send_draft",
        doc,
        label:
          doc.doc_type === "quotation"
            ? "ส่งใบเสนอราคาแล้ว"
            : doc.doc_type === "invoice"
              ? "ส่งใบแจ้งหนี้แล้ว"
              : doc.doc_type === "delivery_note"
                ? "ส่งของแล้ว"
              : "ส่งใบวางบิลแล้ว",
      };
    }
    if (doc.doc_type === "delivery_note" && doc.status === "sent") {
      if (!permissions.canSendDocuments) return null;
      return { type: "invoice_from_dns", doc, label: "ออกใบแจ้งหนี้จากใบส่งของ" };
    }
    if (doc.doc_type === "quotation" && doc.status === "sent") {
      if (!permissions.canSendDocuments) return null;
      if (hasQuotationDeliveryActivity) {
        return { type: "delivery_from_quote", doc, label: "ออกใบส่งของจากใบเสนอราคา" };
      }
      return { type: "convert", doc, label: "ลูกค้าตกลงแล้ว" };
    }
    if (doc.doc_type === "invoice" && doc.status === "sent") {
      if (!permissions.canRecordPayments) return null;
      return { type: "billing", doc, label: "วางบิล" };
    }
    if (doc.doc_type === "billing_note" && (doc.status === "sent" || doc.status === "overdue")) {
      if (!permissions.canRecordPayments) return null;
      return {
        type: "collect",
        doc,
        label: isOverdueDocument(doc) ? "เกินกำหนด — รับเงินแล้ว?" : "รับเงินแล้ว",
        danger: isOverdueDocument(doc),
      };
    }
    return null;
  }, [activeDoc, allDone, hasQuotationDeliveryActivity, permissions.canRecordPayments, permissions.canSendDocuments]);

  const actionHint = useMemo(() => {
    if (!activeDoc?.document.doc_number) return "";
    if (activeDoc.document.due_date) {
      return `ครบกำหนด ${formatBuddhistDate(activeDoc.document.due_date)} • ${activeDoc.document.doc_number}`;
    }
    return activeDoc.document.doc_number;
  }, [activeDoc]);

  function handleCopyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("คัดลอกแล้ว");
  }

  const docByStage = useMemo(() => {
    const map = new Map<number, DocWithMeta>();
    for (const item of nonVoidedDocs) {
      const doc = item.document;
      if (map.has(1) && map.has(2) && map.has(3) && map.has(4)) break;
      if (doc.doc_type === "quotation" && !map.has(1)) map.set(1, item);
      if (doc.doc_type === "invoice" && !map.has(2)) map.set(2, item);
      if (doc.doc_type === "delivery_note" && !map.has(2)) map.set(2, item);
      if (doc.doc_type === "billing_note" && !map.has(3)) map.set(3, item);
      if ((doc.doc_type === "receipt" || doc.doc_type === "tax_invoice_receipt") && !map.has(4)) map.set(4, item);
    }
    if (!map.has(4)) {
      const paidDoc = nonVoidedDocs.find((item) => item.document.status === "paid" || item.document.status === "generated");
      if (paidDoc) map.set(4, paidDoc);
    }
    return map;
  }, [nonVoidedDocs]);

  const summaryStats = useMemo(() => {
    const best = nonVoidedDocs
      .filter((item) => {
        const doc = item.document;
        if (["quotation", "delivery_note", "credit_note"].includes(doc.doc_type)) return false;
        if (doc.doc_type === "receipt" && doc.status === "generated") return false;
        return doc.status === "paid" || doc.status === "generated" || doc.status === "issued";
      })
      .sort((a, b) => {
        const priority = (d: any) =>
          d.doc_type === "billing_note" ? 1 :
          d.doc_type === "tax_invoice_receipt" ? 2 :
          d.doc_type === "invoice" ? 3 :
          d.doc_type === "receipt" ? 4 : 5;
        const pa = priority(a.document);
        const pb = priority(b.document);
        if (pa !== pb) return pa - pb;
        const da = a.document.paid_at || a.document.issue_date;
        const db = b.document.paid_at || b.document.issue_date;
        return db.localeCompare(da);
      });
    const top = best[0] || null;
    return {
      totalCollected: top ? (top.document.amount_received || top.document.net_payable || 0) : 0,
      lastPaid: top,
      docCount: nonVoidedDocs.length,
    };
  }, [nonVoidedDocs]);

  if (authLoading || loading) {
    return (
      <AppShell title="งานขาย" showBack>
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
      <AppShell title="งานขาย" showBack>
        <EmptyState title="ไม่พบข้อมูลงานขายนี้" description="งานขายนี้อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึง" />
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
                <div className="flex items-center gap-2">
                  <div className="text-[15px] font-semibold text-gray-900 truncate">{customer?.name || title}</div>
                  {customer && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/customers/${customer.id}`);
                      }}
                      className="shrink-0 rounded-md p-1 text-gray-400 hover:text-[#378ADD] hover:bg-[#EAF4FF] transition-colors"
                      title="เปิดหน้าลูกค้า"
                      aria-label="เปิดหน้าลูกค้า"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {customer?.phone && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyText(customer.phone!); }}
                      className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      title="คัดลอกเบอร์โทร"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {customer?.tax_id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyText(customer.tax_id!); }}
                      className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      title="คัดลอกเลขภาษี"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
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

        <EditableDocNumber
          value={docNumberOverride}
          onChange={setDocNumberOverride}
          placeholder="ตั้งเลขที่เอกสารเอง (เว้นว่าง = อัตโนมัติ)"
          className="mb-3"
        />

        {deliveryProgress && (
          <Card className={`border-[0.5px] ${deliveryProgress.hasOverDelivery ? "border-amber-200 bg-amber-50" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-[#0F9AA8]" />
                  <div className="text-sm font-semibold text-[#1A1A18]">ความคืบหน้าการส่งของจากใบเสนอราคา</div>
                </div>
                <div className="mt-1 text-xs leading-5 text-gray-500">
                  {deliveryProgress.quotation.doc_number || "ใบเสนอราคา"} • ส่งแล้ว {formatQty(deliveryProgress.totalDelivered)} / เสนอราคา {formatQty(deliveryProgress.totalQuoted)}
                  {deliveryProgress.totalPending > 0 ? ` • ร่างค้าง ${formatQty(deliveryProgress.totalPending)}` : ""}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                deliveryProgress.allDelivered
                  ? "bg-green-100 text-green-700"
                  : deliveryProgress.hasOverDelivery
                    ? "bg-amber-100 text-amber-800"
                    : "bg-blue-100 text-blue-700"
              }`}>
                {deliveryProgress.allDelivered ? "ส่งครบแล้ว" : deliveryProgress.hasOverDelivery ? "มีส่งเกิน" : "กำลังส่ง"}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {deliveryProgress.rows.slice(0, 4).map((row) => (
                <div key={row.line.id} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#1A1A18]">{row.line.item_name}</div>
                      <div className="mt-0.5 text-gray-500">
                        ส่งแล้ว {formatQty(row.delivered)} / {formatQty(row.line.quantity)} {row.line.unit}
                        {row.pending > 0 ? ` • ร่างค้าง ${formatQty(row.pending)}` : ""}
                      </div>
                    </div>
                    <div className={`shrink-0 text-right font-medium ${row.remaining < 0 ? "text-amber-700" : "text-gray-700"}`}>
                      คงเหลือ {formatQty(row.remaining)} {row.line.unit}
                    </div>
                  </div>
                </div>
              ))}
              {deliveryProgress.rows.length > 4 && (
                <div className="text-center text-[11px] text-gray-500">และอีก {deliveryProgress.rows.length - 4} รายการ</div>
              )}
            </div>

            {dnAction && (
              <Button
                variant="secondary"
                disabled={dnAction.disabled}
                className={`mt-3 w-full justify-center ${
                  dnAction.disabled
                    ? "!bg-gray-50 !text-gray-500 !border-gray-200 hover:!bg-gray-50"
                    : "!bg-teal-50 !text-teal-700 !border-teal-200 hover:!bg-teal-100"
                }`}
                onClick={() => {
                  if (dnAction.disabled || !dnAction.target) return;
                  if (dnAction.target.type === "form") {
                    const params = new URLSearchParams({
                      type: "delivery_note_from_quotation",
                      quotationId: dnAction.target.quotationId,
                    });
                    navigate(`/documents/new?${params.toString()}`);
                  } else {
                    navigate(`/documents/${dnAction.target.id}`);
                  }
                }}
              >
                {dnAction.label}
                {dnAction.badge && (
                  <span
                    className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      dnAction.disabled
                        ? "bg-white/70 text-gray-500"
                        : "bg-white/70 text-[#0F9AA8]"
                    }`}
                  >
                    {dnAction.badge}
                  </span>
                )}
              </Button>
            )}

            {deliveryNotes.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                  ใบส่งของในดีลนี้ ({deliveryNotes.length})
                </div>
                {deliveryNotes.map((item) => {
                  const doc = item.document;
                  const isDraft = doc.status === "draft";
                  const isConverted = doc.status === "converted";
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => navigate(`/documents/${doc.id}`)}
                      className="w-full rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-left transition-colors hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-[#1A1A18]">
                            {doc.doc_number || "ยังไม่มีเลขเอกสาร"}
                          </div>
                          <div className="mt-0.5 text-gray-500">
                            {formatBuddhistDate(doc.issue_date)}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                            isDraft
                              ? "bg-amber-100 text-amber-700"
                              : isConverted
                                ? "bg-stone-100 text-stone-600"
                                : "bg-paid-bg text-paid-text"
                          }`}
                        >
                          {isDraft ? "ร่าง" : isConverted ? "รวมในบิลแล้ว" : "ส่งแล้ว"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        )}

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
              const stageDoc = docByStage.get(stage.step);
              return (
                <div key={stage.step} className="flex items-start flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      onClick={stageDoc ? () => navigate(`/documents/${stageDoc.document.id}`) : undefined}
                      className={[
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold relative z-[1]",
                        stageDoc ? "cursor-pointer" : "",
                        isSkipped ? "bg-stone-100 text-stone-400" : "",
                        isDone ? "bg-paid-bg text-paid-text" : "",
                        isActive ? "bg-primary text-white shadow-[0_0_0_4px_rgba(55,138,221,0.12)]" : "",
                        !isDone && !isActive && !isSkipped ? "bg-stone-100 text-stone-400" : "",
                      ].join(" ")}
                    >
                      {isSkipped ? "–" : isDone ? <CheckCircle2 className="h-4 w-4" /> : stage.step}
                    </div>
                    <div className={`mt-1.5 text-[10px] leading-4 text-center ${isDone ? "text-paid-text" : isActive ? "text-primary font-semibold" : "text-gray-500"}`}>
                      {stage.top}
                      <br />
                      {stage.bottom}
                    </div>
                    {isDone && stageDoc?.document.doc_number && (
                      <div className="mt-0.5 max-w-[64px] truncate text-[9px] text-paid-text">{stageDoc.document.doc_number}</div>
                    )}
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
                  if (mainAction.type === "delivery_from_quote") {
                    const params = new URLSearchParams({
                      type: "delivery_note_from_quotation",
                      quotationId: mainAction.doc.id,
                    });
                    navigate(`/documents/new?${params.toString()}`);
                  }
                  if (mainAction.type === "invoice_from_dns") navigate(`/documents/new?type=invoice_from_delivery_notes&dnId=${mainAction.doc.id}`);
                  if (mainAction.type === "billing") navigate(`/documents/new?type=billing_note&dealId=${dealId}`);
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

        {allDone && summaryStats && (
          <Card className="border-[0.5px] border-green-200 bg-green-50">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-green-800">งานขายเสร็จสิ้น</div>
                <div className="mt-1 space-y-0.5 text-xs leading-5 text-green-700">
                  <div>รับเงินแล้ว ฿{formatCurrency(summaryStats.totalCollected)}</div>
                  {summaryStats.lastPaid && (
                    <div>
                      ชำระเมื่อ {formatBuddhistDate(summaryStats.lastPaid.document.paid_at || summaryStats.lastPaid.document.issue_date)}
                      {summaryStats.lastPaid.document.payment_method && (
                        <> • {PAYMENT_METHOD_LABELS[summaryStats.lastPaid.document.payment_method]}</>
                      )}
                    </div>
                  )}
                  <div>{summaryStats.docCount} เอกสาร</div>
                </div>
              </div>
            </div>
          </Card>
        )}

        <div>
          <div className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">ประวัติเอกสาร</div>
          {nonVoidedDocs.length === 0 ? (
            <Card className="border-[0.5px]">
              <EmptyState title="ยังไม่มีเอกสาร" description="กดปุ่มด้านบนเพื่อเริ่มต้นขั้นตอนของงานขายนี้" />
            </Card>
          ) : (
            <div className="space-y-0">
              {nonVoidedDocs.map((item, index) => {
                const doc = item.document;
                const copiedFromDoc = doc.copied_from_id
                  ? docsWithMeta.find((source) => source.document.id === doc.copied_from_id)?.document
                  : null;
                const isCurrent = activeDoc?.document.id === doc.id;
                const overdue = isOverdueDocument(doc);
                const isDoneStage = item.stage === "done" && !isCurrent;
                return (
                  <div key={doc.id} className={`flex gap-3 ${isDoneStage ? "opacity-80" : ""}`}>
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
                      className={`mb-2 flex-1 border-[0.5px] ${isCurrent ? "border-primary bg-blue-50/30" : ""} ${isDoneStage ? "bg-[#FAFAF8]" : ""}`}
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
                          {copiedFromDoc && (
                            <div className="mt-1 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              ออกแทน {copiedFromDoc.doc_number || "เอกสารเดิม"}
                            </div>
                          )}
                          <div className="mt-1 text-[10px] text-gray-400">
                            {formatBuddhistDate(doc.issue_date)}
                            {doc.due_date ? (
                              <>
                                {" • ครบ "}
                                <span className={overdue ? "text-red-700" : ""}>{formatBuddhistDate(doc.due_date)}</span>
                              </>
                            ) : null}
                          </div>
                          {(doc.status === "paid" || doc.status === "generated" || doc.status === "issued") && (
                            <div className="mt-1 text-[10px] text-green-600">
                              ชำระแล้ว{doc.paid_at ? ` ${formatBuddhistDate(doc.paid_at)}` : ""}
                              {doc.payment_method ? ` • ${PAYMENT_METHOD_LABELS[doc.payment_method]}` : ""}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="text-[13px] font-semibold text-gray-900">฿{formatCurrency(getDocumentAmount(doc))}</div>
                          <Badge status={overdue ? "overdue" : doc.status} />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenPreview(doc);
                            }}
                            className="mt-0.5 inline-flex items-center justify-center rounded-md border border-[#378ADD] bg-white px-2.5 py-1 text-[11px] font-medium text-[#378ADD] transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#378ADD]/40"
                          >
                            Download
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
                const replacementDoc = replacementBySourceId.get(doc.id);
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
                          {replacementDoc && (
                            <div className="mt-1 inline-flex rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                              ออกใหม่เป็น {replacementDoc.doc_number || "ฉบับใหม่"}
                            </div>
                          )}
                          <div className="mt-1 text-[10px] text-gray-400">{formatBuddhistDate(doc.issue_date)}</div>
                          {doc.voided_reason && (
                            <div className="mt-0.5 text-[10px] text-gray-400 italic">เหตุผล: {doc.voided_reason}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="text-[13px] font-semibold text-gray-800">฿{formatCurrency(getDocumentAmount(doc))}</div>
                          <Badge status="voided" />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenPreview(doc);
                            }}
                            className="mt-0.5 inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                          >
                            Download
                          </button>
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
                : activeDoc.document.doc_type === "invoice" || activeDoc.document.doc_type === "tax_invoice_receipt"
                  ? "ระบบจะเก็บเอกสารเดิมไว้เป็นประวัติ และสร้างฉบับใหม่ให้แก้ไข"
                  : "For sent or later documents, this action voids the current version and creates a fresh draft copy."}
            </div>
          )}
           <div className="mt-3 grid grid-cols-2 gap-2">
            {nonVoidedDocs.length > 0 && (
              <Button
                variant="secondary"
                className="col-span-2 justify-center !bg-blue-50 !text-blue-700 !border-blue-200 hover:!bg-blue-100"
                loading={bulkDownloading}
                onClick={handleDownloadAll}
              >
                <Download className="mr-1.5 h-4 w-4" />
                {bulkDownloading ? `กำลังสร้าง ZIP (${nonVoidedDocs.length})` : "ดาวน์โหลดเอกสารทั้งหมด (ZIP)"}
              </Button>
            )}
            {activeDoc?.document.doc_type === "tax_invoice_receipt" && activeDoc.document.status === "issued" ? (
              <>
                <Button
                  variant="secondary"
                  className="justify-center !bg-amber-50 !text-amber-800 !border-amber-200 hover:!bg-amber-100"
                  onClick={handleCreateCreditNote}
                >
                  ออกใบลดหนี้
                </Button>
                <Button
                  variant="secondary"
                  className="justify-center !bg-blue-50 !text-blue-700 !border-blue-200 hover:!bg-blue-100"
                  onClick={() => handleOpenVoidModal(activeDoc.document, true)}
                >
                  ยกเลิกและออกฉบับใหม่
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                className={`col-span-2 justify-center ${activeDoc?.document.status !== "draft" ? "!bg-blue-50 !text-blue-700 !border-blue-200 hover:!bg-blue-100" : "!bg-page-bg"}`}
                onClick={handleCurrentDocAction}
              >
                {activeDoc?.document.status === "draft"
                  ? "แก้ไขฉบับร่าง"
                  : activeDoc?.document.doc_type === "billing_note" && activeDoc?.document.status !== "paid"
                    ? "แก้ไขใบวางบิล"
                    : activeDoc?.document.doc_type === "invoice"
                      ? "แก้ไขโดยออกฉบับใหม่"
                      : "ยกเลิก / แก้ไข"}
              </Button>
            )}
            {allDone && hasPaidDocs && !(activeDoc?.document.doc_type === "tax_invoice_receipt" && activeDoc.document.status === "issued") && (
              <Button
                variant="secondary"
                className="col-span-2 justify-center !bg-page-bg"
                onClick={handleCreateCreditNote}
              >
                ออกใบลดหนี้
              </Button>
            )}
          </div>
        </Card>
      </div>

      {dealId && userId && (
        <DealNotes
          dealId={dealId}
          userId={userId}
          authorName={userEmail.split("@")[0] || "คุณ"}
          authorRole={workspaceRole || "owner"}
        />
      )}

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="ตัวเลือกเพิ่มเติม">
        <div className="space-y-2">
          <Button variant="secondary" className="w-full justify-center" loading={copyingDeal} onClick={handleCopyDeal}>
            เริ่มงานขายใหม่จากรายการนี้
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

      <Modal
        open={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        title={voidAndRecreate
          ? voidDocument?.doc_type === "tax_invoice_receipt"
            ? "ยกเลิกและออกฉบับใหม่"
            : "แก้ไขโดยออกฉบับใหม่"
          : "ยกเลิกเอกสาร"}
      >
        <div className="space-y-3">
          {voidDocument && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              เอกสารเดิม: <span className="font-semibold text-stone-900">{voidDocument.doc_number || documentTypeLabel(voidDocument.doc_type, voidDocument.vat_registered).thai}</span>
            </div>
          )}
          <p className="text-sm text-gray-600">
            {voidAndRecreate
              ? "ระบบจะเก็บเอกสารเดิมไว้เป็นประวัติ และสร้างฉบับใหม่ให้แก้ไข โดยฉบับใหม่จะใช้เลขที่เอกสารใหม่"
              : "คุณแน่ใจว่าต้องการยกเลิกเอกสารนี้? สินค้าจะถูกคืนสต็อก"}
          </p>
          {voidAndRecreate && voidDocument && (voidDocument.doc_type === "invoice" || voidDocument.doc_type === "tax_invoice_receipt") && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              หากเอกสารนี้ผูกกับใบวางบิล ใบเสร็จ หรือใบส่งของ ระบบจะปลดสถานะที่เกี่ยวข้องตามกฎการยกเลิกเดิม และเก็บประวัติไว้ตรวจสอบย้อนหลัง
            </div>
          )}
          <Input
            label="เหตุผลการยกเลิก"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder={voidAndRecreate ? "เช่น ลูกค้าขอปรับยอด / ออกผิดรายละเอียด" : "ไม่บังคับ"}
            required={voidAndRecreate}
          />
          <div className="flex gap-2">
            {voidAndRecreate ? (
              <>
                <Button variant="secondary" className="flex-1" onClick={() => setVoidAndRecreate(false)}>
                  ยกเลิกอย่างเดียว
                </Button>
                <Button variant="primary" className="flex-1" onClick={handleConfirmVoid} loading={voiding}>
                  {voiding ? "กำลังยกเลิก..." : voidDocument?.doc_type === "tax_invoice_receipt" ? "ยกเลิกและออกฉบับใหม่" : "แก้ไขโดยออกฉบับใหม่"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" className="flex-1" onClick={() => { setVoidModalOpen(false); }}>
                  ปิด
                </Button>
                <Button variant="danger" className="flex-1" onClick={handleConfirmVoid} loading={voiding}>
                  {voiding ? "กำลังยกเลิก..." : "ยืนยันการยกเลิก"}
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={paymentModalOpen} onClose={() => { setPaymentModalOpen(false); setPaymentMismatchConfirm(false); }} title="ยืนยันการรับเงิน">
        <div className="space-y-4">
          {payDocument && (
            <>
              {paymentMismatchConfirm ? (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">จำนวนเงินที่รับไม่ตรงกับยอดที่ต้องชำระ</p>
                    <div className="mt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-amber-700">ยอดที่ต้องชำระ</span>
                        <span className="font-medium text-amber-900">฿{formatCurrency(payDocument.net_payable)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-700">จำนวนเงินที่รับ</span>
                        <span className="font-medium text-amber-900">฿{formatCurrency(amountReceived)}</span>
                      </div>
                      <div className="border-t border-amber-200 pt-1.5 flex justify-between">
                        <span className="text-amber-700">ส่วนต่าง</span>
                        <span className="font-bold text-amber-900">{amountReceived > payDocument.net_payable ? "+" : ""}฿{formatCurrency(amountReceived - payDocument.net_payable)}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-amber-700">
                      {amountReceived < payDocument.net_payable
                        ? "คุณกำลังรับเงินน้อยกว่ายอดที่ต้องชำระ ยอดคงเหลือจะไม่ถูกติดตาม"
                        : "คุณกำลังรับเงินมากกว่ายอดที่ต้องชำระ จำนวนที่เกินจะไม่ถูกบันทึกเป็นเครดิต"}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" onClick={() => setPaymentMismatchConfirm(false)}>กลับไปแก้ไข</Button>
                    <Button variant="primary" onClick={executeConfirmPayment} loading={paying}>ยืนยันรับเงิน</Button>
                  </div>
                </>
              ) : (
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
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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

              <Input
                label="วันที่รับเงิน"
                type="date"
                value={paymentDate}
                max={todayString()}
                onChange={(e) => setPaymentDate(e.target.value)}
              />

              {isPastDate(paymentDate) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <p className="text-sm font-medium text-amber-900">กำลังออกใบเสร็จย้อนหลัง</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    วันที่บนใบเสร็จจะใช้วันที่รับเงินจริง และระบบจะเก็บเวลาที่เข้ามาบันทึกไว้แยกกันเพื่อใช้ตรวจสอบย้อนหลัง
                  </p>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-amber-900">เหตุผลในการออกย้อนหลัง</label>
                    <select
                      value={paymentBackdateReason}
                      onChange={(e) => setPaymentBackdateReason(e.target.value)}
                      className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    >
                      <option value="">เลือกเหตุผล</option>
                      {RECEIPT_BACKDATE_REASON_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-amber-900">หมายเหตุเพิ่มเติม (ถ้ามี)</label>
                    <textarea
                      value={paymentBackdateNote}
                      onChange={(e) => setPaymentBackdateNote(e.target.value)}
                      rows={3}
                      placeholder="รายละเอียดเพิ่มเติม เช่น วันที่ได้รับสลิป หรือข้อมูลที่ต้องการให้ทีมบัญชีเห็น"
                      className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    />
                  </div>
                </div>
              )}

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
            </>
          )}
        </div>
      </Modal>
    </AppShell>
  );
}
