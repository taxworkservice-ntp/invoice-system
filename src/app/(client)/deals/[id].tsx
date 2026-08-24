import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, AlertTriangle, Phone, Copy, CheckCircle2, FileText, PackageCheck, ExternalLink, Clock, Pencil } from "lucide-react";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { useDevMode } from "../../../hooks/useDevMode";
import { useToast } from "../../../hooks/useToast";
import { useBankAccounts } from "../../../hooks/useBankAccounts";
import { useCustomers } from "../../../hooks/useCustomers";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { EmptyState } from "../../../components/ui/EmptyState";
import { FieldGuidance } from "../../../components/ui/FieldGuidance";
import { supabase } from "../../../lib/supabase";
import { copyDocumentAsDraft } from "../../../lib/documentCopy";
import { resolveDocNumber } from "../../../lib/docNumber";
import { businessTodayString } from "../../../lib/devDate";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { getReceiptTotalsForDocument } from "../../../lib/receiptTotals";
import { buildReceiptInvoiceRecords, getReceiptInvoiceSources } from "../../../lib/receiptInvoices";
import { sendDocumentWithSideEffects } from "../../../lib/documentSend";
import { voidDocumentWithSideEffects } from "../../../lib/documentVoid";
import { revertDeal } from "../../../lib/documentRevert";
import {
  buildReceiptBackdateFields,
  composeReceiptBackdateReason,
  isPastDate,
  RECEIPT_BACKDATE_REASON_OPTIONS,
  toLocalMiddayIso,
  todayString as realTodayString,
} from "../../../lib/receiptBackdating";
import { deductStockOnDocumentSent, restoreStockOnVoid } from "../../../lib/stock";
import {
  calculateReceiptAllocationFromInput,
  convertReceiptInputAmount,
  convertReceiptInputToPreTax,
  type ReceiptInputBasis,
} from "../../../lib/tax";
import { getReceiptInputBasisPreference, setReceiptInputBasisPreference } from "../../../lib/receiptInputBasis";
import { EditableDocNumber } from "../../../components/documents/EditableDocNumber";
import { DealNotes } from "../../../components/deals/DealNotes";
import { CustomerPickerModal } from "../../../components/customers/CustomerPickerModal";
import { MANUAL_STAGES, MANUAL_STAGE_LABELS, findCustomerLockingDocs } from "../../../lib/dealStages";
import { DOC_TYPE_LABELS, PAYMENT_METHOD_LABELS, STATUS_LABELS } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import { getDnVarianceParts, getSourceVarianceLabel, hasDnVariance } from "../../../lib/dnVariance";
import { canSendDocumentType, getWorkspacePermissions } from "../../../lib/permissions";
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

