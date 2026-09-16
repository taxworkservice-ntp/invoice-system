import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Ban, CalendarDays, CheckCircle2, CircleDollarSign, Copy, CreditCard, FileStack, FileText, MoreHorizontal, NotebookText, Pencil, Printer, Trash2, UserRound } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input, Select } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Spinner } from "../../../components/ui/Spinner";
import { FieldGuidance } from "../../../components/ui/FieldGuidance";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { getDocumentDetail, saveLineItems } from "../../../hooks/useDocuments";
import { useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { warmPdfCache } from "../../../lib/pdfWarm";
import { voidDocumentWithSideEffects } from "../../../lib/documentVoid";
import { copyDocumentAsDraft } from "../../../lib/documentCopy";
import { deleteDraftDocument } from "../../../lib/documentDelete";
import { assertDocNumberAvailable, resolveDocNumber } from "../../../lib/docNumber";
import { confirmDraftReceipt } from "../../../lib/receiptConfirm";
import { PaymentModal } from "../../../components/payments/PaymentModal";
import { businessTodayString } from "../../../lib/devDate";
import { deductStockOnDocumentSent, restoreStockOnVoid } from "../../../lib/stock";
import { EditableDocNumber, EditableDocNumberInline } from "../../../components/documents/EditableDocNumber";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Money } from "../../../components/ui/Money";
import { AmountRow } from "../../../components/ui/AmountRow";
import { PAYMENT_METHOD_LABELS } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import { isDocumentOverdue } from "../../../lib/dealStatus";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { TABLE } from "../../../lib/tableStyles";
import { canSendDocumentType, getWorkspacePermissions } from "../../../lib/permissions";
import type { Document, Customer, DocumentStatus, PaymentMethod, ClientProfile, DocumentLineItem, BillingNoteInvoice, InvoiceDeliveryNote, ReceiptInvoice, DocumentType } from "../../../types";

function formatDate(date: string): string {
  return formatBuddhistDate(date);
}

function getDisplayAmount(doc: Document): number {
  return doc.doc_type === "delivery_note" ? doc.total_amount : doc.net_payable;
}

function getDisplayAmountLabel(doc: Document): string {
  if (doc.doc_type === "delivery_note") return "มูลค่าอ้างอิง";
  return doc.wht_rate > 0 ? "ยอดสุทธิหลังหัก ณ ที่จ่าย" : "ยอดที่ต้องชำระ";
}

const CORRECTION_REASONS = [
  { value: "customer_info", label: "ข้อมูลลูกค้าผิด เช่น ชื่อ เลขที่ผู้เสียภาษี หรือที่อยู่" },
  { value: "document_info", label: "ข้อมูลเอกสารผิด เช่น วันที่ เลขที่ หรืออ้างอิง" },
  { value: "items", label: "รายการสินค้า/บริการหรือจำนวนผิด" },
  { value: "amount_tax", label: "ราคา ส่วนลด หรือภาษีผิด" },
  { value: "customer_request", label: "ลูกค้าขอเปลี่ยนข้อมูลในเอกสาร" },
  { value: "other", label: "อื่น ๆ" },
] as const;

function DocTypeBadge({ docType, vatRegistered }: { docType: Document["doc_type"]; vatRegistered: boolean }) {
  return <StatusBadge docType={docType} vatRegistered={vatRegistered} />;
}

