import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, AlertTriangle, Phone, Copy, CheckCircle2, FileStack, FileText, PackageCheck, ExternalLink, Clock, Pencil, ScrollText, Printer } from "lucide-react";
import {
  fetchSourceDealsForInvoices,
  fetchWorkspaceBillingRefs,
  invoicePaymentLabel,
  invoicePaymentTone,
  type BillingRef,
} from "../../../lib/billingRefs";
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
import { supabase } from "../../../lib/supabase";
import { copyDocumentAsDraft } from "../../../lib/documentCopy";
import { resolveDocNumber } from "../../../lib/docNumber";
import { businessTodayString } from "../../../lib/devDate";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { computeDealFinancialSummary } from "../../../lib/dealFinancials";
import { FinancialSummaryCard } from "../../../components/deal/FinancialSummaryCard";
import { DealSummarySheet } from "../../../components/deal/DealSummarySheet";
import { confirmDraftReceipt } from "../../../lib/receiptConfirm";
import { PaymentModal } from "../../../components/payments/PaymentModal";
import { sendDocumentWithSideEffects } from "../../../lib/documentSend";
import { voidDocumentWithSideEffects } from "../../../lib/documentVoid";
import { revertDeal } from "../../../lib/documentRevert";
import { EditableDocNumber } from "../../../components/documents/EditableDocNumber";
import { DealNotes } from "../../../components/deals/DealNotes";
import { CustomerPickerModal } from "../../../components/customers/CustomerPickerModal";
import { MANUAL_STAGES, MANUAL_STAGE_LABELS, findCustomerLockingDocs } from "../../../lib/dealStages";
import { DOC_TYPE_LABELS, PAYMENT_METHOD_LABELS, STATUS_LABELS } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import { getDnVarianceParts, getSourceVarianceLabel, hasDnVariance } from "../../../lib/dnVariance";
import { canSendDocumentType, getWorkspacePermissions } from "../../../lib/permissions";
import { isRefSummaryLine } from "../../../lib/refSummary";
import { isDocumentOverdue, pickAmountDocument, getStatusPill } from "../../../lib/dealStatus";
import type {
  Document,
  DocumentLineItem,
  BillingNoteInvoice,
  Deal,
  DealActivity,
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

/**
 * A document from ANOTHER deal that this deal's invoices billed (billing-run
 * deals). Display-only: it renders as a card in this deal's document history
 * but stays in its original deal — never re-parented.
 */
interface BorrowedDoc extends DocWithMeta {
  sourceDealId: string;
  sourceDealNumber: string | null;
}




type MainAction =
  | { type: "send_draft"; doc: Document; label: string; danger?: boolean }
  | { type: "convert"; doc: Document; label: string }
  | { type: "delivery_from_quote"; doc: Document; label: string }
  | { type: "invoice_from_dns"; doc: Document; label: string }
  | { type: "billing"; doc: Document; label: string }
  | { type: "confirm_receipt"; doc: Document; label: string }
  | { type: "collect"; doc: Document; label: string; danger?: boolean }
  | { type: "done"; label: string }
  | null;

function getDocStage(doc: Document): "quote" | "invoice" | "collect" | "done" {
  if (doc.status === "voided" || doc.status === "converted") return "done";
  if (doc.doc_type === "quotation") return "quote";
  if (doc.doc_type === "invoice" && doc.status !== "paid" && doc.status !== "partially_paid") return "invoice";
  if (doc.doc_type === "billing_note" && doc.status !== "paid" && doc.status !== "partially_paid") return "collect";
  if (doc.status === "paid" || doc.status === "generated") return "done";
  if (doc.status === "partially_paid") return "collect";
  if (doc.doc_type === "delivery_note") {
    return "invoice";
  }
  if (doc.doc_type === "receipt") return doc.status === "draft" ? "collect" : "done";
  if (doc.doc_type === "credit_note") {
    if (doc.status === "draft") return "collect";
    if (doc.status === "sent" || doc.status === "issued") return "done";
    return "done";
  }
  return "invoice";
}

function getDocumentAmount(doc: Document) {
  if (doc.doc_type === "quotation" || doc.doc_type === "invoice" || doc.doc_type === "delivery_note") return doc.total_amount;
  return doc.net_payable;
}

// A row is a print-structure group title (DN/QT summary header) rather than a
// real sellable item — previews must show real goods/services only.
function isGroupTitleLine(item: DocumentLineItem) {
  return isRefSummaryLine(item) || !!(item.source_document_id && !item.source_line_item_id);
}

function buildItemSummary(lineItems: DocumentLineItem[]) {
  const realItems = lineItems.filter((item) => !isGroupTitleLine(item));
  if (realItems.length === 0) return "";
  const summary = realItems
    .slice(0, 2)
    .map((item) => `${item.item_name} × ${item.quantity}`)
    .join(", ");
  return realItems.length > 2 ? `${summary} และอีก ${realItems.length - 2} รายการ` : summary;
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
  const [borrowedDocs, setBorrowedDocs] = useState<BorrowedDoc[]>([]);
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidDocument, setVoidDocument] = useState<Document | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidAndRecreate, setVoidAndRecreate] = useState(true);
  const [voiding, setVoiding] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payDocument, setPayDocument] = useState<Document | null>(null);
  const [confirmingReceiptDoc, setConfirmingReceiptDoc] = useState<Document | null>(null);
  const [editingDraftReceipt, setEditingDraftReceipt] = useState<Document | null>(null);
  const [paying, setPaying] = useState(false);

  const [showVoided, setShowVoided] = useState(false);
  const [cloneChooserOpen, setCloneChooserOpen] = useState(false);
  const [copyingDeal, setCopyingDeal] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"main" | "activity">("main");
  const [sendConfirmDoc, setSendConfirmDoc] = useState<Document | null>(null);
  const [reverting, setReverting] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [hasActiveDnLinks, setHasActiveDnLinks] = useState(false);
  const [unlinkDnConfirm, setUnlinkDnConfirm] = useState<{
    invoiceNo: string;
    dns: { id: string; no: string }[];
  } | null>(null);
  const [unlinkingDn, setUnlinkingDn] = useState(false);

  const { customers, addCustomer } = useCustomers(userId);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState<Customer | null>(null);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [stageOverrideBusy, setStageOverrideBusy] = useState(false);

  const toast = useToast();
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [showDocList, setShowDocList] = useState(false);


  const fetchDealData = useCallback(async () => {
    if (!dealId || !userId) {
      if (userId === undefined && !deal) {
        return;
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
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

      // Billing-run cross-references: documents from OTHER deals that this
      // deal's invoices billed (junction links + invoice line sources).
      // Display-only — they appear as history cards but stay in their
      // original deals.
      try {
        const ownInvoiceIds = docs.filter((doc) => doc.doc_type === "invoice").map((doc) => doc.id);
        if (ownInvoiceIds.length > 0) {
          const sourceIds = new Set<string>();
          for (const line of (lineItemsData || []) as DocumentLineItem[]) {
            if (line.source_document_id && ownInvoiceIds.includes(line.document_id)) {
              sourceIds.add(line.source_document_id);
            }
          }
          const { data: dnLinks } = await supabase
            .from("invoice_delivery_notes")
            .select("delivery_note_id, invoice_id")
            .in("invoice_id", ownInvoiceIds)
            .is("released_at", null);
          for (const link of (dnLinks || []) as Array<{ delivery_note_id: string }>) {
            if (link.delivery_note_id) sourceIds.add(link.delivery_note_id);
          }
          const borrowedCandidates = Array.from(sourceIds).filter((id) => !docIds.includes(id));
          if (borrowedCandidates.length > 0) {
            const { data: sourceDocsData } = await supabase
              .from("documents")
              .select("*")
              .in("id", borrowedCandidates);
            const sourceDocs = ((sourceDocsData || []) as Document[]).filter(
              (doc) =>
                doc.user_id === userId &&
                doc.deal_id &&
                doc.deal_id !== dealId &&
                doc.status !== "voided",
            );
            if (sourceDocs.length > 0) {
              const sourceDocIds = sourceDocs.map((doc) => doc.id);
              const sourceDealIds = Array.from(
                new Set(sourceDocs.map((doc) => doc.deal_id as string)),
              );
              const [{ data: sourceLines }, { data: sourceDeals }] = await Promise.all([
                supabase
                  .from("document_line_items")
                  .select("*")
                  .in("document_id", sourceDocIds)
                  .order("sort_order", { ascending: true }),
                supabase.from("deals").select("id, deal_number").in("id", sourceDealIds),
              ]);
              const dealNumberById = new Map(
                ((sourceDeals || []) as Array<{ id: string; deal_number: string | null }>).map(
                  (d) => [d.id, d.deal_number],
                ),
              );
              const linesBySourceDoc = new Map<string, DocumentLineItem[]>();
              ((sourceLines || []) as DocumentLineItem[]).forEach((line) => {
                const list = linesBySourceDoc.get(line.document_id) || [];
                list.push(line);
                linesBySourceDoc.set(line.document_id, list);
              });
              setBorrowedDocs(
                sourceDocs
                  .map((doc) => ({
                    document: doc,
                    stage: getDocStage(doc),
                    line_items: linesBySourceDoc.get(doc.id) || [],
                    billing_invoices: [],
                    sourceDealId: doc.deal_id as string,
                    sourceDealNumber: dealNumberById.get(doc.deal_id as string) ?? null,
                  }))
                  .sort((a, b) =>
                    (a.document.created_at || "").localeCompare(b.document.created_at || ""),
                  ),
              );
            } else {
              setBorrowedDocs([]);
            }
          } else {
            setBorrowedDocs([]);
          }
        } else {
          setBorrowedDocs([]);
        }
      } catch (crossRefError) {
        // Borrowed cards are informational; never fail the page over them.
        console.warn("[deal billing cross-refs]", crossRefError);
        setBorrowedDocs([]);
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      setLoadError(err?.message || "ไม่สามารถโหลดข้อมูลงานขายได้");
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

  const performSend = async (doc: Document) => {
    if (!userId) return;
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

  const handleSendDraft = async (doc: Document) => {
    if (!userId) return;
    if (!canSendDocumentType(permissions, doc.doc_type)) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    // Financial documents lock on send — confirm in-app, not via window.confirm.
    if (["invoice", "billing_note"].includes(doc.doc_type)) {
      setSendConfirmDoc(doc);
      return;
    }
    await performSend(doc);
  };

  const handleOpenPaymentModal = (doc: Document) => {
    if (!userId || !permissions.canRecordPayments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    setPayDocument(doc);
    setPaymentModalOpen(true);
  };

  const handleConfirmDraftReceipt = async () => {
    if (!userId) return;
    if (!permissions.canRecordPayments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (!confirmingReceiptDoc) return;
    setPaying(true);
    try {
      await confirmDraftReceipt(confirmingReceiptDoc.id, userId);
      toast.success("ยืนยันการรับเงินสำเร็จ — บันทึกยอดและออกใบเสร็จแล้ว");
      setConfirmingReceiptDoc(null);
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
            customer_po_number: voidDocument.customer_po_number,
            task_name: voidDocument.task_name,
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
                image_url: li.image_url || null,
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
      if (activeDoc.document.doc_type === "receipt") {
        // Draft receipt: reopen the payment modal prefilled from the saved draft.
        const sourceId = activeDoc.document.converted_from_id;
        const source = sourceId
          ? nonVoidedDocs.find((item) => item.document.id === sourceId)?.document || null
          : null;
        if (!source) {
          toast.error("ไม่พบเอกสารอ้างอิงของใบเสร็จร่างนี้");
          return;
        }
        setEditingDraftReceipt(activeDoc.document);
        setPayDocument(source);
        setPaymentModalOpen(true);
        return;
      }
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

    const { data: links, error: linkError } = await supabase
      .from("invoice_delivery_notes")
      .select("delivery_note_id")
      .eq("invoice_id", invoiceId)
      .is("released_at", null);

    if (linkError) {
      toast.error("โหลดรายการใบส่งของไม่สำเร็จ");
      return;
    }
    const dnIds = (links || []).map((l) => l.delivery_note_id).filter(Boolean);
    if (dnIds.length === 0) return;

    const { data: dnDocs } = await supabase
      .from("documents")
      .select("id, doc_number")
      .in("id", dnIds);
    const noById = new Map(
      (dnDocs || []).map((d) => [d.id, d.doc_number || d.id.slice(0, 8)]),
    );
    setUnlinkDnConfirm({
      invoiceNo: activeDoc.document.doc_number || "ใบแจ้งหนี้",
      dns: dnIds.map((id: string) => ({ id, no: noById.get(id) || id.slice(0, 8) })),
    });
  };

  const handleConfirmUnlinkDeliveryNotes = async () => {
    const target = unlinkDnConfirm;
    if (!activeDoc || !userId || !target) return;
    const invoiceId = activeDoc.document.id;

    setUnlinkingDn(true);
    try {
      for (const dn of target.dns) {
        const { data: newDeal, error: dealError } = await supabase
          .from("deals")
          .insert({
            user_id: userId,
            customer_id: activeDoc.document.customer_id,
            is_active: true,
          })
          .select("id")
          .single();

        if (dealError || !newDeal) throw dealError || new Error("สร้างงานขายใหม่ไม่สำเร็จ");
        const { error: dnError } = await supabase
          .from("documents")
          .update({ status: "sent" as DocumentStatus, deal_id: newDeal.id })
          .eq("id", dn.id);
        if (dnError) throw dnError;
      }

      const { error: releaseError } = await supabase
        .from("invoice_delivery_notes")
        .update({ released_at: new Date().toISOString() })
        .eq("invoice_id", invoiceId)
        .is("released_at", null);
      if (releaseError) throw releaseError;

      const { error: voidError } = await supabase
        .from("documents")
        .update({
          status: "voided" as DocumentStatus,
          voided_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);
      if (voidError) throw voidError;

      setUnlinkDnConfirm(null);
      toast.success(
        `แยกใบส่งของ ${target.dns.length} ใบ (${target.dns.map((d) => d.no).join(", ")}) ออกจาก ${target.invoiceNo} แล้ว — ใบส่งของกลับไปออกบิลใหม่ได้ทันที`,
      );
      navigate("/home");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "แยกใบส่งของไม่สำเร็จ");
    } finally {
      setUnlinkingDn(false);
    }
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

  // Document history = this deal's own documents + documents from source
  // deals that this deal's invoices billed. Borrowed documents are
  // display-only cards; deal logic (money, stages, actions) uses
  // nonVoidedDocs only.
  const historyDocs = useMemo(
    () =>
      [...nonVoidedDocs, ...borrowedDocs].sort((a, b) =>
        (a.document.created_at || "").localeCompare(b.document.created_at || ""),
      ),
    [nonVoidedDocs, borrowedDocs]
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
    // Shared selector (BN > INV > TIR > QT > DN) — same result as home.
    const picked = pickAmountDocument(nonVoidedDocs.map((item) => item.document));
    return picked ? nonVoidedDocs.find((item) => item.document.id === picked.id) ?? null : null;
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
    () =>
      nonVoidedDocs.find((item) =>
        item.line_items.some((li) => !isGroupTitleLine(li))
      ) || null,
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
  const hasPaidDocs = nonVoidedDocs.some((item) => item.document.status === "paid");
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

    const latestPaid = [...nonVoidedDocs]
      .reverse()
      .find((item) => item.document.status === "paid");
    if (latestPaid) return latestPaid.document;

    return activeDoc?.document || nonVoidedDocs[nonVoidedDocs.length - 1]?.document || null;
  }, [activeDoc, allDone, nonVoidedDocs]);
  const title = deal?.title || customer?.name || "งานขาย";
  const statusPill = getStatusPill(statusDoc);
  const isOverdue = statusDoc ? isDocumentOverdue(statusDoc) : false;
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
      if (doc.doc_type === "receipt") {
        if (!permissions.canRecordPayments) return null;
        return { type: "confirm_receipt", doc, label: "ยืนยันการรับเงิน" };
      }
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
        label: isDocumentOverdue(doc) ? "เกินกำหนด — บันทึกรับเงิน" : "บันทึกรับเงิน",
        danger: isDocumentOverdue(doc),
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
      if (doc.doc_type === "receipt" && !map.has(4)) map.set(4, item);
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

  const financialSummary = useMemo(
    () =>
      computeDealFinancialSummary(
        nonVoidedDocs.map((item) => item.document),
        amountDoc?.document ?? null,
      ),
    [amountDoc, nonVoidedDocs],
  );

  // Billing cross-references (best-effort): this deal's documents billed in
  // another deal's invoice (source deals), or other deals' documents combined
  // into this deal's invoice (billing-run deals).
  const [billingRefs, setBillingRefs] = useState<{
    billedIn: BillingRef | null;
    sourceDeals: Array<{ dealId: string; dealNumber: string | null; invoiceNumber: string | null }>;
  }>({ billedIn: null, sourceDeals: [] });

  useEffect(() => {
    if (!userId || !deal || nonVoidedDocs.length === 0) {
      setBillingRefs({ billedIn: null, sourceDeals: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const refs = await fetchWorkspaceBillingRefs(userId);
        if (cancelled) return;
        let billedIn: BillingRef | null = null;
        for (const item of nonVoidedDocs) {
          const ref = refs.get(item.document.id);
          if (ref && ref.dealId !== deal.id) {
            billedIn = ref;
            break;
          }
        }
        const myInvoiceIds = nonVoidedDocs
          .filter((item) => item.document.doc_type === "invoice")
          .map((item) => item.document.id);
        const sourceDeals = myInvoiceIds.length
          ? await fetchSourceDealsForInvoices(userId, myInvoiceIds, deal.id)
          : [];
        if (cancelled) return;
        setBillingRefs({ billedIn, sourceDeals });
      } catch {
        if (!cancelled) setBillingRefs({ billedIn: null, sourceDeals: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, deal, nonVoidedDocs]);

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
        {loadError ? (
          <div className="space-y-3 py-10 text-center">
            <p className="text-sm font-medium text-red-700">โหลดงานขายไม่สำเร็จ</p>
            <p className="text-xs text-gray-500">{loadError}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                fetchDealData();
              }}
            >
              ลองอีกครั้ง
            </Button>
          </div>
        ) : (
          <EmptyState title="ไม่พบข้อมูลงานขายนี้" description="งานขายนี้อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึง" />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={title}
      showBack
      action={(
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={nonVoidedDocs.length === 0}
            onClick={() => {
              if (nonVoidedDocs.length === 1) {
                handleOpenPreview(nonVoidedDocs[0].document);
              } else if (nonVoidedDocs.length > 1) {
                setShowDocList(true);
              }
            }}
          >
            <Printer size={14} className="mr-1" />
            พิมพ์เอกสาร
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCloneChooserOpen(true)}
          >
            <Copy size={14} className="mr-1" />
            งานขายใหม่
          </Button>
        </div>
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
              <Button
                variant="secondary"
                size="sm"
                className="mt-2 inline-flex items-center gap-1.5"
                onClick={() => setSummaryOpen(true)}
              >
                <ScrollText className="h-3.5 w-3.5" />
                สรุปงานขาย
              </Button>
            </div>
          </div>
          {(billingRefs.billedIn || billingRefs.sourceDeals.length > 0) && (
            <div className="mt-3 space-y-2">
              {billingRefs.billedIn && (
                <button
                  type="button"
                  onClick={() => navigate(`/deals/${billingRefs.billedIn!.dealId}`)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                    invoicePaymentTone(billingRefs.billedIn.invoiceStatus) === "paid"
                      ? "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  }`}
                >
                  <span>
                    {billingRefs.billedIn.kind === "billing_note"
                      ? "งานนี้ถูกวางบิลในใบวางบิลของ"
                      : "งานนี้ถูกรวมออกบิลเป็นใบแจ้งหนี้ใน"}{" "}
                    <span className="font-semibold">
                      {billingRefs.billedIn.dealNumber || billingRefs.billedIn.invoiceNumber || "งานขายอื่น"}
                    </span>{" "}
                    · {invoicePaymentLabel(billingRefs.billedIn.invoiceStatus)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
              {billingRefs.sourceDeals.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <FileStack className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    รวมจาก {billingRefs.sourceDeals.length} งานขาย:{" "}
                    {billingRefs.sourceDeals.map((s, i) => (
                      <span key={s.dealId}>
                        {i > 0 && ", "}
                        <button
                          type="button"
                          onClick={() => navigate(`/deals/${s.dealId}`)}
                          className="font-semibold hover:underline"
                        >
                          {s.dealNumber || "(ไม่มีเลขงานขาย)"}
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}
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

        <div className="flex gap-1 rounded-xl bg-stone-100 p-1" role="tablist" aria-label="ส่วนของงานขาย">
          {([
            ["main", "เอกสาร"],
            ["activity", activities.length > 0 ? `กิจกรรม (${activities.length})` : "กิจกรรม"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                activeTab === key
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "main" && (
        <>
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
                  if (mainAction.type === "confirm_receipt") setConfirmingReceiptDoc(mainAction.doc);
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
              {activeDoc?.document.status === "draft" && (
                <Button
                  variant="secondary"
                  className="mt-2 w-full justify-center py-3 text-sm"
                  onClick={handleCurrentDocAction}
                >
                  แก้ไขฉบับร่าง
                </Button>
              )}
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
        <FinancialSummaryCard summary={financialSummary}>
          <div className={`rounded-full px-2.5 py-1 text-2xs font-medium ${financialSummary.outstanding > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
            {financialSummary.outstanding > 0 ? "ยังมียอดค้าง" : "รับครบแล้ว"}
          </div>
        </FinancialSummaryCard>
        </>
        )}
        {activeTab === "activity" && activities.length === 0 && (
          <Card>
            <EmptyState title="ยังไม่มีความเคลื่อนไหว" description="กิจกรรมทั้งหมดในงานขายนี้จะแสดงที่นี่" />
          </Card>
        )}
        {activeTab === "activity" && (
        <>
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

        {dealId && userId && (
          <DealNotes
            dealId={dealId}
            userId={userId}
            authorName={userEmail.split("@")[0] || "คุณ"}
            authorRole={workspaceRole || "owner"}
          />
        )}
        </>
        )}
        {activeTab === "main" && (
        <>
        <div>
          <div className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">ประวัติเอกสาร</div>
          {historyDocs.length === 0 ? (
            <Card className="border-[0.5px]">
              <EmptyState title="ยังไม่มีเอกสาร" description="กดปุ่มด้านบนเพื่อเริ่มต้นขั้นตอนของงานขายนี้" />
            </Card>
          ) : (
            <div className="space-y-0">
              {historyDocs.map((item, index) => {
                const doc = item.document;
                const isBorrowed = "sourceDealId" in item;
                const borrowed = isBorrowed ? (item as BorrowedDoc) : null;
                const copiedFromDoc = doc.copied_from_id
                  ? docsWithMeta.find((source) => source.document.id === doc.copied_from_id)?.document
                  : null;
                const convertedFromDoc = doc.doc_type === "receipt" && doc.converted_from_id
                  ? docsWithMeta.find((source) => source.document.id === doc.converted_from_id)?.document
                  : null;
                const isCurrent = !isBorrowed && activeDoc?.document.id === doc.id;
                const overdue = isDocumentOverdue(doc);
                const isDoneStage = item.stage === "done" && !isCurrent;
                const isFinancialDocument = doc.doc_type === "invoice";
                if (isBorrowed && borrowed) {
                  return (
                    <div key={doc.id} className={`flex gap-3 ${isDoneStage ? "opacity-80" : ""}`}>
                      <div className="w-7 flex flex-col items-center shrink-0">
                        <div
                          className={[
                            "mt-1 rounded-full",
                            "w-2.5 h-2.5",
                            doc.status === "draft" ? "bg-stone-300" : "",
                            doc.status === "paid" || doc.status === "generated" || doc.status === "issued" ? "bg-paid-text" : "",
                            doc.status === "converted" ? "bg-stone-400" : "",
                            overdue ? "bg-danger" : "",
                          ].join(" ")}
                        />
                        {index < historyDocs.length - 1 && <div className="mt-1 w-px flex-1 bg-card-border" />}
                      </div>
                      <Card
                        className="mb-2 flex-1 bg-paper-field"
                        onClick={() => navigate(`/documents/${doc.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-900">
                              {documentTypeLabel(doc.doc_type, doc.vat_registered).thai}
                            </div>
                            <div className="mt-0.5 text-[11px] text-gray-500">
                              {doc.doc_number || "ยังไม่มีเลขเอกสาร"}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/deals/${borrowed.sourceDealId}`);
                              }}
                              className="mt-1 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-2xs font-medium text-blue-700 hover:bg-blue-100"
                              title="เปิดงานขายต้นทางของเอกสารนี้"
                            >
                              จากงานขาย {borrowed.sourceDealNumber || "(ไม่มีเลขงานขาย)"}
                            </button>
                            <div className="mt-1 text-2xs text-gray-400">
                              {formatBuddhistDate(doc.issue_date)}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <div className="text-right">
                              <div className="text-2xs text-gray-400">ยอดรวม</div>
                              <div className="text-sm font-semibold text-gray-900">฿{formatCurrency(getDocumentAmount(doc))}</div>
                            </div>
                            <Badge status={overdue ? "overdue" : doc.status} />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenPreview(doc);
                              }}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-stone-100 hover:text-primary transition-colors"
                              title="พรีวิวเอกสาร"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </Card>
                    </div>
                  );
                }
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
                       {index < historyDocs.length - 1 && <div className="mt-1 w-px flex-1 bg-card-border" />}
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
                              historyDocs
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
                            พิมพ์ / PDF
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
                            พิมพ์ / PDF
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
                : activeDoc.document.doc_type === "invoice"
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
                      พิมพ์เอกสาร ({nonVoidedDocs.length})
                    </Button>
                  </div>
              )}
            {activeDoc?.document.status === "draft" ? null : (
              <Button
                variant="secondary"
                tone="blue"
                className="col-span-2 justify-center"
                onClick={handleCurrentDocAction}
              >
                {activeDoc?.document.doc_type === "billing_note" && activeDoc?.document.status !== "paid"
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
            {allDone && hasPaidDocs && canSendDocumentType(permissions, "credit_note") && (
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
        </>
        )}
      </div>

      <Modal open={!!sendConfirmDoc} onClose={() => setSendConfirmDoc(null)} title="ยืนยันการส่งเอกสาร">
        {sendConfirmDoc && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              <span className="font-semibold">{sendConfirmDoc.doc_number || "เอกสาร"}</span> จะถูกล็อคหลังส่ง
              หากผิดต้องยกเลิกและออกใหม่
            </div>
            <p className="text-sm text-gray-600">ยืนยันส่งเอกสารนี้ให้ลูกค้าหรือไม่?</p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setSendConfirmDoc(null)}>ยกเลิก</Button>
              <Button
                onClick={async () => {
                  const target = sendConfirmDoc;
                  setSendConfirmDoc(null);
                  await performSend(target);
                }}
                loading={actionLoadingId === sendConfirmDoc.id}
              >
                ส่งเอกสาร
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
        title={voidAndRecreate ? "แก้ไขโดยออกฉบับใหม่" : "ยกเลิกเอกสาร"}
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
          {voidAndRecreate && voidDocument && voidDocument.doc_type === "invoice" && (
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
                  {voiding ? "กำลังยกเลิก..." : "แก้ไขโดยออกฉบับใหม่"}
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

      <Modal
        open={!!unlinkDnConfirm}
        onClose={() => { if (!unlinkingDn) setUnlinkDnConfirm(null); }}
        title="แยกใบส่งของออกจากใบแจ้งหนี้"
      >
        {unlinkDnConfirm && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              <span className="font-semibold">{unlinkDnConfirm.invoiceNo}</span> จะถูกยกเลิกและเก็บไว้เป็นประวัติ
              ใบส่งของ {unlinkDnConfirm.dns.length} ใบจะถูกแยกออกและกลับไปออกบิลใหม่ได้ทันที
            </div>
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
              {unlinkDnConfirm.dns.map((dn) => (
                <li key={dn.id} className="px-3 py-2 text-sm text-gray-700">
                  ใบส่งของ <span className="font-medium text-gray-900">{dn.no}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-600">ยืนยันแยกใบส่งของเหล่านี้ออกจากใบแจ้งหนี้หรือไม่?</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setUnlinkDnConfirm(null)} disabled={unlinkingDn}>
                ยกเลิก
              </Button>
              <Button variant="danger" className="flex-1" onClick={handleConfirmUnlinkDeliveryNotes} loading={unlinkingDn}>
                {unlinkingDn ? "กำลังแยก..." : "ยืนยันการแยก"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {payDocument && (
        <PaymentModal
          open={paymentModalOpen}
          onClose={() => {
            setPaymentModalOpen(false);
            setPayDocument(null);
            setEditingDraftReceipt(null);
          }}
          sourceDoc={payDocument}
          draftReceipt={editingDraftReceipt}
          dealId={dealId}
          businessToday={businessToday}
          onSaved={() => {
            setPayDocument(null);
            setEditingDraftReceipt(null);
            fetchDealData();
          }}
        />
      )}

      <Modal open={!!confirmingReceiptDoc} onClose={() => setConfirmingReceiptDoc(null)} title="ยืนยันการรับเงิน">
        {confirmingReceiptDoc && (
          <div className="space-y-4">
            <div className="rounded-lg bg-stone-50 border border-card-border px-4 py-3 text-sm space-y-2">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">ใบเสร็จ</span>
                <span className="font-medium">{confirmingReceiptDoc.doc_number || "-"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">วันที่รับเงิน</span>
                <span>{formatBuddhistDate(confirmingReceiptDoc.issue_date)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">ยอดรับสุทธิ</span>
                <span className="font-semibold">฿{formatCurrency(confirmingReceiptDoc.net_payable)}</span>
              </div>
            </div>
            <p className="text-xs leading-5 text-gray-500">
              ยืนยันแล้วระบบจะบันทึกยอดรับเงิน ปรับสถานะเอกสารอ้างอิงเป็นชำระแล้ว และนับเป็นรายได้ของงวดนี้
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setConfirmingReceiptDoc(null)}>ยกเลิก</Button>
              <Button onClick={handleConfirmDraftReceipt} loading={paying}>ยืนยันการรับเงิน</Button>
            </div>
          </div>
        )}
      </Modal>

      <DealSummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        dealNumber={(deal as any)?.deal_number || null}
        customerName={customer?.name}
        documents={docsWithMeta.map((item) => item.document)}
        activities={activities}
      />
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