interface DealActivity {
  id: string;
  document_id: string | null;
  actor_name: string;
  actor_role: string;
  event_type: string;
  description: string;
  metadata: {
    doc_type?: string;
    doc_number?: string | null;
    status?: string;
    amount?: number | null;
  };
  created_at: string;
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
  if (doc.doc_type === "invoice" && doc.status !== "paid" && doc.status !== "partially_paid") return "invoice";
  if (doc.doc_type === "billing_note" && doc.status !== "paid" && doc.status !== "partially_paid") return "collect";
  if (doc.status === "paid" || doc.status === "generated") return "done";
  if (doc.status === "partially_paid") return "collect";
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
  return new Date(doc.due_date) < new Date(new Date().toISOString().slice(0, 10)) && doc.status !== "paid" && doc.status !== "partially_paid";
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
  if (doc.status === "partially_paid") return { label: "ชำระบางส่วน", className: "bg-amber-100 text-amber-700" };
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
  const { isDevMode } = useDevMode();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const userId = profile?.id;
  const [userEmail, setUserEmail] = useState("");
  const { active: bankAccounts, primary: primaryBank, loading: bankLoading } = useBankAccounts(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email || "");
    });
  }, []);

  const [deal, setDeal] = useState<Deal | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const businessToday = businessTodayString(clientProfile);
  const devIssueDate = clientProfile?.dev_mode_enabled && clientProfile.dev_effective_date ? businessToday : undefined;
  const todayString = () => businessToday;
  const [docsWithMeta, setDocsWithMeta] = useState<DocWithMeta[]>([]);
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [loading, setLoading] = useState(true);

  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidDocument, setVoidDocument] = useState<Document | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidAndRecreate, setVoidAndRecreate] = useState(true);
  const [voiding, setVoiding] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payDocument, setPayDocument] = useState<Document | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [paymentBankAccountId, setPaymentBankAccountId] = useState<string | null>(null);
  const [paymentBaseAmount, setPaymentBaseAmount] = useState(0);
  const [paymentBaseRemaining, setPaymentBaseRemaining] = useState(0);
  const [paymentInputBasis, setPaymentInputBasis] = useState<ReceiptInputBasis>(getReceiptInputBasisPreference);
  const [paymentPreviousWht, setPaymentPreviousWht] = useState(0);
  const [whtCertificateNo, setWhtCertificateNo] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => realTodayString());
  const [paymentBackdateReason, setPaymentBackdateReason] = useState("");
  const [paymentBackdateNote, setPaymentBackdateNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentMismatchConfirm, setPaymentMismatchConfirm] = useState(false);

  const [showVoided, setShowVoided] = useState(false);
  const [cloneChooserOpen, setCloneChooserOpen] = useState(false);
  const [copyingDeal, setCopyingDeal] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [hasActiveDnLinks, setHasActiveDnLinks] = useState(false);

  const { customers, addCustomer } = useCustomers(userId);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState<Customer | null>(null);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [stageOverrideBusy, setStageOverrideBusy] = useState(false);

  const toast = useToast();
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [showDocList, setShowDocList] = useState(false);

  useEffect(() => {
    if (paymentDate === realTodayString()) setPaymentDate(businessToday);
  }, [businessToday, paymentDate]);

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
        { data: activitiesData },
      ] = await Promise.all([
        supabase.from("client_profiles").select("*").eq("user_id", userId).single(),
        supabase.from("customers").select("*").eq("id", currentDeal.customer_id).single(),
        supabase.from("documents").select("*").eq("deal_id", dealId).order("created_at", { ascending: true }),
        supabase.from("deal_activities").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
      ]);

      if (clientData) setClientProfile(clientData as ClientProfile);
      if (customerData) setCustomer(customerData as Customer);
      setActivities((activitiesData || []) as DealActivity[]);

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

      // A quotation whose pipeline has moved past it (a delivery note or
      // invoice was created from it) must not keep the deal open — its stage
      // becomes "done" even though its stored status stays "sent".
      const quotationsWithDownstream = new Set<string>();
      for (const doc of docs) {
        if (doc.status === "voided") continue;
        if (doc.converted_from_id && doc.doc_type !== "quotation") {
          quotationsWithDownstream.add(doc.converted_from_id);
        }
      }
      for (const line of (lineItemsData || []) as DocumentLineItem[]) {
        if (!line.source_document_id) continue;
        const parent = docs.find((d) => d.id === line.document_id);
        if (parent && parent.status !== "voided" && parent.doc_type !== "quotation") {
          quotationsWithDownstream.add(line.source_document_id);
        }
      }

      setDocsWithMeta(
        docs.map((doc) => ({
          document: doc,
          stage:
            doc.doc_type === "quotation" && quotationsWithDownstream.has(doc.id)
              ? ("done" as const)
              : getDocStage(doc),
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

  const handleOpenPreview = (doc: Document) => {
    window.open(`/documents/${doc.id}/print`, "_blank", "noopener,noreferrer");
  };

  const handleSendDraft = async (doc: Document) => {
    if (!userId) return;
    if (!canSendDocumentType(permissions, doc.doc_type)) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    const financialTypes = ["invoice", "billing_note", "tax_invoice_receipt"];
    if (financialTypes.includes(doc.doc_type)) {
      const ok = window.confirm(
        `${doc.doc_number || "เอกสาร"} จะถูกล็อคหลังส่ง หากผิดต้องยกเลิกและออกใหม่\nยืนยันส่งเอกสารนี้?`,
      );
      if (!ok) return;
    }
    setActionLoadingId(doc.id);
    try {
      const { warnings } = await sendDocumentWithSideEffects(doc, userId, { issueDate: devIssueDate });
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

  const handleOpenPaymentModal = async (doc: Document) => {
    if (!userId || !permissions.canRecordPayments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    const { preTaxAmount: previousTotal, whtAmount: previousWht } = await getReceiptTotalsForDocument(doc, userId);
    const remaining = Math.max(0, doc.subtotal - previousTotal);
    const initialBasis = getReceiptInputBasisPreference();
    setPayDocument(doc);
    setPaymentInputBasis(initialBasis);
    setPaymentBaseAmount(
      convertReceiptInputAmount({
        amount: remaining,
        from: "pre_tax",
        to: initialBasis,
        vatRate: doc.vat_rate,
        vatRegistered: doc.vat_registered,
        whtRate: doc.wht_rate,
      }),
    );
    setPaymentBaseRemaining(remaining);
    setPaymentPreviousWht(previousWht);
    setPaymentMismatchConfirm(false);
    setPaymentMethod("bank_transfer");
    setPaymentBankAccountId(primaryBank?.id ?? null);
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
    const { preTaxAmount: previousTotal } = await getReceiptTotalsForDocument(payDocument, userId);
    const remaining = Math.max(0, payDocument.subtotal - previousTotal);
    const requestedPreTax = convertReceiptInputToPreTax({ amount: paymentBaseAmount, basis: paymentInputBasis, vatRate: payDocument.vat_rate, whtRate: payDocument.wht_rate, vatRegistered: payDocument.vat_registered });
    if (requestedPreTax > remaining + 0.01) {
      toast.error(`ยอดก่อน VAT เกินยอดค้างชำระ ฿${formatCurrency(remaining)}`);
      return;
    }
    if (requestedPreTax < remaining - 0.01) {
      setPaymentMismatchConfirm(true);
      return;
    }
    await executeConfirmPayment();
  };

  const executeConfirmPayment = async () => {
    if (!payDocument || !userId || !dealId) return;
    if (isPastDate(paymentDate, businessToday) && !paymentBackdateReason) {
      toast.error("กรุณาเลือกเหตุผลในการออกใบเสร็จย้อนหลัง");
      return;
    }
    if (paymentMethod === "bank_transfer" && !paymentBankAccountId) {
      toast.error("กรุณาเลือกบัญชีที่รับโอนเงิน");
      return;
    }
    setPaying(true);
    try {
      const paidAt = toLocalMiddayIso(paymentDate);
      const receiptBackdateFields = buildReceiptBackdateFields({
        selectedDate: paymentDate,
        userId,
        reason: composeReceiptBackdateReason(paymentBackdateReason, paymentBackdateNote),
        today: businessToday,
      });
      const receiptInvoiceSources = await getReceiptInvoiceSources(payDocument, userId);

      const previousTotals = await getReceiptTotalsForDocument(payDocument, userId);
      const previousTotal = previousTotals.preTaxAmount;
      const previousWht = previousTotals.whtAmount;
      const remaining = Math.max(0, payDocument.subtotal - previousTotal);
      const allocation = calculateReceiptAllocationFromInput({
        amount: paymentBaseAmount,
        basis: paymentInputBasis,
        vatRate: payDocument.vat_rate,
        vatRegistered: payDocument.vat_registered,
        whtRate: payDocument.wht_rate,
        expectedWht: payDocument.wht_amount || 0,
        previousWht,
        isFullyPaid: convertReceiptInputToPreTax({ amount: paymentBaseAmount, basis: paymentInputBasis, vatRate: payDocument.vat_rate, whtRate: payDocument.wht_rate, vatRegistered: payDocument.vat_registered }) >= payDocument.subtotal - 0.01,
      });
      if (paymentBaseAmount <= 0 || allocation.preTax > remaining + 0.01) {
        throw new Error(`ยอดก่อน VAT เกินยอดค้างชำระ ฿${formatCurrency(remaining)}`);
      }
      const newTotal = previousTotal + allocation.preTax;
      const isFullyPaid = newTotal >= (payDocument.subtotal - 0.01);
      const newStatus = isFullyPaid ? "paid" : "partially_paid";

      await supabase
        .from("documents")
        .update({
          status: newStatus as DocumentStatus,
          paid_at: paidAt,
          payment_method: paymentMethod,
          bank_account_id: paymentMethod === "bank_transfer" ? paymentBankAccountId : null,
          amount_received: previousTotals.amountReceived + allocation.netAmount,
          wht_certificate_no: whtCertificateNo || null,
        })
        .eq("id", payDocument.id);

      const { data: linked } = await supabase
        .from("billing_note_invoices")
        .select("invoice_id")
        .eq("billing_note_id", payDocument.id);

      const linkedInvoiceIds = (linked || []).map((item: { invoice_id: string }) => item.invoice_id);
      if (linkedInvoiceIds.length > 0) {
        const invoiceNewStatus = isFullyPaid ? "paid" : "in_billing";
        await supabase
          .from("documents")
          .update({ status: invoiceNewStatus as DocumentStatus, paid_at: paidAt })
          .in("id", linkedInvoiceIds);
      }

      const issueDate = paymentDate;
      const docNumber = await resolveDocNumber(userId, "receipt", issueDate, docNumberOverride);

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
        subtotal: allocation.preTax,
        vat_amount: allocation.vatAmount,
        total_amount: allocation.grossAmount,
        wht_amount: allocation.whtAmount,
        net_payable: allocation.netAmount,
        payment_method: paymentMethod,
        bank_account_id: paymentMethod === "bank_transfer" ? paymentBankAccountId : null,
        amount_received: allocation.netAmount,
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
            actualPaidAmount: allocation.netAmount,
          }),
        );
        if (receiptInvoiceError) throw receiptInvoiceError;
      }

      toast.success(isFullyPaid ? "บันทึกรับเงินสำเร็จ" : "บันทึกรับเงินบางส่วนสำเร็จ");
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
        const issueDate = voidDocument.issue_date || todayString();
        const newDocNumber = await resolveDocNumber(userId, voidDocument.doc_type, issueDate, docNumberOverride);

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

  const handleUnlinkAllInvoices = async () => {
    if (!activeDoc || !userId) return;
    const billingInvoices = activeDoc.billing_invoices || [];
    const invoiceIds = billingInvoices.map((bi) => bi.invoice_id).filter(Boolean);
    if (invoiceIds.length === 0) return;

    for (const invoiceId of invoiceIds) {
      const { data: newDeal } = await supabase
        .from("deals")
        .insert({ user_id: userId, customer_id: activeDoc.document.customer_id, is_active: true })
        .select("id")
        .single();

      if (newDeal) {
        await supabase
          .from("documents")
          .update({ status: "sent" as DocumentStatus, deal_id: newDeal.id })
          .eq("id", invoiceId);
      }
    }

    await supabase.from("billing_note_invoices").delete().eq("billing_note_id", activeDoc.document.id);

    await supabase
      .from("documents")
      .update({
        status: "voided" as DocumentStatus,
        voided_at: new Date().toISOString(),
      })
      .eq("id", activeDoc.document.id);

    toast.success(`ยกเลิก ${activeDoc.document.doc_number || "เอกสาร"} แล้ว — ${invoiceIds.length} ดีลถูกแยกกลับ · สร้างใหม่ได้ทันที`);
    navigate("/home");
  };

  const handleUnlinkAllDeliveryNotes = async () => {
    if (!activeDoc || !userId) return;
    const invoiceId = activeDoc.document.id;

    const { data: links } = await supabase
      .from("invoice_delivery_notes")
      .select("delivery_note_id")
      .eq("invoice_id", invoiceId)
      .is("released_at", null);

    const dnIds = (links || []).map((l) => l.delivery_note_id).filter(Boolean);
    if (dnIds.length === 0) return;

    for (const dnId of dnIds) {
      const { data: newDeal } = await supabase
        .from("deals")
        .insert({
          user_id: userId,
          customer_id: activeDoc.document.customer_id,
          is_active: true,
        })
        .select("id")
        .single();

      if (newDeal) {
        await supabase
          .from("documents")
          .update({ status: "sent" as DocumentStatus, deal_id: newDeal.id })
          .eq("id", dnId);
      }
    }

    await supabase
      .from("invoice_delivery_notes")
      .update({ released_at: new Date().toISOString() })
      .eq("invoice_id", invoiceId)
      .is("released_at", null);

    await supabase
      .from("documents")
      .update({
        status: "voided" as DocumentStatus,
        voided_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    toast.success(`ยกเลิกเอกสารแล้ว — ${dnIds.length} ดีลถูกแยกกลับ · สร้างใหม่ได้ทันที`);
    navigate("/home");
  };

  const handleCopyDeal = async (sourceType: DocumentType) => {
    if (!userId || !customer) return;
    const candidates = docsWithMeta
      .filter((item) => item.document.doc_type === sourceType && item.document.status !== "voided")
      .sort((a, b) => (b.document.updated_at || "").localeCompare(a.document.updated_at || ""));
    const sourceItem = candidates[0];
    if (!sourceItem) {
      toast.error("ไม่พบเอกสารประเภทนี้ในงานขาย");
      return;
    }
    setCopyingDeal(true);
    try {
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

      const { data: copy, error: copyError } = await copyDocumentAsDraft(sourceItem.document, userId, {
        issueDate: todayString(),
        dealId: newDeal.id,
        setCopiedFromId: false,
      });
      if (copyError || !copy) throw copyError || new Error("ไม่สามารถคัดลอกเอกสารได้");

      setCloneChooserOpen(false);
      toast.success("เริ่มงานขายใหม่จากรายการเดิมแล้ว");
      navigate(`/deals/${newDeal.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setCopyingDeal(false);
    }
  };

  const handleRevertDeal = async () => {
    if (!dealId || !userId) return;
    setReverting(true);
    try {
      await revertDeal(dealId, userId);
      toast.success("ลบงานขายนี้แล้ว");
      navigate("/home");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setReverting(false);
    }
  };

  const customerLockingDocs = useMemo(
    () => findCustomerLockingDocs(docsWithMeta.map((item) => item.document)),
    [docsWithMeta],
  );
  const draftDocCount = useMemo(
    () => docsWithMeta.filter((item) => item.document.status === "draft").length,
    [docsWithMeta],
  );
  const sentQuotations = useMemo(
    () =>
      docsWithMeta
        .filter((item) => item.document.doc_type === "quotation" && item.document.status === "sent")
        .map((item) => item.document),
    [docsWithMeta],
  );

  const handleChangeCustomer = async (target: Customer) => {
    if (!dealId || !deal || changingCustomer) return;
    if (target.id === deal.customer_id) {
      setCustomerPickerOpen(false);
      setPendingCustomer(null);
      return;
    }
    if (customerLockingDocs.length > 0) return;
    setChangingCustomer(true);
    try {
      const { error: dealErr } = await supabase
        .from("deals")
        .update({ customer_id: target.id })
        .eq("id", dealId);
      if (dealErr) throw dealErr;

      // Drafts follow the deal to the new customer; issued/voided documents
      // keep pointing at the old customer for audit integrity.
      const draftIds = docsWithMeta
        .filter((item) => item.document.status === "draft")
        .map((item) => item.document.id);
      if (draftIds.length > 0) {
        const { error: docErr } = await supabase
          .from("documents")
          .update({ customer_id: target.id })
          .in("id", draftIds);
        if (docErr) throw docErr;
      }

      toast.success(`เปลี่ยนลูกค้าเป็น ${target.name} แล้ว`);
      setCustomerPickerOpen(false);
      setPendingCustomer(null);
      fetchDealData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "เปลี่ยนลูกค้าไม่สำเร็จ");
    } finally {
      setChangingCustomer(false);
    }
  };

  const handleSetManualStage = async (value: string) => {
    if (!dealId || stageOverrideBusy) return;
    const next = value || null;
    if ((deal?.manual_stage ?? null) === next) return;
    setStageOverrideBusy(true);
    try {
      const { error } = await supabase
        .from("deals")
        .update({ manual_stage: next })
        .eq("id", dealId);
      if (error) throw error;
      toast.success(next ? "ตั้งค่าสถานะเองแล้ว — หน้าหลักจะจัดกลุ่มตามที่เลือก" : "รีเซ็ตสถานะเป็นอัตโนมัติแล้ว");
      fetchDealData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "ตั้งค่าสถานะไม่สำเร็จ");
    } finally {
      setStageOverrideBusy(false);
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

  useEffect(() => {
    if (!activeDoc || activeDoc.document.doc_type !== "invoice" || activeDoc.document.status === "voided") {
      setHasActiveDnLinks(false);
      return;
    }
    const checkDnLinks = async () => {
      const { count } = await supabase
        .from("invoice_delivery_notes")
        .select("*", { count: "exact", head: true })
        .eq("invoice_id", activeDoc.document.id)
        .is("released_at", null);
      setHasActiveDnLinks((count ?? 0) > 0);
    };
    checkDnLinks();
  }, [activeDoc?.document.id, activeDoc?.document.doc_type]);

  const amountDoc = useMemo(() => {
    return (
      [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "billing_note") ||
      [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "invoice") ||
      [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "quotation") ||
      [...nonVoidedDocs].reverse().find((item) => item.document.doc_type === "delivery_note") ||
      null
    );
  }, [nonVoidedDocs]);

  const availableCloneTypes = useMemo(
    () =>
      (
        [
          { type: "quotation" as DocumentType, label: "ใบเสนอราคา" },
          { type: "invoice" as DocumentType, label: "ใบแจ้งหนี้" },
          { type: "delivery_note" as DocumentType, label: "ใบส่งของ" },
        ] as const
      ).filter(({ type }) => docsWithMeta.some((item) => item.document.doc_type === type && item.document.status !== "voided")),
    [docsWithMeta],
  );

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
  // Sent (= not yet fully billed) delivery notes can still be invoiced even
  // after the deal is paid — partial deliveries may continue afterwards.
  const billableSentDns = useMemo(
    () => deliveryNotes.filter((item) => item.document.status === "sent"),
    [deliveryNotes]
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
      if (!canSendDocumentType(permissions, doc.doc_type)) return null;
      return {
        type: "send_draft",
        doc,
        label:
          doc.doc_type === "quotation"
            ? "ส่งใบเสนอราคาให้ลูกค้า"
            : doc.doc_type === "invoice"
              ? "ส่งใบแจ้งหนี้ให้ลูกค้า"
              : doc.doc_type === "delivery_note"
                ? "บันทึกว่าส่งของแล้ว"
              : "ส่งใบวางบิลให้ลูกค้า",
      };
    }
    if (doc.doc_type === "delivery_note" && doc.status === "sent") {
      if (!canSendDocumentType(permissions, doc.doc_type)) return null;
      return { type: "invoice_from_dns", doc, label: "สร้างบิลจากใบส่งของ" };
    }
    if (doc.doc_type === "quotation" && doc.status === "sent") {
      if (!canSendDocumentType(permissions, doc.doc_type)) return null;
      return hasQuotationDeliveryActivity
        ? { type: "delivery_from_quote", doc, label: "บันทึกว่าส่งของแล้ว" }
        : { type: "convert", doc, label: "สร้างบิลต่อ" };
    }
    if (doc.doc_type === "invoice" && doc.status === "sent") {
      if (!permissions.canRecordPayments) return null;
      return { type: "billing", doc, label: "สร้างใบวางบิล" };
    }
    if (doc.doc_type === "billing_note" && (doc.status === "sent" || doc.status === "overdue")) {
      if (!permissions.canRecordPayments) return null;
      return {
        type: "collect",
        doc,
        label: isOverdueDocument(doc) ? "เกินกำหนด — บันทึกรับเงิน" : "บันทึกรับเงิน",
        danger: isOverdueDocument(doc),
      };
    }
    if ((doc.doc_type === "billing_note" || doc.doc_type === "invoice") && doc.status === "partially_paid") {
      if (!permissions.canRecordPayments) return null;
      return { type: "collect", doc, label: "รับชำระเพิ่ม" };
    }
    return null;
  }, [activeDoc, allDone, hasQuotationDeliveryActivity, permissions]);

  const optionalAction = useMemo(() => {
    if (!activeDoc || allDone) return null;
    const doc = activeDoc.document;

    if (doc.doc_type === "quotation" && doc.status === "sent" && canSendDocumentType(permissions, doc.doc_type)) {
      return mainAction?.type === "delivery_from_quote"
        ? { type: "convert" as const, doc, label: "ข้ามส่งของ แล้วสร้างบิล" }
        : { type: "delivery_from_quote" as const, doc, label: "ส่งของก่อน แล้วบันทึกการส่ง" };
    }

    if (doc.doc_type === "invoice" && doc.status === "sent" && permissions.canRecordPayments) {
      return { type: "collect" as const, doc, label: "ข้ามใบวางบิล แล้วบันทึกรับเงิน" };
    }

    return null;
  }, [activeDoc, allDone, mainAction?.type, permissions]);

  const actionHint = useMemo(() => {
    if (!activeDoc?.document.doc_number) return "";
    if (activeDoc.document.due_date) {
      return `ครบกำหนด ${formatBuddhistDate(activeDoc.document.due_date)} • ${activeDoc.document.doc_number}`;
    }
    return activeDoc.document.doc_number;
  }, [activeDoc]);

  const actionHelper = useMemo(() => {
    if (!activeDoc || !mainAction) return "";
    if (mainAction.type === "send_draft" && activeDoc.document.doc_type === "invoice") {
      return "เมื่อส่งใบแจ้งหนี้ ระบบจะตัดสต็อกสินค้าที่อยู่ในเอกสาร";
    }
    if (mainAction.type === "convert") return "ระบบจะสร้างใบแจ้งหนี้จากรายการเดิมให้คุณตรวจสอบ";
    if (mainAction.type === "billing") return "เลือกใบแจ้งหนี้ที่ต้องการรวม แล้วตรวจสอบยอดก่อนบันทึก";
    if (mainAction.type === "collect") return "กรอกวันที่และวิธีรับเงิน ระบบจะสร้างใบเสร็จให้โดยอัตโนมัติ";
    if (mainAction.type === "delivery_from_quote") return "เลือกจำนวนสินค้าที่ส่งในครั้งนี้ แล้วบันทึกใบส่งของ";
    if (mainAction.type === "invoice_from_dns") return "ระบบจะนำรายการจากใบส่งของมาให้ตรวจสอบก่อนออกบิล";
    return "";
  }, [activeDoc, mainAction]);

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

  const financialSummary = useMemo(() => {
    const collectionDocs = nonVoidedDocs.filter((item) =>
      ["billing_note", "invoice", "tax_invoice_receipt"].includes(item.document.doc_type),
    );
    // Active adjustment notes change what the customer owes:
    // credit notes (ใบลดหนี้) reduce it, debit notes (ใบเพิ่มหนี้) increase it.
    const creditNoteDocs = nonVoidedDocs.filter(
      (item) =>
        item.document.doc_type === "credit_note" &&
        !["draft", "voided"].includes(item.document.status),
    );
    const debitNoteDocs = nonVoidedDocs.filter(
      (item) =>
        item.document.doc_type === "debit_note" &&
        !["draft", "voided"].includes(item.document.status),
    );
    const creditTotal = creditNoteDocs.reduce((sum, item) => sum + (item.document.total_amount || 0), 0);
    const debitTotal = debitNoteDocs.reduce((sum, item) => sum + (item.document.total_amount || 0), 0);
    const source = collectionDocs.find((item) => item.document.doc_type === "billing_note") ||
      collectionDocs.find((item) => item.document.doc_type === "invoice") ||
      collectionDocs.find((item) => item.document.doc_type === "tax_invoice_receipt") ||
      amountDoc;
    const grossAmount = source?.document.total_amount || 0;
    const netPayable = source?.document.net_payable || 0;
    const receipts = nonVoidedDocs.filter(
      (item) => item.document.doc_type === "receipt" && ["generated", "issued", "paid"].includes(item.document.status),
    );
    const receiptReceived = receipts.reduce((sum, item) => sum + (item.document.amount_received || 0), 0);
    const sourceGroup = collectionDocs.some((item) => item.document.doc_type === "billing_note")
      ? collectionDocs.filter((item) => item.document.doc_type === "billing_note")
      : collectionDocs.some((item) => item.document.doc_type === "invoice")
        ? collectionDocs.filter((item) => item.document.doc_type === "invoice")
        : collectionDocs.filter((item) => item.document.doc_type === "tax_invoice_receipt");
    const sourceReceived = sourceGroup.reduce((sum, item) => sum + (item.document.amount_received || 0), 0);
    const amountReceived = Math.max(receiptReceived, sourceReceived);
    const expectedWhtAmount = source?.document.wht_amount || 0;
    // Recalculate accumulated WHT from the source document and collected
    // amount so receipts created by the old net-payable bug do not distort
    // the completed-deal summary.
    const whtAmount = expectedWhtAmount > 0 && netPayable > 0
      ? Math.min(expectedWhtAmount, Math.round(expectedWhtAmount * amountReceived / netPayable * 100) / 100)
      : 0;

    // Credit applies to the remaining balance first; any excess becomes
    // customer credit (e.g. crediting a fully-paid invoice).
    const balanceBeforeAdjustment = Math.max(0, netPayable + debitTotal - amountReceived);
    const appliedCredit = Math.min(creditTotal, balanceBeforeAdjustment);
    const customerCredit = Math.max(0, creditTotal - balanceBeforeAdjustment);

    return {
      grossAmount,
      netPayable,
      amountReceived,
      outstanding: Math.max(0, balanceBeforeAdjustment - appliedCredit),
      creditTotal,
      debitTotal,
      customerCredit,
      whtAmount,
      expectedWhtAmount,
      receiptCount: receipts.length,
    };
  }, [amountDoc, nonVoidedDocs]);

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

  const paymentPreview = payDocument
    ? calculateReceiptAllocationFromInput({
        amount: paymentBaseAmount,
        basis: paymentInputBasis,
        vatRate: payDocument.vat_rate,
        vatRegistered: payDocument.vat_registered,
        whtRate: payDocument.wht_rate,
        expectedWht: payDocument.wht_amount || 0,
        previousWht: paymentPreviousWht,
        isFullyPaid: convertReceiptInputToPreTax({ amount: paymentBaseAmount, basis: paymentInputBasis, vatRate: payDocument.vat_rate, whtRate: payDocument.wht_rate, vatRegistered: payDocument.vat_registered }) >= payDocument.subtotal - 0.01,
      })
    : null;

  return (
    <AppShell
      title={title}
      showBack
      action={(
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCloneChooserOpen(true)}
        >
          <Copy size={14} className="mr-1" />
          งานขายใหม่
        </Button>
      )}
    >
      <div className="flex flex-col space-y-3">
        <Card>
          <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {deal?.deal_number && (
                  <div className="text-[11px] font-medium text-primary tabular-nums">{deal.deal_number}</div>
                )}
                <div className="flex items-center gap-2">
                  <div className="text-[15px] font-semibold text-gray-900 truncate">{customer?.name || title}</div>
                  {customer && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/customers/${customer.id}`);
                      }}
                      className="shrink-0 rounded-md p-1 text-gray-400 hover:text-primary hover:bg-primary-soft transition-colors"
                      title="เปิดหน้าลูกค้า"
                      aria-label="เปิดหน้าลูกค้า"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {customer && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomerPickerOpen(true);
                      }}
                      className="shrink-0 rounded-md p-1 text-gray-400 hover:text-primary hover:bg-primary-soft transition-colors"
                      title="เปลี่ยนลูกค้าของงานนี้"
                      aria-label="เปลี่ยนลูกค้าของงานนี้"
                    >
                      <Pencil className="h-3.5 w-3.5" />
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
                      title="คัดลอกเลขที่ผู้เสียภาษี"
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${statusPill.className}`}>
                  {statusPill.label}
                </span>
                <select
                  value={deal?.manual_stage ?? ""}
                  onChange={(e) => handleSetManualStage(e.target.value)}
                  disabled={stageOverrideBusy || !deal}
                  className="rounded-md border border-[#E8E6DF] bg-white px-1.5 py-0.5 text-[11px] text-gray-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  title="ระบุสถานะที่แสดงบนหน้าหลักเอง เมื่อสถานะอัตโนมัติไม่ตรงกับความจริง"
                >
                  <option value="">สถานะหน้าหลัก: อัตโนมัติ</option>
                  {MANUAL_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      สถานะหน้าหลัก: {MANUAL_STAGE_LABELS[stage]}
                    </option>
                  ))}
                </select>
              </div>
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
          {(() => {
            const partialDoc = nonVoidedDocs.find((item) => item.document.status === "partially_paid")?.document;
            if (!partialDoc) return null;
            const remaining = (partialDoc.net_payable || 0) - (partialDoc.amount_received || 0);
            return (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold">ชำระบางส่วน</span>
                  — รับแล้ว ฿{(partialDoc.amount_received || 0).toLocaleString()} จาก ฿{(partialDoc.net_payable || 0).toLocaleString()} คงเหลือ ฿{Math.max(0, remaining).toLocaleString()}
                </div>
              </div>
            );
          })()}
        </Card>
        <Card>
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
                    <div className={`mt-1.5 text-2xs leading-4 text-center ${isDone ? "text-paid-text" : isActive ? "text-primary font-semibold" : "text-gray-500"}`}>
                      {stage.top}
                      <br />
                      {stage.bottom}
                    </div>
                    {isDone && stageDoc?.document.doc_number && (
                      <div className="mt-0.5 max-w-[64px] truncate text-3xs text-paid-text">{stageDoc.document.doc_number}</div>
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
                variant={"danger" in mainAction && mainAction.danger ? "danger" : "primary"}
                className="w-full justify-center py-3 text-sm"
                loading={actionLoadingId === mainAction.doc.id}
                onClick={() => {
                  if (mainAction.type === "send_draft") handleSendDraft(mainAction.doc);
                  if (mainAction.type === "convert") navigate(`/documents/new?type=invoice_from_quotation&quotationId=${mainAction.doc.id}`);
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
              {actionHelper && (
                <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-center text-[11px] leading-4 text-blue-800">
                  ขั้นตอนถัดไป: {actionHelper}
                </div>
              )}
              {optionalAction && (
                <Button
                  variant="secondary"
                  className="mt-2 w-full justify-center py-3 text-sm"
                  loading={actionLoadingId === optionalAction.doc.id}
                  onClick={() => {
                    if (optionalAction.type === "convert") navigate(`/documents/new?type=invoice_from_quotation&quotationId=${optionalAction.doc.id}`);
                    if (optionalAction.type === "delivery_from_quote") {
                      const params = new URLSearchParams({
                        type: "delivery_note_from_quotation",
                        quotationId: optionalAction.doc.id,
                      });
                      navigate(`/documents/new?${params.toString()}`);
                    }
                    if (optionalAction.type === "collect") handleOpenPaymentModal(optionalAction.doc);
                  }}
                >
                  {optionalAction.label}
                </Button>
              )}
            </>
          ) : (
            <div className="rounded-lg bg-stone-50 px-3 py-2 text-center text-xs leading-5 text-gray-600">
              {activeDoc && !allDone
                ? "รอผู้จัดการดำเนินการต่อ เอกสารนี้ถูกบันทึกเป็นฉบับร่างแล้ว"
                : "ไม่มีการดำเนินการที่ต้องทำตอนนี้"}
            </div>
          )}
        </Card>
        {!allDone && (() => {
          const pendingDrafts = docsWithMeta.filter((item) => item.document.status === "draft");
          if (pendingDrafts.length === 0) return null;
          return (
            <Card className="border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-amber-900">
                    มีฉบับร่างค้าง {pendingDrafts.length} รายการ
                  </div>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    ฉบับร่างจะทำให้งานขายยังไม่ปิด — เปิดส่งต่อ หรือลบออกหากไม่ต้องใช้
                  </p>
                  <div className="mt-2 space-y-1">
                    {pendingDrafts.map((item) => (
                      <button
                        key={item.document.id}
                        type="button"
                        onClick={() => navigate(`/documents/${item.document.id}`)}
                        className="block w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-xs font-medium text-ink-900 transition-colors hover:bg-amber-100"
                      >
                        {DOC_TYPE_LABELS[item.document.doc_type]?.th || item.document.doc_type}
                        {item.document.doc_number ? ` · ${item.document.doc_number}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          );
        })()}
        {allDone && summaryStats && (
          <Card className=" border-green-200 bg-green-50">
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
            {availableCloneTypes.length > 0 && (
              <div className="mt-3 border-t border-green-200 pt-3">
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => setCloneChooserOpen(true)}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  สร้างงานขายเหมือนงานนี้
                </Button>
              </div>
            )}
          </Card>
        )}
        {deliveryProgress && (
          <Card className={` ${deliveryProgress.hasOverDelivery ? "border-amber-200 bg-amber-50" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-accent-teal" />
                  <div className="text-sm font-semibold text-ink-900">ความคืบหน้าการส่งของจากใบเสนอราคา</div>
                </div>
                <div className="mt-1 text-xs leading-5 text-gray-500">
                  {deliveryProgress.quotation.doc_number || "ใบเสนอราคา"} • ส่งแล้ว {formatQty(deliveryProgress.totalDelivered)} / เสนอราคา {formatQty(deliveryProgress.totalQuoted)}
                  {deliveryProgress.totalPending > 0 ? ` • ร่างค้าง ${formatQty(deliveryProgress.totalPending)}` : ""}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                allDone
                  ? "bg-paid-bg text-paid-text"
                  : deliveryProgress.allDelivered
                    ? "bg-green-100 text-green-700"
                    : deliveryProgress.hasOverDelivery
                      ? "bg-amber-100 text-amber-800"
                      : "bg-blue-100 text-blue-700"
              }`}>
                {allDone
                  ? "ชำระแล้ว"
                  : deliveryProgress.allDelivered
                    ? "ส่งครบแล้ว"
                    : deliveryProgress.hasOverDelivery
                      ? "มีส่งเกิน"
                      : "กำลังส่ง"}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {deliveryProgress.rows.slice(0, 4).map((row) => (
                <div key={row.line.id} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-900">{row.line.item_name}</div>
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

          {allDone && !deliveryProgress.allDelivered && (
            <p className="mt-2 text-[11px] leading-4 text-gray-400">
              ชำระแล้ว — จำนวนที่เหลือเป็นเพียงบันทึกการส่ง ระบบจะไม่ออกเอกสารเพิ่มจากส่วนนี้
              (หากบันทึกจำนวนผิด ให้ยกเลิกใบส่งของแล้วออกฉบับใหม่)
            </p>
          )}

            {!allDone && (dnAction || billableSentDns.length > 0) && (
              <div className={`mt-3 grid gap-2 ${dnAction && billableSentDns.length > 0 ? "sm:grid-cols-2" : ""}`}>
                {dnAction && (
                  <Button
                    variant="secondary"
                    tone={dnAction.disabled ? "slate" : "teal"}
                    disabled={dnAction.disabled}
                    className="w-full justify-center"
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
                        className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${
                          dnAction.disabled
                            ? "bg-white/70 text-gray-500"
                            : "bg-white/70 text-accent-teal"
                        }`}
                      >
                        {dnAction.badge}
                      </span>
                    )}
                  </Button>
                )}
                {billableSentDns.length > 0 && (
                  <Button
                    className="w-full justify-center"
                    onClick={() =>
                      navigate(
                        `/documents/new?type=invoice_from_delivery_notes&dnId=${billableSentDns[0].document.id}`,
                      )
                    }
                  >
                    สร้างบิลจากใบส่งของ
                    <span className="ml-2 inline-flex items-center rounded-full bg-white/25 px-2 py-0.5 text-2xs font-medium">
                      {billableSentDns.length} ใบ
                    </span>
                  </Button>
                )}
              </div>
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
                          <div className="truncate font-medium text-ink-900">
                            {doc.doc_number || "ยังไม่มีเลขเอกสาร"}
                          </div>
                          <div className="mt-0.5 text-gray-500">
                            {formatBuddhistDate(doc.issue_date)}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-medium ${
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
        {activities.length > 0 && (
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">ประวัติการดำเนินงาน</div>
                <div className="mt-0.5 text-xs text-gray-500">ใครทำอะไรกับงานขายนี้และเมื่อไหร่</div>
              </div>
            </div>
            <div className="space-y-3">
              {(showAllActivities ? activities : activities.slice(0, 5)).map((activity) => {
                const amount = activity.metadata?.amount;
                return (
                  <div key={activity.id} className="flex gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-xs font-medium text-ink-900">{activity.description}</span>
                        <span className="text-2xs text-gray-400">
                          {new Date(activity.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                        <span>{activity.actor_name} · {activity.actor_role}</span>
                        {activity.metadata?.doc_type && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cool-25 px-2 py-0.5 text-2xs font-medium text-gray-600">
                            {DOC_TYPE_LABELS[activity.metadata.doc_type as DocumentType]?.th || activity.metadata.doc_type}
                            {activity.metadata.doc_number ? ` · ${activity.metadata.doc_number}` : ""}
                          </span>
                        )}
                        {typeof amount === "number" ? ` · ฿${formatCurrency(amount)}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {activities.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllActivities((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-700"
              >
                {showAllActivities ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    แสดงน้อยลง
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    ดูเพิ่มเติม ({activities.length - 5} รายการ)
                  </>
                )}
              </button>
            )}
          </Card>
        )}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink-900">สรุปการเงิน</div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                {financialSummary.receiptCount > 0 ? `${financialSummary.receiptCount} ใบเสร็จ` : "ยังไม่มีใบเสร็จ"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {financialSummary.customerCredit > 0 && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-2xs font-medium text-blue-700">
                  เครดิตคงเหลือ ฿{formatCurrency(financialSummary.customerCredit)}
                </span>
              )}
              <div className={`rounded-full px-2.5 py-1 text-2xs font-medium ${financialSummary.outstanding > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                {financialSummary.outstanding > 0 ? "ยังมียอดค้าง" : "รับครบแล้ว"}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
            {[
              { label: "ยอดรวม", value: financialSummary.grossAmount, className: "text-ink-900" },
              ...(financialSummary.debitTotal > 0 ? [{ label: "ยอดเพิ่มหนี้", value: financialSummary.debitTotal, className: "text-amber-700" }] : []),
              ...(financialSummary.creditTotal > 0 ? [{ label: "ยอดลดหนี้", value: -financialSummary.creditTotal, className: "text-red-700" }] : []),
              { label: "ยอดสุทธิ", value: financialSummary.netPayable, className: "text-ink-900" },
              { label: "รับแล้ว", value: financialSummary.amountReceived, className: "text-green-700" },
              { label: "ค้างรับ", value: financialSummary.outstanding, className: financialSummary.outstanding > 0 ? "text-red-700" : "text-green-700" },
              { label: "หัก ณ ที่จ่ายตามเอกสาร", value: financialSummary.expectedWhtAmount, className: financialSummary.expectedWhtAmount > 0 ? "text-amber-700" : "text-gray-500" },
              { label: "หัก ณ ที่จ่ายสะสม", value: financialSummary.whtAmount, className: financialSummary.whtAmount > 0 ? "text-amber-700" : "text-gray-500" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-cool-25 px-2.5 py-2">
                <div className="text-2xs text-gray-500">{item.label}</div>
                <div className={`mt-1 text-sm font-semibold tabular-nums ${item.className}`}>฿{formatCurrency(item.value)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-2xs leading-4 text-gray-400">
            ตามเอกสาร = จำนวนที่ระบุในใบแจ้งหนี้ · สะสม = จำนวนที่เกิดขึ้นจริงจากใบเสร็จ
          </div>
        </Card>
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
                const convertedFromDoc = doc.doc_type === "receipt" && doc.converted_from_id
                  ? docsWithMeta.find((source) => source.document.id === doc.converted_from_id)?.document
                  : null;
                const isCurrent = activeDoc?.document.id === doc.id;
                const overdue = isOverdueDocument(doc);
                const isDoneStage = item.stage === "done" && !isCurrent;
                const isFinancialDocument = doc.doc_type === "invoice" || doc.doc_type === "tax_invoice_receipt";
                return (
                  <div key={doc.id} className={`flex gap-3 ${isDoneStage ? "opacity-80" : ""}`}>
                    <div className="w-7 flex flex-col items-center shrink-0">
                      <div
                        className={[
                          "mt-1 rounded-full",
                          isCurrent ? "w-3 h-3 bg-primary shadow-[0_0_0_3px_rgba(55,138,221,0.12)]" : "w-2.5 h-2.5",
                          doc.status === "draft" ? "bg-stone-300" : "",
                          doc.status === "paid" || doc.status === "generated" || doc.status === "issued" ? "bg-paid-text" : "",
                          doc.status === "partially_paid" ? "bg-amber-600" : "",
                          doc.status === "converted" ? "bg-stone-400" : "",
                          overdue ? "bg-danger" : "",
                          (doc.status === "sent" || doc.status === "in_billing") && !overdue && !isCurrent ? "bg-primary" : "",
                        ].join(" ")}
                      />
                      {index < nonVoidedDocs.length - 1 && <div className="mt-1 w-px flex-1 bg-card-border" />}
                    </div>
                    <Card
                      className={`mb-2 flex-1 ${isCurrent ? "border-primary bg-blue-50/30" : ""} ${isDoneStage ? "bg-paper-field" : ""}`}
                      onClick={() => navigate(`/documents/${doc.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold ${isCurrent ? "text-primary" : "text-gray-900"}`}>
                            {documentTypeLabel(doc.doc_type, doc.vat_registered).thai}
                          </div>
                          <div className={`mt-0.5 text-[11px] ${doc.status === "voided" ? "line-through" : "text-gray-500"}`}>
                            {doc.doc_number || "ยังไม่มีเลขเอกสาร"}
                            {convertedFromDoc && (
                              <span className="text-gray-400"> • จาก {convertedFromDoc.doc_number || ""}</span>
                            )}
                          </div>
                          {copiedFromDoc && (
                            <div className="mt-1 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-2xs font-medium text-blue-700">
                              ออกแทน {copiedFromDoc.doc_number || "เอกสารเดิม"}
                            </div>
                          )}
                          {doc.doc_type === "delivery_note" && doc.status === "draft" && doc.is_blank_form ? (
                            <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-700">
                              ฟอร์มเปล่า
                            </div>
                          ) : null}
                          {isFinancialDocument ? (() => {
                            const sourceDocById = new Map(
                              docsWithMeta
                                .filter((d) => d.document.doc_type === "delivery_note" || d.document.doc_type === "quotation")
                                .map((d) => [d.document.id, {
                                  number: d.document.doc_number || d.document.id.slice(0, 8),
                                  kind: (d.document.doc_type === "quotation" ? "quotation" : "delivery_note") as "quotation" | "delivery_note",
                                }]),
                            );
                            const varianceLines = (item.line_items || [])
                              .filter((li) =>
                                li.source_document_id &&
                                hasDnVariance({
                                  deliveredQty: li.source_delivered_qty,
                                  billedQty: Number(li.quantity) || 0,
                                  unit: li.unit || "ชิ้น",
                                  dnUnitPrice: li.source_unit_price,
                                  unitPrice: Number(li.unit_price) || 0,
                                }),
                              )
                              .map((li) => ({
                                name: li.item_name,
                                parts: getDnVarianceParts({
                                  deliveredQty: li.source_delivered_qty,
                                  billedQty: Number(li.quantity) || 0,
                                  unit: li.unit || "ชิ้น",
                                  dnUnitPrice: li.source_unit_price,
                                  unitPrice: Number(li.unit_price) || 0,
                                  dnDocNumber: sourceDocById.get(li.source_document_id || "")?.number,
                                  sourceKind: sourceDocById.get(li.source_document_id || "")?.kind,
                                }),
                                kind: sourceDocById.get(li.source_document_id || "")?.kind ?? "delivery_note",
                              }));
                            if (varianceLines.length === 0) return null;
                            const uniqueKinds = [...new Set(varianceLines.map((vl) => vl.kind))];
                            const badgeLabel = uniqueKinds.length === 1 ? getSourceVarianceLabel(uniqueKinds[0]) : "ส่วนต่างจากเอกสารต้นฉบับ";
                            return (
                              <div className="mt-1">
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-700">
                                  {badgeLabel}
                                </span>
                                <ul className="mt-1 space-y-0.5">
                                  {varianceLines.map((vl, vi) => (
                                    <li key={vi} className="text-2xs leading-snug text-amber-800">
                                      <span className="font-medium">{vl.name}</span> — {vl.parts.join(" | ")}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })() : null}
                          <div className="mt-1 text-2xs text-gray-400">
                            {formatBuddhistDate(doc.issue_date)}
                            {doc.due_date ? (
                              <>
                                {" • ครบ "}
                                <span className={overdue ? "text-red-700" : ""}>{formatBuddhistDate(doc.due_date)}</span>
                              </>
                            ) : null}
                           </div>
                           {isFinancialDocument && (
                             <div className="mt-1 flex flex-wrap gap-x-2 text-2xs leading-relaxed text-gray-400">
                               <span>ก่อน VAT ฿{formatCurrency(doc.subtotal)}</span>
                               {doc.vat_registered && <span>VAT ฿{formatCurrency(doc.vat_amount)}</span>}
                               {doc.wht_amount > 0 && <span className="text-amber-600">หัก ณ ที่จ่าย -฿{formatCurrency(doc.wht_amount)}</span>}
                             </div>
                           )}
                           {(doc.status === "paid" || doc.status === "partially_paid" || doc.status === "generated" || doc.status === "issued") && (
                            <div className="mt-1 text-2xs leading-relaxed">
                              {doc.doc_type === "receipt" ? (
                                <>
                                  {doc.wht_amount > 0 && (
                                    <div className="text-amber-600">
                                      <span className="font-medium">หัก ณ ที่จ่าย</span> ฿{doc.wht_amount.toLocaleString()}
                                    </div>
                                  )}
                                  {doc.payment_method && (
                                    <div className={doc.wht_amount > 0 ? "text-gray-400" : "text-green-600"}>
                                      {PAYMENT_METHOD_LABELS[doc.payment_method]}
                                    </div>
                                  )}
                                </>
                              ) : doc.status === "partially_paid" ? (
                                <>
                                  <div className="text-green-700">
                                    <span className="font-medium">เก็บแล้ว</span> ฿{(doc.amount_received || 0).toLocaleString()}
                                  </div>
                                  <div className="text-amber-600">
                                    <span className="font-medium">คงเหลือ</span> ฿{Math.max(0, ((doc.net_payable || 0) - (doc.amount_received || 0))).toLocaleString()}
                                    {" "}({Math.round(((doc.amount_received || 0) / (doc.net_payable || 1)) * 100)}%)
                                  </div>
                                   <div className="text-gray-400">
                                     {doc.payment_method ? PAYMENT_METHOD_LABELS[doc.payment_method] : ""}
                                     {!isFinancialDocument && doc.payment_method && doc.wht_amount > 0 ? " · " : ""}
                                     {!isFinancialDocument && doc.wht_amount > 0 ? <>หัก ณ ที่จ่าย ฿{formatCurrency(doc.wht_amount)}</> : ""}
                                   </div>
                                </>
                              ) : (
                                <div className="text-green-600">
                                   {doc.paid_at ? formatBuddhistDate(doc.paid_at) : ""}
                                   {doc.payment_method ? ` · ${PAYMENT_METHOD_LABELS[doc.payment_method]}` : ""}
                                   {!isFinancialDocument && doc.wht_amount > 0 ? <> · หัก ณ ที่จ่าย ฿{formatCurrency(doc.wht_amount)}</> : ""}
                                 </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="text-right">
                            {(isFinancialDocument || doc.doc_type === "billing_note" || doc.doc_type === "receipt") && (
                              <div className="text-2xs text-gray-400">ก่อน VAT ฿{formatCurrency(doc.subtotal)}</div>
                            )}
                            <div className="text-2xs text-gray-400">{isFinancialDocument && doc.wht_amount > 0 ? "รวม" : "ยอดรวม"}</div>
                            <div className="text-sm font-semibold text-gray-900">฿{formatCurrency(getDocumentAmount(doc))}</div>
                            {isFinancialDocument && doc.wht_amount > 0 && (
                              <div className="mt-0.5 text-2xs font-medium text-ink-500">สุทธิ ฿{formatCurrency(doc.net_payable)}</div>
                            )}
                          </div>
                          <Badge status={overdue ? "overdue" : doc.status} />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenPreview(doc);
                            }}
                            className="mt-0.5 inline-flex items-center justify-center rounded-md border border-primary bg-white px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            ดาวน์โหลด
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
                    <Card className="mb-2 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-700">{documentTypeLabel(doc.doc_type, doc.vat_registered).thai}</div>
                          <div className="mt-0.5 text-[11px] text-gray-500 line-through">{doc.doc_number || "ยังไม่มีเลขเอกสาร"}</div>
                          {replacementDoc && (
                            <div className="mt-1 inline-flex rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-800">
                              ออกใหม่เป็น {replacementDoc.doc_number || "ฉบับใหม่"}
                            </div>
                          )}
                          <div className="mt-1 text-2xs text-gray-400">{formatBuddhistDate(doc.issue_date)}</div>
                          {doc.voided_reason && (
                            <div className="mt-0.5 text-2xs text-gray-400 italic">เหตุผล: {doc.voided_reason}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="text-sm font-semibold text-gray-800">฿{formatCurrency(getDocumentAmount(doc))}</div>
                          <Badge status="voided" />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenPreview(doc);
                            }}
                            className="mt-0.5 inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                          >
                            ดาวน์โหลด
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
        <EditableDocNumber
          value={docNumberOverride}
          onChange={setDocNumberOverride}
          placeholder="ตั้งเลขที่เอกสารเอง (เว้นว่าง = อัตโนมัติ)"
          className=" mb-3"
        />
        <Card>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">การจัดการเอกสาร</div>
          <div className="mt-1 text-xs text-gray-500">แก้ไขเอกสารล่าสุดหรือจัดการเอกสารที่เกี่ยวข้อง</div>
          {activeDoc && (
            <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700">
              {activeDoc.document.status === "draft"
                ? "เอกสารร่างสามารถแก้ไขได้โดยตรง"
                : activeDoc.document.doc_type === "invoice" || activeDoc.document.doc_type === "tax_invoice_receipt"
                  ? "ระบบจะเก็บเอกสารเดิมไว้เป็นประวัติ และสร้างฉบับใหม่ให้แก้ไข"
                : "เอกสารที่ส่งแล้วจะถูกยกเลิกและสร้างฉบับร่างใหม่ โดยเก็บฉบับเดิมไว้เป็นประวัติ"}
            </div>
          )}
           <div className="mt-3 grid grid-cols-2 gap-2">
             {nonVoidedDocs.length > 0 && (
                 <div className="col-span-2">
                   <Button
                     variant="secondary"
                     tone="blue"
                     className="w-full justify-center"
                     onClick={() => setShowDocList(true)}
                   >
                     ดาวน์โหลดเอกสาร ({nonVoidedDocs.length})
                   </Button>

                   <Modal open={showDocList} onClose={() => setShowDocList(false)} title="เลือกเอกสาร">
                     <div className="divide-y divide-stone-100">
                       {nonVoidedDocs.map((item) => {
                         const doc = item.document;
                         return (
                           <button
                             key={doc.id}
                             type="button"
                             onClick={() => { handleOpenPreview(doc); setShowDocList(false); }}
                             className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left"
                           >
                             <div className="min-w-0">
                               <div className="text-sm font-medium text-gray-900">
                                 {documentTypeLabel(doc.doc_type, doc.vat_registered).thai}
                               </div>
                               <div className="text-[12px] text-gray-500">
                                 {doc.doc_number || "ยังไม่มีเลขเอกสาร"} · {formatBuddhistDate(doc.issue_date)}
                               </div>
                             </div>
                             <ExternalLink size={14} className="shrink-0 text-gray-300" />
                           </button>
                         );
                       })}
                     </div>
                   </Modal>
                 </div>
             )}
            {activeDoc?.document.doc_type === "tax_invoice_receipt" && activeDoc.document.status === "issued" && canSendDocumentType(permissions, "credit_note") ? (
              <>
                <Button
                  variant="secondary"
                  tone="amber"
                  className="justify-center"
                  onClick={handleCreateCreditNote}
                >
                  ออกใบลดหนี้
                </Button>
                <Button
                  variant="secondary"
                  tone="blue"
                  className="justify-center"
                  onClick={() => handleOpenVoidModal(activeDoc.document, true)}
                >
                  ยกเลิกและออกฉบับใหม่
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                tone={activeDoc?.document.status !== "draft" ? "blue" : "slate"}
                className="col-span-2 justify-center"
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
            {activeDoc?.document.doc_type === "billing_note" && activeDoc.billing_invoices.length > 0 && (
              <Button
                variant="secondary"
                tone="red"
                className="col-span-2 justify-center"
                onClick={handleUnlinkAllInvoices}
              >
                แยกใบแจ้งหนี้ออกจากใบวางบิล
              </Button>
            )}
            {activeDoc?.document.doc_type === "invoice" && hasActiveDnLinks && (
              <Button
                variant="secondary"
                tone="red"
                className="col-span-2 justify-center"
                onClick={handleUnlinkAllDeliveryNotes}
              >
                แยกใบส่งของออกจากใบแจ้งหนี้
              </Button>
            )}
            {allDone && hasPaidDocs && canSendDocumentType(permissions, "credit_note") && !(activeDoc?.document.doc_type === "tax_invoice_receipt" && activeDoc.document.status === "issued") && (
              <div className="col-span-2 grid grid-cols-2 gap-2">
                <Button variant="secondary" tone="slate" className="justify-center" onClick={handleCreateCreditNote}>
                  ออกใบลดหนี้
                </Button>
                <Button variant="secondary" tone="slate" className="justify-center" onClick={() => navigate(`/documents/new?type=debit_note&dealId=${dealId}`)}>
                  ออกใบเพิ่มหนี้
                </Button>
              </div>
            )}
            {isDevMode && (
              <div className="col-span-2 mt-2 pt-2 border-t border-amber-200">
                <Button
                  variant="secondary"
                  tone="red"
                  className="w-full justify-center"
                  onClick={() => setRevertConfirmOpen(true)}
                >
                  ลบงานขายนี้ทั้งชุด (Dev)
                </Button>
              </div>
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

      <Modal open={cloneChooserOpen} onClose={() => setCloneChooserOpen(false)} title="สร้างงานขายเหมือนงานนี้">
        <div className="space-y-2">
          <p className="text-sm text-gray-600">เลือกเอกสารที่ต้องการคัดลอกรายการจาก ระบบจะสร้างงานขายใหม่พร้อมฉบับร่างให้แก้ไข</p>
          {availableCloneTypes.map(({ type, label }) => (
            <Button
              key={type}
              variant="secondary"
              className="w-full justify-center"
              loading={copyingDeal}
              onClick={() => handleCopyDeal(type)}
            >
              เริ่มจาก{label}
            </Button>
          ))}
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
                       <p className="text-sm font-semibold text-amber-900">ยอดก่อน VAT ไม่ตรงกับยอดคงเหลือ</p>
                    <div className="mt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                         <span className="text-amber-700">ยอดก่อน VAT คงเหลือ</span>
                         <span className="font-medium text-amber-900">฿{formatCurrency(paymentBaseRemaining)}</span>
                      </div>
                      <div className="flex justify-between">
                         <span className="text-amber-700">ยอดก่อน VAT ของงวดนี้</span>
                         <span className="font-medium text-amber-900">฿{formatCurrency(paymentPreview?.preTax || 0)}</span>
                      </div>
                      <div className="border-t border-amber-200 pt-1.5 flex justify-between">
                        <span className="text-amber-700">ส่วนต่าง</span>
                         <span className="font-bold text-amber-900">{(paymentPreview?.preTax || 0) > paymentBaseRemaining ? "+" : ""}฿{formatCurrency((paymentPreview?.preTax || 0) - paymentBaseRemaining)}</span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-amber-700">
                       {(paymentPreview?.preTax || 0) < paymentBaseRemaining
                         ? "คุณกำลังบันทึกชำระบางส่วน ยอดคงเหลือจะแสดงในรายงานลูกหนี้จนกว่าจะชำระครบ"
                         : "ยอดก่อน VAT เกินยอดคงเหลือ ระบบจะไม่บันทึกยอดส่วนเกิน"}
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
                   <span className="text-gray-500">ยอดก่อน VAT คงเหลือ</span>
                   <span className="font-semibold">฿{formatCurrency(paymentBaseRemaining)}</span>
                 </div>
                 <div className="mt-2 flex items-center justify-between">
                   <span className="text-gray-500">ยอดก่อน VAT ของงวดนี้</span>
                   <span className="font-medium text-gray-700">฿{formatCurrency(paymentPreview?.preTax || 0)}</span>
                 </div>
                 <div className="mt-2 flex items-center justify-between">
                   <span className="text-gray-500">ยอดรวมก่อนหักภาษี ณ ที่จ่าย</span>
                   <span className="font-medium text-gray-700">฿{formatCurrency(paymentPreview?.grossAmount || 0)}</span>
                 </div>
                 <div className="mt-2 flex items-center justify-between">
                   <span className="text-gray-500">หัก ณ ที่จ่าย</span>
                   <span className="font-medium text-gray-700">฿{formatCurrency(paymentPreview?.whtAmount || 0)}</span>
                 </div>
                 <div className="mt-3 border-t border-card-border pt-2 flex items-center justify-between">
                   <span className="font-medium text-gray-700">ยอดโอนจริงหลังหักภาษี ณ ที่จ่าย</span>
                   <span className="text-base font-semibold">฿{formatCurrency(paymentPreview?.netAmount || 0)}</span>
                </div>
              </div>

               <div>
                 <FieldGuidance
                   title="กรอกยอดโดยอ้างอิงจาก"
                   items={[
                     { label: "ยอดชำระก่อน VAT", description: "ใช้เมื่อกำหนดงวดผ่อนก่อนคิด VAT เช่น งวดละ 200,000 บาท" },
                     { label: "ยอดรวมก่อนหักภาษี ณ ที่จ่าย", description: "ใช้เมื่อลูกค้าตกลงจ่ายยอดรวมรวม VAT ก่อนหักภาษี ณ ที่จ่าย เช่น 214,000 บาท" },
                     { label: "ยอดโอนจริงหลังหักภาษี ณ ที่จ่าย", description: "ใช้เมื่ออ้างอิงจากยอดโอนเข้าบัญชีจริงหลังหักภาษี ณ ที่จ่าย เช่น 208,000 บาท" },
                   ]}
                   tip="ไม่แน่ใจ? เลือก “ยอดชำระก่อน VAT” ตามตารางงวด ระบบคำนวณ VAT, หัก ณ ที่จ่าย และยอดโอนจริงให้อัตโนมัติ"
                 />
                 <select
                   className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white"
                   value={paymentInputBasis}
                   onChange={(e) => {
                     const nextBasis = e.target.value as ReceiptInputBasis;
                     setPaymentBaseAmount(convertReceiptInputAmount({
                       amount: paymentBaseAmount,
                       from: paymentInputBasis,
                       to: nextBasis,
                       vatRate: payDocument.vat_rate,
                       vatRegistered: payDocument.vat_registered,
                       whtRate: payDocument.wht_rate,
                     }));
                     setPaymentInputBasis(nextBasis);
                     setReceiptInputBasisPreference(nextBasis);
                   }}
                 >
                   <option value="pre_tax">ยอดชำระก่อน VAT</option>
                   <option value="gross">ยอดรวมก่อนหักภาษี ณ ที่จ่าย</option>
                   <option value="net_cash">ยอดโอนจริงหลังหักภาษี ณ ที่จ่าย</option>
                 </select>
               </div>
               <Input
                 label={paymentInputBasis === "pre_tax" ? "ยอดชำระก่อน VAT" : paymentInputBasis === "gross" ? "ยอดรวมก่อนหักภาษี ณ ที่จ่าย" : "ยอดโอนจริงหลังหักภาษี ณ ที่จ่าย"}
                 type="number"
                step="0.01"
                 value={paymentBaseAmount || ""}
                 onChange={(e) => setPaymentBaseAmount(parseFloat(e.target.value) || 0)}
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

              {paymentMethod === "bank_transfer" && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">รับเข้าบัญชี</label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white"
                    value={paymentBankAccountId ?? ""}
                    onChange={(e) => setPaymentBankAccountId(e.target.value || null)}
                  >
                    {bankLoading ? (
                      <option value="" disabled>กำลังโหลดบัญชี...</option>
                    ) : bankAccounts.length === 0 ? (
                      <option value="" disabled>ยังไม่มีบัญชีธนาคาร ไปเพิ่มในตั้งค่า</option>
                    ) : (
                      bankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.bank_name} · {account.account_number}
                          {account.account_holder_name ? ` · ${account.account_holder_name}` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

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

              {isPastDate(paymentDate, businessToday) && (
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
                 <Button onClick={handleConfirmPayment} disabled={paying || paymentBaseAmount <= 0}>
                  {paying ? "กำลังบันทึก..." : "ยืนยันการรับเงิน"}
                </Button>
              </div>
                </>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal open={revertConfirmOpen} onClose={() => setRevertConfirmOpen(false)} title="ยืนยันการลบงานขาย (Dev)">
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            การดำเนินการนี้จะลบงานขายนี้<strong>อย่างถาวร</strong> รวมถึง:
            <ul className="mt-1.5 list-disc pl-5 text-xs space-y-0.5">
              <li>ยกเลิกเอกสารทุกฉบับ (คืนสต็อกหากมีการตัด)</li>
              <li>ลบเอกสารและรายการสินค้าทั้งหมด</li>
              <li>ลบงานขายนี้จากระบบ</li>
            </ul>
          </div>
          <p className="text-xs text-gray-500">เฉพาะ Dev mode เท่านั้น ไม่สามารถกู้คืนได้</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setRevertConfirmOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={handleRevertDeal}
              disabled={reverting}
              loading={reverting}
            >
              {reverting ? "กำลังลบ..." : "ลบงานขายนี้"}
            </Button>
          </div>
        </div>
      </Modal>
      <CustomerPickerModal
        open={customerPickerOpen}
        customers={customers}
        selectedCustomerId={deal?.customer_id ?? null}
        onSelect={(selected) => setPendingCustomer(selected)}
        onClose={() => setCustomerPickerOpen(false)}
        onCreate={addCustomer}
      />

      <Modal open={pendingCustomer !== null} onClose={() => setPendingCustomer(null)} title="ยืนยันการเปลี่ยนลูกค้า">
        {pendingCustomer && deal && (
          <div className="space-y-4">
            {customerLockingDocs.length > 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                ไม่สามารถเปลี่ยนลูกค้าได้ เพราะมีเอกสารที่ออกแล้วผูกกับลูกค้าเดิม:
                <ul className="mt-1.5 list-disc pl-5 text-xs space-y-0.5">
                  {customerLockingDocs.slice(0, 5).map((doc) => (
                    <li key={doc.id}>
                      {DOC_TYPE_LABELS[doc.doc_type]?.th || doc.doc_type} {doc.doc_number || ""} ({STATUS_LABELS[doc.status] || doc.status})
                    </li>
                  ))}
                  {customerLockingDocs.length > 5 && <li>และอีก {customerLockingDocs.length - 5} ฉบับ</li>}
                </ul>
                <div className="mt-1.5">ต้องยกเลิกเอกสารเหล่านี้ก่อน จึงจะเปลี่ยนลูกค้าได้</div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="font-medium">{customer?.name}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium text-primary">{pendingCustomer.name}</span>
                </div>
                <ul className="rounded-lg border border-[#E8E6DF] bg-[#FBFAF7] px-3 py-2.5 text-xs text-gray-600 space-y-1">
                  <li>ข้อมูลงาน โน้ต และกิจกรรมทั้งหมดจะยังอยู่ครบ</li>
                  <li>
                    {draftDocCount > 0
                      ? `เอกสารฉบับร่าง ${draftDocCount} ฉบับจะย้ายไปที่ลูกค้าใหม่`
                      : "ไม่มีเอกสารฉบับร่างที่ต้องย้าย"}
                  </li>
                  {sentQuotations.length > 0 && (
                    <li className="text-amber-700">
                      ใบเสนอราคาที่ส่งแล้ว {sentQuotations.length} ฉบับจะยังผูกกับลูกค้าเดิม — หากส่งให้ลูกค้าผิดตัว ควรยกเลิกแล้วออกใหม่
                    </li>
                  )}
                </ul>
              </>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setPendingCustomer(null)}>
                {customerLockingDocs.length > 0 ? "ปิด" : "ยกเลิก"}
              </Button>
              {customerLockingDocs.length === 0 && (
                <Button onClick={() => handleChangeCustomer(pendingCustomer)} disabled={changingCustomer} loading={changingCustomer}>
                  {changingCustomer ? "กำลังเปลี่ยน..." : "ยืนยันเปลี่ยนลูกค้า"}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

    </AppShell>
  );
}