function DetailCard({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-card-border bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        {icon ? <span className="text-ink-300">{icon}</span> : null}
        <h3 className="text-body font-semibold text-ink-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function MenuItem({
  icon,
  danger,
  onClick,
  children,
}: {
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-body ${ danger ? "text-red-600 hover:bg-red-50" : "text-ink-700 hover:bg-paper-field" }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const businessToday = businessTodayString(clientProfile);
  const devIssueDate = clientProfile?.dev_mode_enabled && clientProfile.dev_effective_date ? businessToday : undefined;
  const todayString = () => businessToday;

  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [voidModal, setVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [voidAndRecreate, setVoidAndRecreate] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const [payModal, setPayModal] = useState(false);
  const [paymentBaseRemaining, setPaymentBaseRemaining] = useState(0);
  const [paymentPreviousWht, setPaymentPreviousWht] = useState(0);
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const [confirmingReceipt, setConfirmingReceipt] = useState(false);

  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [showNumberOverride, setShowNumberOverride] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [dnInvoiceRef, setDnInvoiceRef] = useState<{ id: string; doc_number: string | null } | null>(null);
  const [copiedFromRef, setCopiedFromRef] = useState<{ id: string; doc_number: string | null } | null>(null);
  const [replacementRef, setReplacementRef] = useState<{ id: string; doc_number: string | null } | null>(null);
  const [dealChain, setDealChain] = useState<{ id: string; doc_type: DocumentType; doc_number: string | null }[]>([]);


  const fetchDoc = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getDocumentDetail(id);
      setDoc(data);
      const [copiedFromResult, replacementResult, dealChainResult] = await Promise.all([
        data.copied_from_id
          ? supabase
              .from("documents")
              .select("id, doc_number")
              .eq("id", data.copied_from_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("documents")
          .select("id, doc_number")
          .eq("copied_from_id", data.id)
          .neq("status", "voided")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        data.deal_id
          ? supabase
              .from("documents")
              .select("id, doc_type, doc_number")
              .eq("deal_id", data.deal_id)
              .neq("status", "voided")
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);
      setCopiedFromRef(copiedFromResult.data ? { id: (copiedFromResult.data as any).id, doc_number: (copiedFromResult.data as any).doc_number } : null);
      setReplacementRef(replacementResult.data ? { id: (replacementResult.data as any).id, doc_number: (replacementResult.data as any).doc_number } : null);
      setDealChain((dealChainResult.data || []) as { id: string; doc_type: DocumentType; doc_number: string | null }[]);
      if (data.doc_type === "delivery_note") {
        const { data: link } = await supabase
          .from("invoice_delivery_notes")
          .select("invoice:invoice_id(id, doc_number)")
          .eq("delivery_note_id", data.id)
          .is("released_at", null)
          .maybeSingle();
        const invoice = (link as any)?.invoice;
        setDnInvoiceRef(invoice ? { id: invoice.id, doc_number: invoice.doc_number } : null);
      } else {
        setDnInvoiceRef(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoc();
  }, [id]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsMenuOpen]);

  const handleDelete = async () => {
    if (!doc || !userId) return;
    if (!permissions.canDeleteDocuments) {
      setError("สิทธิ์นี้ทำได้เฉพาะ Owner");
      return;
    }
    setDeleting(true);
    try {
      await deleteDraftDocument(doc);
      setDeleteModal(false);
      if (doc.deal_id) navigate(`/deals/${doc.deal_id}`);
      else navigate("/documents");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleVoid = async () => {
    if (!doc || !userId) return;
    if (!permissions.canVoidDocuments) {
      setError("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (voidAndRecreate && !correctionReason) {
      setError("กรุณาเลือกสาเหตุการแก้ไข");
      return;
    }
    setVoiding(true);
    try {
      const reasonLabel = CORRECTION_REASONS.find((reason) => reason.value === correctionReason)?.label;
      const finalReason = voidAndRecreate && reasonLabel
        ? `${reasonLabel}${voidReason.trim() ? `: ${voidReason.trim()}` : ""}`
        : voidReason;
      await voidDocumentWithSideEffects(doc, userId, finalReason);

      let recreatedDocId: string | null = null;
      let recreatedIsUtility = false;

      if (voidAndRecreate) {
        const issueDate = doc.issue_date || todayString();
        const newDocNumber = await resolveDocNumber(userId, doc.doc_type, issueDate, docNumberOverride);
        const { data: newDoc } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            deal_id: doc.deal_id,
            customer_id: doc.customer_id,
            doc_type: doc.doc_type,
            doc_number: newDocNumber,
            status: "draft" as DocumentStatus,
            issue_date: issueDate,
            due_date: doc.due_date,
            vat_registered: doc.vat_registered,
            vat_rate: doc.vat_rate,
            wht_rate: doc.wht_rate,
            discount_percent: doc.discount_percent,
            discount_amount: doc.discount_amount,
            subtotal: doc.subtotal,
            vat_amount: doc.vat_amount,
            total_amount: doc.total_amount,
            wht_amount: doc.wht_amount,
            net_payable: doc.net_payable,
            note: doc.note,
            customer_po_number: doc.customer_po_number,
            task_name: doc.task_name,
            converted_from_id:
              doc.doc_type === "credit_note" || doc.doc_type === "debit_note"
                ? doc.converted_from_id
                : null,
            payment_method: null,
            amount_received: null,
            paid_at: null,
            wht_certificate_no: null,
            copied_from_id: doc.id,
          })
          .select("*")
          .single();

        if (newDoc) {
          recreatedDocId = newDoc.id;
          recreatedIsUtility = isUtilityBill;

          if (doc.line_items?.length) {
            await saveLineItems(
              doc.line_items.map((lineItem, index) => ({
                document_id: newDoc.id,
                user_id: userId,
                item_id: lineItem.item_id,
                item_name: lineItem.item_name,
                line_note: lineItem.line_note || null,
                item_sku: lineItem.item_sku,
                item_type: lineItem.item_type,
                unit: lineItem.unit,
                unit_price: lineItem.unit_price,
                quantity: lineItem.quantity,
                base_quantity: lineItem.base_quantity,
                discount_percent: lineItem.discount_percent,
                discount_amount: lineItem.discount_amount,
                qty_carton: lineItem.qty_carton,
                carton_unit: lineItem.carton_unit,
                source_document_id: lineItem.source_document_id,
                source_line_item_id: lineItem.source_line_item_id,
                source_section: (lineItem as { source_section?: number | null }).source_section ?? null,
                line_total: lineItem.line_total,
                image_url: lineItem.image_url || null,
                sort_order: index,
              }))
            );
          }
        }

        if (doc.doc_type === "billing_note") {
          const { data: billingNoteInvoices } = await supabase
            .from("billing_note_invoices")
            .select("*")
            .eq("billing_note_id", doc.id);

          if (billingNoteInvoices?.length) {
            await supabase.from("billing_note_invoices").insert(
              billingNoteInvoices.map((billingNote: any) => ({
                billing_note_id: newDoc.id,
                invoice_id: billingNote.invoice_id,
                user_id: userId,
                invoice_number: billingNote.invoice_number,
                issue_date: billingNote.issue_date || null,
                subtotal: billingNote.subtotal,
                vat_amount: billingNote.vat_amount,
                total_amount: billingNote.total_amount,
              }))
            );
          }
        }
      }

      setVoidModal(false);
      setVoidReason("");
      setCorrectionReason("");
      setVoidAndRecreate(false);

      if (recreatedDocId && recreatedIsUtility) {
        navigate(`/documents/${recreatedDocId}/edit-utility`);
        return;
      }

      if (recreatedDocId && doc.deal_id) {
        navigate(`/deals/${doc.deal_id}`);
        return;
      }

      await fetchDoc();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVoiding(false);
    }
  };

  const handleCopy = async () => {
    if (!doc || !userId) return;
    setActionLoading("copy");
    try {
      const { data: copy, error: copyError } = await copyDocumentAsDraft(doc, userId, {
        issueDate: todayString(),
        docNumberOverride: docNumberOverride,
      });
      if (copyError || !copy) throw copyError || new Error("คัดลอกเอกสารไม่สำเร็จ");
      navigate(`/documents/${copy.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGeneratePdf = () => {
    if (!doc) return;
    const previewUrl = `/documents/${doc.id}/print`;
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  const openPayModal = () => {
    if (!doc || !userId) return;
    if (!permissions.canRecordPayments) {
      setError("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    setPayModal(true);
  };

  type LineItemSortKey = "item_name" | "quantity" | "unit_price" | "line_total";
  type BillingInvoiceSortKey = "invoice_number" | "subtotal" | "vat_amount" | "total_amount";
  type ReceiptInvoiceSortKey = "invoice_number" | "issue_date" | "paid_amount";
  type DeliveryNoteSortKey = "delivery_note_number" | "issue_date" | "total_amount";

  const lineItemSort = useTableSort<DocumentLineItem, LineItemSortKey>(doc?.line_items || [], { key: "item_name", dir: "asc" });
  const billingInvoiceSort = useTableSort<BillingNoteInvoice, BillingInvoiceSortKey>(doc?.billing_invoices || [], { key: "invoice_number", dir: "asc" });
  const receiptInvoiceSort = useTableSort<ReceiptInvoice, ReceiptInvoiceSortKey>(doc?.receipt_invoices || [], { key: "invoice_number", dir: "asc" });
  const deliveryNoteSort = useTableSort<InvoiceDeliveryNote, DeliveryNoteSortKey>(doc?.invoice_delivery_notes || [], { key: "delivery_note_number", dir: "asc" });

  // Receipt settled via a billing note: display the ใบวางบิล itself as the
  // paid reference (mirrors print.ts behavior).
  const sourceBillingNoteId =
    doc?.doc_type === "receipt"
      ? doc.receipt_invoices?.find((r) => r.source_billing_note_id)?.source_billing_note_id ?? null
      : null;
  const [paidViaBillingNote, setPaidViaBillingNote] = useState<Document | null>(null);
  useEffect(() => {
    if (!sourceBillingNoteId) {
      setPaidViaBillingNote(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("documents")
      .select("id, doc_number, issue_date, subtotal, vat_amount, total_amount")
      .eq("id", sourceBillingNoteId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setPaidViaBillingNote((data as Document) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceBillingNoteId]);

  if (loading) {
    return (
      <AppShell title="เอกสาร" showBack>
        <Spinner />
      </AppShell>
    );
  }

  if (error || !doc) {
    return (
      <AppShell title="เอกสาร" showBack>
        <div className="text-center py-12 text-red-500">{error || "ไม่พบเอกสาร"}</div>
      </AppShell>
    );
  }

  const customer = doc.customer as unknown as Customer | undefined;
  const isDraft = doc.status === "draft";
  const isSent = doc.status === "sent";
  const isConverted = doc.status === "converted";
  const isIssued = doc.status === "issued";
  const isPaid = doc.status === "paid" || doc.status === "generated" || doc.status === "issued";
  const isPartiallyPaid = doc.status === "partially_paid";
  const isSettled = isPaid || isPartiallyPaid;
  const isVoided = doc.status === "voided";
  const isOverdue = isDocumentOverdue(doc, businessToday);
  const lineDiscountTotal = doc.line_items?.reduce((sum, item) => sum + (item.discount_amount || 0), 0) || 0;
  const grossSubtotal = doc.subtotal + (doc.discount_amount || 0) + lineDiscountTotal;
  const docLabel = documentTypeLabel(doc.doc_type, doc.vat_registered);
  const customerName = customer?.name || "ไม่ได้ระบุลูกค้า";
  const issueDateLabel = formatDate(doc.issue_date);
  const dueDateLabel = doc.due_date ? formatDate(doc.due_date) : "ไม่มีกำหนด";
  const hasBackdateAudit = Boolean(doc.backdated_at || doc.backdated_reason);
  const canEditDocument = doc.doc_type === "billing_note" || doc.doc_type === "credit_note" || doc.doc_type === "debit_note";
  const isUtilityBill = doc.line_items?.some((li) => (li.line_note || "").includes("[USAGE_BILL]")) ?? false;
  const isCorrectionCandidate =
    doc.doc_type === "invoice" ||
    doc.doc_type === "credit_note" ||
    doc.doc_type === "debit_note";
  const correctionTitle =
    doc.doc_type === "credit_note" || doc.doc_type === "debit_note"
      ? doc.doc_type === "credit_note"
        ? "ยกเลิกใบลดหนี้และออกฉบับใหม่"
        : "ยกเลิกใบเพิ่มหนี้และออกฉบับใหม่"
      : "แก้ไขโดยออกฉบับใหม่";
  const statusMessage = isVoided
    ? "ยกเลิกแล้ว เก็บไว้เป็นประวัติ"
    : doc.doc_type === "delivery_note" && isConverted
      ? "ออกบิลแล้ว ใบส่งของนี้ถูกใช้สร้างใบแจ้งหนี้แล้ว"
      : doc.doc_type === "delivery_note" && isSent
        ? "ส่งของแล้ว / รอออกบิล เอกสารถูกล็อกหลังยืนยันส่งของแล้ว"
        : isPaid
          ? "ปิดงานแล้วและมีข้อมูลรับเงินครบ"
          : isPartiallyPaid
            ? "ชำระบางส่วน ยังเหลือยอดค้างชำระ"
            : isOverdue
            ? "เกินกำหนดแล้ว ควรติดตามการชำระ"
            : isSent || isIssued
              ? "เอกสารถูกส่งแล้ว รอดำเนินการขั้นถัดไป"
              : "ฉบับร่าง ตรวจสอบและส่งเมื่อพร้อม";

  const openVoidModal = (recreate: boolean) => {
    setVoidReason("");
    setCorrectionReason("");
    setVoidAndRecreate(recreate);
    setVoidModal(true);
  };

  const issueCreditNote = async () => {
    setActionLoading("send");
    try {
      await supabase
        .from("documents")
        .update({
          status: "issued" as DocumentStatus,
          ...(devIssueDate ? { issue_date: devIssueDate } : {}),
        })
        .eq("id", doc.id);
      await fetchDoc();
      toast.success(doc.doc_type === "debit_note" ? "ออกใบเพิ่มหนี้แล้ว" : "ออกใบลดหนี้แล้ว");
      warmPdfCache(doc.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const confirmReceipt = async () => {
    setConfirmingReceipt(true);
    try {
      if (!userId) {
        toast.error("กรุณาเข้าสู่ระบบอีกครั้ง");
        return;
      }
      await confirmDraftReceipt(doc.id, userId);
      toast.success("ยืนยันการรับเงินสำเร็จ — บันทึกยอดและออกใบเสร็จแล้ว");
      warmPdfCache(doc.id);
      await fetchDoc();
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาด");
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setConfirmingReceipt(false);
    }
  }

  const canEditDraft = isDraft && doc.doc_type !== "receipt" && doc.doc_type !== "credit_note" && doc.doc_type !== "debit_note";
  const canIssueCorrection = isDraft && (doc.doc_type === "credit_note" || doc.doc_type === "debit_note") && canSendDocumentType(permissions, doc.doc_type);
  const canConfirmReceipt = isDraft && doc.doc_type === "receipt" && permissions.canRecordPayments;
  const isCollectible = (isSent || isPartiallyPaid) && (doc.doc_type === "invoice" || doc.doc_type === "billing_note");
  const canTakePayment = isCollectible && !doc.deal_id && permissions.canRecordPayments;

  const primaryAction: ReactNode = canConfirmReceipt ? (
    <Button variant="primary" size="md" className="w-full sm:w-auto" loading={confirmingReceipt} onClick={confirmReceipt}>
      <CheckCircle2 className="mr-1.5 h-4 w-4" />
      ยืนยันการรับเงิน
    </Button>
  ) : canIssueCorrection ? (
    <Button variant="primary" size="md" className="w-full sm:w-auto" loading={actionLoading === "send"} onClick={issueCreditNote}>
      <FileText className="mr-1.5 h-4 w-4" />
      {doc.doc_type === "debit_note" ? "ออกใบเพิ่มหนี้" : "ออกใบลดหนี้"}
    </Button>
  ) : canEditDraft ? (
    <Button
      variant="primary"
      size="md"
      className="w-full sm:w-auto"
      onClick={() => navigate(`/documents/${doc.id}/${isUtilityBill ? "edit-utility" : "edit"}`)}
    >
      <Pencil className="mr-1.5 h-4 w-4" />
      แก้ไขฉบับร่าง
    </Button>
  ) : isCollectible && doc.deal_id ? (
    <Button variant="primary" size="md" className="w-full sm:w-auto" onClick={() => navigate(`/deals/${doc.deal_id}`)}>
      เปิดงานขายเพื่อดำเนินการต่อ
    </Button>
  ) : canTakePayment ? (
    <Button variant="primary" size="md" className="w-full sm:w-auto" onClick={openPayModal}>
      <CreditCard className="mr-1.5 h-4 w-4" />
      {isPartiallyPaid ? "รับชำระเพิ่ม" : "รับเงินแล้ว"}
    </Button>
  ) : null;

  const canVoid =
    permissions.canVoidDocuments && !isVoided && !isPaid && (isSent || isIssued || isPartiallyPaid);
  const canRecreate = canVoid && doc.doc_type !== "quotation";
  const canCopy =
    doc.status !== "draft" &&
    doc.status !== "voided" &&
    ["invoice", "quotation", "billing_note", "delivery_note"].includes(doc.doc_type);
  const canCreateCorrection =
    (isSent || isPartiallyPaid) && doc.doc_type === "invoice" && canSendDocumentType(permissions, "credit_note");
  const recreateLabel =
    doc.doc_type === "credit_note" || doc.doc_type === "debit_note"
      ? "ยกเลิกและออกฉบับใหม่"
      : doc.doc_type === "invoice"
        ? "แก้ไขโดยออกฉบับใหม่"
        : "ยกเลิกและสร้างใหม่";
  const hasMenuActions =
    Boolean((isConverted && doc.doc_type === "delivery_note" && dnInvoiceRef) || canCreateCorrection || canCopy || canVoid || canRecreate) ||
    (isDraft && permissions.canDeleteDocuments);

  return (
    <AppShell
      title={docLabel.thai}
      showBack
      breadcrumbs={[
        { label: "หน้าหลัก", path: "/home" },
        { label: "เอกสาร", path: "/documents" },
        { label: doc.doc_number || docLabel.thai },
      ]}
    >
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-control text-body text-red-600">
          {error}
        </div>
      )}

      <div className="mb-4 rounded-card border border-card-border bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <DocTypeBadge docType={doc.doc_type} vatRegistered={doc.vat_registered} />
              <Badge status={doc.status} />
              {doc.doc_type === "delivery_note" && doc.status === "draft" && doc.is_blank_form ? (
                <StatusBadge label="ฟอร์มเปล่า" tone="amber" />
              ) : null}
              {isOverdue && <StatusBadge label="เกินกำหนด" tone="red" />}
            </div>

            <div>
              <h2 className="text-page font-semibold tracking-tight text-ink-900">
                <EditableDocNumberInline
                  value={doc.doc_number || "-"}
                  onSave={async (newValue) => {
                    if (!id || !userId) return;
                    await assertDocNumberAvailable(userId, newValue, id);
                    const { error } = await supabase.from("documents").update({ doc_number: newValue }).eq("id", id);
                    if (error) throw error;
                    setDoc((prev) => prev ? { ...prev, doc_number: newValue } : prev);
                    toast.success("เปลี่ยนเลขที่เอกสารแล้ว");
                  }}
                />
              </h2>
              {isVoided && doc.voided_reason && (
                <p className="mt-1 text-label italic text-ink-300">เหตุผลการยกเลิก: {doc.voided_reason}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {copiedFromRef && (
                  <button
                    type="button"
                    onClick={() => navigate(`/documents/${copiedFromRef.id}`)}
                    className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-label font-medium text-blue-700 hover:bg-blue-100"
                  >
                    ออกแทน {copiedFromRef.doc_number || "เอกสารเดิม"}
                  </button>
                )}
                {replacementRef && (
                  <button
                    type="button"
                    onClick={() => navigate(`/documents/${replacementRef.id}`)}
                    className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-label font-medium text-amber-800 hover:bg-amber-100"
                  >
                    ออกใหม่เป็น {replacementRef.doc_number || "ฉบับใหม่"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNumberOverride((value) => !value)}
                  className="text-label text-ink-400 hover:text-ink-700 hover:underline"
                >
                  {showNumberOverride ? "ซ่อนการตั้งเลขที่เอง" : "ตั้งเลขที่เอง"}
                </button>
              </div>
              {showNumberOverride && (
                <EditableDocNumber
                  value={docNumberOverride}
                  onChange={setDocNumberOverride}
                  placeholder="ตั้งเลขที่เอง (เว้นว่าง = อัตโนมัติ)"
                  className="mt-2 max-w-xs"
                />
              )}
            </div>

            {dealChain.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(() => {
                  const steps = dealChain.map(d => {
                    const vatReg = d.doc_type === "invoice" ? doc.vat_registered : false;
                    return {
                      key: d.doc_type,
                      label: documentTypeLabel(d.doc_type, vatReg).thai,
                      active: d.id === doc.id,
                    };
                  });
                  return steps.map((step, i) => (
                    <span key={`${step.key}-${i}`} className="flex shrink-0 items-center gap-1">
                      {i > 0 && <span className="text-label text-ink-200">→</span>}
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-label font-medium ${ step.active ? "bg-primary text-white" : "bg-paper-field text-ink-400" }`}
                      >
                        {step.label}
                      </span>
                    </span>
                  ));
                })()}
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-label font-medium text-ink-300">
                  <UserRound className="h-3.5 w-3.5" />
                  ลูกค้า
                </dt>
                <dd className="mt-1 truncate text-body font-medium text-ink-900">{customerName}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-label font-medium text-ink-300">
                  <CalendarDays className="h-3.5 w-3.5" />
                  วันที่ออก
                </dt>
                <dd className="mt-1 text-body font-medium text-ink-900">{issueDateLabel}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-label font-medium text-ink-300">
                  <ArrowRight className="h-3.5 w-3.5" />
                  ครบกำหนด
                </dt>
                <dd className={`mt-1 text-body font-medium ${isOverdue ? "text-red-700" : "text-ink-900"}`}>
                  {dueDateLabel}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-label font-medium text-ink-300">
                  <CalendarDays className="h-3.5 w-3.5" />
                  แก้ไขล่าสุด
                </dt>
                <dd className="mt-1 text-body font-medium text-ink-900">
                  {doc.updated_at ? formatDate(doc.updated_at) : "-"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="w-full shrink-0 rounded-card border border-line-soft bg-paper-field p-4 lg:max-w-xs">
            <div className="flex items-center gap-2 text-label font-medium text-ink-300">
              <CircleDollarSign className="h-4 w-4" />
              {getDisplayAmountLabel(doc)}
            </div>
            <Money value={getDisplayAmount(doc)} className="mt-2 block text-page font-semibold text-ink-900" />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={handleGeneratePdf}>
                <Printer className="mr-1 h-3.5 w-3.5" />
                พิมพ์ / PDF
              </Button>
              {canEditDocument && (
                <Button variant="secondary" size="sm" onClick={() => navigate(`/documents/${doc.id}/edit`)}>
                  แก้ไขเอกสาร
                </Button>
              )}
              {doc.deal_id && (
                <Button
                  tone="amber"
                  solid
                  size="sm"
                  className=""
                  onClick={() => navigate(`/deals/${doc.deal_id}`)}
                >
                  ไปที่หน้างานขาย
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`mb-4 rounded-card border px-4 py-3 text-body ${ isVoided ? "border-danger-border bg-danger-soft text-danger-text" : isPaid ? "border-success-border bg-success-soft text-success-text" : isPartiallyPaid ? "border-warning-border bg-warning-soft text-warning-text" : isOverdue ? "border-danger-border bg-danger-soft text-danger-text" : isSent || isIssued ? "border-sent-bg bg-primary-soft text-primary-deep" : "border-line-strong bg-paper-warm text-ink-700" }`}
      >
        {statusMessage}
      </div>

      {doc.line_items && doc.line_items.length > 0 && (
        <DetailCard title="รายการเอกสาร" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-x-auto">
          <table className={TABLE.table}>
            <thead>
              <tr className={TABLE.theadTr}>
                <th className={`w-8 px-4 py-3 text-left ${TABLE.thSortable}`}>#</th>
                <SortableTh
                  label="รายการ"
                  align="left"
                  active={lineItemSort.sort.key === "item_name"}
                  dir={lineItemSort.sort.dir}
                  onClick={() => lineItemSort.handleSort("item_name")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="จำนวน"
                  align="right"
                  active={lineItemSort.sort.key === "quantity"}
                  dir={lineItemSort.sort.dir}
                  onClick={() => lineItemSort.handleSort("quantity")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="ราคา/หน่วย"
                  align="right"
                  active={lineItemSort.sort.key === "unit_price"}
                  dir={lineItemSort.sort.dir}
                  onClick={() => lineItemSort.handleSort("unit_price")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="รวม"
                  align="right"
                  active={lineItemSort.sort.key === "line_total"}
                  dir={lineItemSort.sort.dir}
                  onClick={() => lineItemSort.handleSort("line_total")}
                  className={TABLE.thSortable}
                />
              </tr>
            </thead>
            <tbody>
              {lineItemSort.sorted.map((item, index) => (
                <tr key={item.id} className={TABLE.tbodyTr}>
                  <td className="px-4 py-2 text-ink-400">{index + 1}</td>
                  <td className="px-4 py-2 text-ink-500">
                    <div>{item.item_name}</div>
                    {item.line_note ? <div className="mt-1 text-label text-ink-500">{item.line_note}</div> : null}
                    {item.discount_amount > 0 && (
                      <div className="text-label text-red-500">
                        ส่วนลด {item.discount_percent}% (-฿{formatCurrency(item.discount_amount)})
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-ink-500">{item.quantity} {item.unit}</td>
                  <td className="px-4 py-2 text-right text-ink-500"><Money value={item.unit_price} /></td>
                  <td className="px-4 py-2 text-right font-medium text-ink-500"><Money value={item.line_total} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      {doc.doc_type === "billing_note" && doc.billing_invoices && doc.billing_invoices.length > 0 && (
        <DetailCard title="ใบแจ้งหนี้ที่รวม" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-x-auto">
          <table className={TABLE.table}>
            <thead>
              <tr className={TABLE.theadTr}>
                <SortableTh
                  label="เลขที่ใบแจ้งหนี้"
                  align="left"
                  active={billingInvoiceSort.sort.key === "invoice_number"}
                  dir={billingInvoiceSort.sort.dir}
                  onClick={() => billingInvoiceSort.handleSort("invoice_number")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="ยอดก่อน VAT"
                  align="right"
                  active={billingInvoiceSort.sort.key === "subtotal"}
                  dir={billingInvoiceSort.sort.dir}
                  onClick={() => billingInvoiceSort.handleSort("subtotal")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="VAT"
                  align="right"
                  active={billingInvoiceSort.sort.key === "vat_amount"}
                  dir={billingInvoiceSort.sort.dir}
                  onClick={() => billingInvoiceSort.handleSort("vat_amount")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="รวม"
                  align="right"
                  active={billingInvoiceSort.sort.key === "total_amount"}
                  dir={billingInvoiceSort.sort.dir}
                  onClick={() => billingInvoiceSort.handleSort("total_amount")}
                  className={TABLE.thSortable}
                />
              </tr>
            </thead>
            <tbody>
              {billingInvoiceSort.sorted.map((invoice) => (
                <tr key={invoice.id} className={TABLE.tbodyTr}>
                  <td className="px-4 py-2 text-ink-500">{invoice.invoice_number}</td>
                  <td className="px-4 py-2 text-right text-ink-500"><Money value={invoice.subtotal} /></td>
                  <td className="px-4 py-2 text-right text-ink-500"><Money value={invoice.vat_amount} /></td>
                  <td className="px-4 py-2 text-right text-ink-500"><Money value={invoice.total_amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      {doc.doc_type === "receipt" && paidViaBillingNote && (
        <DetailCard title="ใบวางบิลที่ชำระ" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-x-auto">
          <table className={TABLE.table}>
            <thead>
              <tr className={TABLE.theadTr}>
                <SortableTh label="เลขที่ใบวางบิล" align="left" active={false} dir="asc" onClick={() => undefined} className={TABLE.thSortable} />
                <SortableTh label="วันที่ออก" align="left" active={false} dir="asc" onClick={() => undefined} className={TABLE.thSortable} />
                <SortableTh label="จำนวนเงิน" align="right" active={false} dir="asc" onClick={() => undefined} className={TABLE.thSortable} />
              </tr>
            </thead>
            <tbody>
              <tr className={TABLE.tbodyTr}>
                <td className="px-4 py-2 text-ink-500">{paidViaBillingNote.doc_number || "-"}</td>
                <td className="px-4 py-2 text-ink-500">{paidViaBillingNote.issue_date ? formatDate(paidViaBillingNote.issue_date) : "-"}</td>
                <td className="px-4 py-2 text-right font-medium text-ink-500"><Money value={paidViaBillingNote.total_amount} /></td>
              </tr>
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      {doc.doc_type === "receipt" && !paidViaBillingNote && doc.receipt_invoices && doc.receipt_invoices.length > 0 && (
        <DetailCard title="ใบแจ้งหนี้ที่ชำระ" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-x-auto">
          <table className={TABLE.table}>
            <thead>
              <tr className={TABLE.theadTr}>
                <SortableTh
                  label="เลขที่ใบแจ้งหนี้"
                  align="left"
                  active={receiptInvoiceSort.sort.key === "invoice_number"}
                  dir={receiptInvoiceSort.sort.dir}
                  onClick={() => receiptInvoiceSort.handleSort("invoice_number")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="วันที่ออก"
                  align="left"
                  active={receiptInvoiceSort.sort.key === "issue_date"}
                  dir={receiptInvoiceSort.sort.dir}
                  onClick={() => receiptInvoiceSort.handleSort("issue_date")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="รับชำระ"
                  align="right"
                  active={receiptInvoiceSort.sort.key === "paid_amount"}
                  dir={receiptInvoiceSort.sort.dir}
                  onClick={() => receiptInvoiceSort.handleSort("paid_amount")}
                  className={TABLE.thSortable}
                />
              </tr>
            </thead>
            <tbody>
              {receiptInvoiceSort.sorted.map((invoice) => (
                <tr key={invoice.id} className={TABLE.tbodyTr}>
                  <td className="px-4 py-2 text-ink-500">{invoice.invoice_number}</td>
                  <td className="px-4 py-2 text-ink-500">{invoice.issue_date ? formatDate(invoice.issue_date) : "-"}</td>
                  <td className="px-4 py-2 text-right font-medium text-ink-500"><Money value={invoice.paid_amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      {doc.doc_type === "invoice" && doc.invoice_delivery_notes && doc.invoice_delivery_notes.length > 0 && (
        <DetailCard title="อ้างอิงใบส่งของ" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-x-auto">
          <table className={TABLE.table}>
            <thead>
              <tr className={TABLE.theadTr}>
                <SortableTh
                  label="เลขที่ใบส่งของ"
                  align="left"
                  active={deliveryNoteSort.sort.key === "delivery_note_number"}
                  dir={deliveryNoteSort.sort.dir}
                  onClick={() => deliveryNoteSort.handleSort("delivery_note_number")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="วันที่ส่งของ"
                  align="left"
                  active={deliveryNoteSort.sort.key === "issue_date"}
                  dir={deliveryNoteSort.sort.dir}
                  onClick={() => deliveryNoteSort.handleSort("issue_date")}
                  className={TABLE.thSortable}
                />
                <SortableTh
                  label="มูลค่าอ้างอิง"
                  align="right"
                  active={deliveryNoteSort.sort.key === "total_amount"}
                  dir={deliveryNoteSort.sort.dir}
                  onClick={() => deliveryNoteSort.handleSort("total_amount")}
                  className={TABLE.thSortable}
                />
              </tr>
            </thead>
            <tbody>
              {deliveryNoteSort.sorted.map((deliveryNote) => (
                <tr key={deliveryNote.id} className={TABLE.tbodyTr}>
                  <td className="px-4 py-2 text-ink-500">{deliveryNote.delivery_note_number}</td>
                  <td className="px-4 py-2 text-ink-500">{deliveryNote.issue_date ? formatDate(deliveryNote.issue_date) : "-"}</td>
                  <td className="px-4 py-2 text-right text-ink-500"><Money value={deliveryNote.total_amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      <DetailCard title="สรุปยอด" icon={<CircleDollarSign className="h-4 w-4" />} className="mb-4">
        <div className="space-y-2">
          {lineDiscountTotal > 0 && (
            <>
              <AmountRow label="ยอดก่อนส่วนลด" value={`฿${formatCurrency(grossSubtotal)}`} tone="muted" />
              <AmountRow label="ส่วนลดรายการ" value={`-฿${formatCurrency(lineDiscountTotal)}`} tone="red" />
            </>
          )}
          {doc.discount_amount > 0 && (
            <AmountRow
              label={`ส่วนลดท้ายบิล ${doc.discount_percent > 0 ? `(${doc.discount_percent}%)` : ""}`}
              value={`-฿${formatCurrency(doc.discount_amount)}`}
              tone="red"
            />
          )}
          {doc.doc_type === "delivery_note" ? (
            <div className="rounded-control bg-paper-field px-3 py-2">
              <AmountRow label="มูลค่าอ้างอิง" value={`฿${formatCurrency(doc.total_amount)}`} tone="strong" />
            </div>
          ) : (
            <>
              {!doc.vat_registered && (
                <div className="rounded-control bg-paper-field px-3 py-2">
                  <AmountRow label="รวมทั้งสิ้น" value={`฿${formatCurrency(doc.total_amount)}`} tone="strong" />
                </div>
              )}
              {doc.vat_registered && (
                <div className="rounded-control bg-paper-field px-3 py-2">
                  <AmountRow label="ยอดก่อน VAT" value={`฿${formatCurrency(doc.subtotal)}`} tone="default" />
                  <AmountRow label={`VAT ${doc.vat_rate}%`} value={`฿${formatCurrency(doc.vat_amount)}`} tone="default" className="mt-1.5" />
                  <AmountRow label="รวมทั้งสิ้น" value={`฿${formatCurrency(doc.total_amount)}`} tone="strong" className="mt-2 border-t border-line-soft pt-2" />
                </div>
              )}
            </>
          )}
          {doc.wht_rate > 0 && doc.doc_type !== "delivery_note" && (
            <AmountRow label={`หัก ณ ที่จ่าย ${doc.wht_rate}%`} value={`-฿${formatCurrency(doc.wht_amount)}`} tone="red" />
          )}
          <AmountRow
            label={getDisplayAmountLabel(doc)}
            value={`฿${formatCurrency(getDisplayAmount(doc))}`}
            tone="strong"
            className="border-t border-line-strong pt-2 text-title"
          />
        </div>
      </DetailCard>

      {isSettled && (doc.payment_method || doc.paid_at || doc.amount_received != null) && (
        <DetailCard title="ข้อมูลรับเงิน" icon={<CircleDollarSign className="h-4 w-4" />} className={`mb-4 ${isPartiallyPaid ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
          <div className="space-y-1 text-body">
          {doc.payment_method && (
            <div className="flex justify-between">
              <span className={isPartiallyPaid ? "text-amber-700" : "text-green-700"}>วิธีชำระ:</span>
              <span>{PAYMENT_METHOD_LABELS[doc.payment_method] || doc.payment_method}</span>
            </div>
          )}
          {doc.amount_received != null && (
            <div className="flex justify-between">
              <span className={isPartiallyPaid ? "text-amber-700" : "text-green-700"}>จำนวนเงิน:</span>
              <Money value={doc.amount_received} />
            </div>
          )}
          {isPartiallyPaid && (
            <div className="flex justify-between text-amber-700">
              <span>คงเหลือ:</span>
              <span className="font-semibold"><Money value={Math.max(0, doc.net_payable - (doc.amount_received || 0))} /></span>
            </div>
          )}
          {doc.paid_at && (
            <div className="flex justify-between">
              <span className={isPartiallyPaid ? "text-amber-700" : "text-green-700"}>วันที่:</span>
              <span>{formatDate(doc.paid_at)}</span>
            </div>
          )}
          {doc.wht_certificate_no && (
            <div className="flex justify-between">
              <span className={isPartiallyPaid ? "text-amber-700" : "text-green-700"}>ใบหักภาษี:</span>
              <span>{doc.wht_certificate_no}</span>
            </div>
          )}
          </div>
        </DetailCard>
      )}

      {hasBackdateAudit && (
        <DetailCard title="ข้อมูลการออกย้อนหลัง" icon={<CalendarDays className="h-4 w-4" />} className="mb-4 border-amber-200 bg-amber-50">
          <div className="space-y-2 text-body text-amber-950">
            <div className="flex justify-between gap-4">
              <span className="text-amber-800">วันที่บนใบเสร็จ</span>
              <span>{formatDate(doc.issue_date)}</span>
            </div>
            {doc.backdated_at && (
              <div className="flex justify-between gap-4">
                <span className="text-amber-800">บันทึกย้อนหลังเมื่อ</span>
                <span>{formatDate(doc.backdated_at)}</span>
              </div>
            )}
            {doc.created_at && (
              <div className="flex justify-between gap-4">
                <span className="text-amber-800">สร้างในระบบเมื่อ</span>
                <span>{formatDate(doc.created_at)}</span>
              </div>
            )}
            {doc.backdated_reason && (
              <div className="rounded-card border border-amber-200 bg-white/70 p-3 text-body text-amber-950">
                <div className="mb-1 text-label font-medium text-amber-700">เหตุผล</div>
                <p className="whitespace-pre-wrap">{doc.backdated_reason}</p>
              </div>
            )}
          </div>
        </DetailCard>
      )}

      {doc.note && (
        <DetailCard title="หมายเหตุ" icon={<NotebookText className="h-4 w-4" />} className="mb-4">
          <p className="text-body text-ink-700 whitespace-pre-wrap">{doc.note}</p>
        </DetailCard>
      )}

      <div className="rounded-card border border-card-border bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-body font-semibold text-ink-900">การดำเนินการ</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {primaryAction}
            <Button variant="secondary" size="md" className="w-full sm:w-auto" onClick={handleGeneratePdf}>
              <Printer className="mr-1.5 h-4 w-4" />
              พิมพ์ / PDF
            </Button>
            {doc.deal_id && (
              <Button variant="secondary" size="md" className="w-full sm:w-auto" onClick={() => navigate(`/deals/${doc.deal_id}`)}>
                ไปที่หน้างานขาย
              </Button>
            )}

            {hasMenuActions && (
              <div className="relative" ref={actionsMenuRef}>
                <Button
                  variant="secondary"
                  size="md"
                  aria-label="ตัวเลือกเพิ่มเติม"
                  aria-haspopup="menu"
                  aria-expanded={actionsMenuOpen}
                  onClick={() => setActionsMenuOpen((value) => !value)}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>

                {actionsMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-1 w-64 rounded-control border border-card-border bg-white py-1"
                  >
                    {isConverted && doc.doc_type === "delivery_note" && dnInvoiceRef && (
                      <MenuItem
                        icon={<FileStack size={14} />}
                        onClick={() => {
                          setActionsMenuOpen(false);
                          navigate(`/documents/${dnInvoiceRef.id}`);
                        }}
                      >
                        เปิดใบแจ้งหนี้ {dnInvoiceRef.doc_number || ""}
                      </MenuItem>
                    )}
                    {canCreateCorrection && (
                      <>
                        <MenuItem
                          icon={<FileText size={14} />}
                          onClick={() => {
                            setActionsMenuOpen(false);
                            navigate(`/documents/new?type=credit_note&dealId=${doc.deal_id || ""}`);
                          }}
                        >
                          ออกใบลดหนี้
                        </MenuItem>
                        <MenuItem
                          icon={<FileText size={14} />}
                          onClick={() => {
                            setActionsMenuOpen(false);
                            navigate(`/documents/new?type=debit_note&dealId=${doc.deal_id || ""}`);
                          }}
                        >
                          ออกใบเพิ่มหนี้
                        </MenuItem>
                      </>
                    )}
                    {canCopy && (
                      <MenuItem
                        icon={<Copy size={14} />}
                        onClick={() => {
                          setActionsMenuOpen(false);
                          handleCopy();
                        }}
                      >
                        สร้างฉบับเหมือนเดิม
                      </MenuItem>
                    )}
                    {canVoid && (
                      <MenuItem
                        icon={<Ban size={14} />}
                        danger
                        onClick={() => {
                          setActionsMenuOpen(false);
                          openVoidModal(false);
                        }}
                      >
                        ยกเลิกอย่างเดียว
                      </MenuItem>
                    )}
                    {canRecreate && (
                      <MenuItem
                        icon={<Ban size={14} />}
                        danger
                        onClick={() => {
                          setActionsMenuOpen(false);
                          openVoidModal(true);
                        }}
                      >
                        {recreateLabel}
                      </MenuItem>
                    )}
                    {isDraft && permissions.canDeleteDocuments && (
                      <MenuItem
                        icon={<Trash2 size={14} />}
                        danger
                        onClick={() => {
                          setActionsMenuOpen(false);
                          setDeleteModal(true);
                        }}
                      >
                        ลบเอกสาร
                      </MenuItem>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={voidModal}
        onClose={() => setVoidModal(false)}
        title={voidAndRecreate ? correctionTitle : "ยกเลิกเอกสาร"}
      >
        <div className="space-y-3">
          <div className="rounded-control border border-line bg-paper-field px-3 py-2 text-body text-ink-700">
            เอกสารเดิม: <span className="font-semibold text-ink-900">{doc.doc_number || docLabel.thai}</span>
          </div>
          <p className="text-body text-ink-600">
            {voidAndRecreate
              ? "ฉบับเดิมจะถูกยกเลิกและเก็บไว้เป็นประวัติ จากนั้นระบบจะสร้างฉบับร่างใหม่ให้แก้ไข โดยใช้เลขที่ใหม่"
              : "คุณแน่ใจว่าต้องการยกเลิกเอกสารนี้?"}
          </p>
          {voidAndRecreate && isCorrectionCandidate && (
            <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-label leading-5 text-amber-900">
              เอกสารที่ออกแล้วแก้ไขทับฉบับเดิมไม่ได้ หากเป็นการลดยอดหรือคืนเงิน ให้ใช้เมนู “ออกใบลดหนี้” แทน
            </div>
          )}
          {voidAndRecreate && isCorrectionCandidate && (
            <label className="block text-body text-ink-700">
              <span className="mb-1 block font-medium">สาเหตุการแก้ไข *</span>
              <select
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                className="w-full rounded-control border border-card-border bg-white px-3 py-2.5 text-body focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">เลือกสาเหตุ</option>
                {CORRECTION_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
                ))}
              </select>
            </label>
          )}
          <Input
            label={voidAndRecreate ? "รายละเอียดเพิ่มเติม (ถ้ามี)" : "เหตุผลการยกเลิก"}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder={voidAndRecreate ? "อธิบายสิ่งที่ต้องแก้ เช่น เปลี่ยนที่อยู่บริษัท" : "ไม่บังคับ"}
            required={false}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setVoidModal(false)}>ปิด</Button>
            <Button variant={voidAndRecreate && isCorrectionCandidate ? "primary" : "danger"} onClick={handleVoid} loading={voiding}>
              {voidAndRecreate ? correctionTitle : "ยืนยัน"}
            </Button>
          </div>
        </div>
      </Modal>

      {doc && (isSent || isPartiallyPaid) && (
        <PaymentModal
          open={payModal}
          onClose={() => setPayModal(false)}
          sourceDoc={doc}
          dealId={doc.deal_id}
          businessToday={businessToday}
          onSaved={fetchDoc}
        />
      )}

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="ลบเอกสาร">
        <div className="space-y-4">
          <p className="text-body text-ink-600">
            คุณแน่ใจว่าต้องการลบเอกสารนี้? การลบไม่สามารถเรียกคืนได้
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>ลบ</Button>
          </div>
        </div>
      </Modal>

    </AppShell>
  );
}
