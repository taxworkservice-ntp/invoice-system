import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, CircleDollarSign, ClipboardList, FileStack, FileText, NotebookText, Pencil, Printer, Send, UserRound } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input, Select } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Spinner } from "../../../components/ui/Spinner";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { getDocumentDetail, saveLineItems } from "../../../hooks/useDocuments";
import { useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { sendDocumentWithSideEffects } from "../../../lib/documentSend";
import { voidDocumentWithSideEffects } from "../../../lib/documentVoid";
import { deleteDocumentFiles } from "../../../lib/r2";
import { assertDocNumberAvailable, resolveDocNumber } from "../../../lib/docNumber";
import { businessTodayString } from "../../../lib/devDate";
import { deductStockOnDocumentSent, restoreStockOnVoid } from "../../../lib/stock";
import { EditableDocNumber, EditableDocNumberInline } from "../../../components/documents/EditableDocNumber";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { AmountRow } from "../../../components/ui/AmountRow";
import { PAYMENT_METHOD_LABELS } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { getReceiptTotalsForDocument } from "../../../lib/receiptTotals";
import { useBankAccounts } from "../../../hooks/useBankAccounts";
import { TABLE } from "../../../lib/tableStyles";
import { canSendDocumentType, getWorkspacePermissions } from "../../../lib/permissions";
import {
  calculateReceiptAllocationFromInput,
  convertReceiptInputAmount,
  convertReceiptInputToPreTax,
  type ReceiptInputBasis,
} from "../../../lib/tax";
import { getReceiptInputBasisPreference, setReceiptInputBasisPreference } from "../../../lib/receiptInputBasis";
import { buildReceiptInvoiceRecords, getReceiptInvoiceSources } from "../../../lib/receiptInvoices";
import {
  buildReceiptBackdateFields,
  composeReceiptBackdateReason,
  isPastDate,
  RECEIPT_BACKDATE_REASON_OPTIONS,
  toLocalMiddayIso,
  todayString as realTodayString,
} from "../../../lib/receiptBackdating";
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
  { value: "customer_info", label: "ข้อมูลลูกค้าผิด เช่น ชื่อ เลขภาษี หรือที่อยู่" },
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
    <section className={`rounded-sheet border border-card-border bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        {icon ? <span className="text-ink-300">{icon}</span> : null}
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const { active: bankAccounts, primary: primaryBank, loading: bankLoading } = useBankAccounts(userId);
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
  const [payMethod, setPayMethod] = useState<PaymentMethod>("bank_transfer");
  const [payBankAccountId, setPayBankAccountId] = useState<string | null>(null);
  const [paymentBaseAmount, setPaymentBaseAmount] = useState(0);
  const [paymentBaseRemaining, setPaymentBaseRemaining] = useState(0);
  const [paymentInputBasis, setPaymentInputBasis] = useState<ReceiptInputBasis>(getReceiptInputBasisPreference);
  const [paymentPreviousWht, setPaymentPreviousWht] = useState(0);
  const toast = useToast();
  const [payWhtCert, setPayWhtCert] = useState("");
  const [payDate, setPayDate] = useState(() => realTodayString());
  const [payBackdateReason, setPayBackdateReason] = useState("");
  const [payBackdateNote, setPayBackdateNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [payMismatchConfirm, setPayMismatchConfirm] = useState(false);

  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [convertModal, setConvertModal] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [hasQuotationDnActivity, setHasQuotationDnActivity] = useState(false);
  const [dnInvoiceRef, setDnInvoiceRef] = useState<{ id: string; doc_number: string | null } | null>(null);
  const [copiedFromRef, setCopiedFromRef] = useState<{ id: string; doc_number: string | null } | null>(null);
  const [replacementRef, setReplacementRef] = useState<{ id: string; doc_number: string | null } | null>(null);
  const [dealChain, setDealChain] = useState<{ id: string; doc_type: DocumentType; doc_number: string | null }[]>([]);

  useEffect(() => {
    if (payDate === realTodayString()) setPayDate(businessToday);
  }, [businessToday, payDate]);

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
      if (data.doc_type === "quotation") {
        const [{ data: dnDocs }, { data: dnLines }] = await Promise.all([
          supabase
            .from("documents")
            .select("id")
            .eq("converted_from_id", data.id)
            .eq("doc_type", "delivery_note")
            .neq("status", "voided")
            .limit(1),
          supabase
            .from("document_line_items")
            .select("id, document:document_id(id, doc_type, status)")
            .eq("source_document_id", data.id)
            .limit(1),
        ]);
        const hasSourceDnLine = ((dnLines || []) as any[]).some(
          (line) => line.document?.doc_type === "delivery_note" && line.document?.status !== "voided",
        );
        setHasQuotationDnActivity(Boolean(dnDocs?.length || hasSourceDnLine));
      } else {
        setHasQuotationDnActivity(false);
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

  const handleDelete = async () => {
    if (!doc || !userId) return;
    if (!permissions.canDeleteDocuments) {
      setError("สิทธิ์นี้ทำได้เฉพาะ Owner");
      return;
    }
    setDeleting(true);
    try {
      if (doc.doc_type === "billing_note") {
        const { data: links } = await supabase
          .from("billing_note_invoices")
          .select("invoice_id")
          .eq("billing_note_id", doc.id);
        const invoiceIds = (links || []).map((l) => l.invoice_id).filter(Boolean);
        if (invoiceIds.length > 0) {
          await supabase.from("documents")
            .update({ status: "sent" })
            .in("id", invoiceIds)
            .eq("status", "in_billing");
        }
        await supabase.from("billing_note_invoices").delete().eq("billing_note_id", doc.id);
      }
      await supabase.from("document_line_items").delete().eq("document_id", doc.id);
      await deleteDocumentFiles(doc.id);
      await supabase.from("documents").delete().eq("id", doc.id);
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
                line_total: lineItem.line_total,
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

  const handlePay = async () => {
    if (!doc || !userId || paymentBaseAmount <= 0) return;
    if (!permissions.canRecordPayments) {
      setError("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    const { preTaxAmount: previousTotal } = await getReceiptTotalsForDocument(doc, userId);
    const remaining = Math.max(0, doc.subtotal - previousTotal);
    const requestedPreTax = convertReceiptInputToPreTax({ amount: paymentBaseAmount, basis: paymentInputBasis, vatRate: doc.vat_rate, whtRate: doc.wht_rate });
    if (requestedPreTax > remaining + 0.01) {
      setError(`ยอดก่อน VAT เกินยอดค้างชำระ ฿${formatCurrency(remaining)}`);
      return;
    }
    if (requestedPreTax < remaining - 0.01) {
      setPayMismatchConfirm(true);
      return;
    }
    await executePay();
  };

  const executePay = async () => {
    if (!doc || !userId) return;
    const isBackdatedReceipt = isPastDate(payDate, businessToday);
    if (isBackdatedReceipt && !payBackdateReason) {
      setError("กรุณาเลือกเหตุผลในการออกใบเสร็จย้อนหลัง");
      return;
    }
    if (payMethod === "bank_transfer" && !payBankAccountId) {
      setError("กรุณาเลือกบัญชีที่รับโอนเงิน");
      return;
    }
    setPaying(true);
    try {
      const paidAt = toLocalMiddayIso(payDate);
      const receiptBackdateFields = buildReceiptBackdateFields({
        selectedDate: payDate,
        userId,
        reason: composeReceiptBackdateReason(payBackdateReason, payBackdateNote),
        today: businessToday,
      });
      const receiptInvoiceSources = await getReceiptInvoiceSources(doc, userId);

      const previousTotals = await getReceiptTotalsForDocument(doc, userId);
      const previousTotal = previousTotals.preTaxAmount;
      const previousWht = previousTotals.whtAmount;
      const remaining = Math.max(0, doc.subtotal - previousTotal);
      const allocation = calculateReceiptAllocationFromInput({
        amount: paymentBaseAmount,
        basis: paymentInputBasis,
        vatRate: doc.vat_rate,
        whtRate: doc.wht_rate,
        expectedWht: doc.wht_amount || 0,
        previousWht,
        isFullyPaid: convertReceiptInputToPreTax({ amount: paymentBaseAmount, basis: paymentInputBasis, vatRate: doc.vat_rate, whtRate: doc.wht_rate }) >= doc.subtotal - 0.01,
      });
      if (paymentBaseAmount <= 0 || allocation.preTax > remaining + 0.01) {
        throw new Error(`ยอดก่อน VAT เกินยอดค้างชำระ ฿${formatCurrency(remaining)}`);
      }
      const newTotal = previousTotal + allocation.preTax;
      const isFullyPaid = newTotal >= (doc.subtotal - 0.01);
      const newStatus = isFullyPaid ? "paid" : "partially_paid";

      await supabase
        .from("documents")
        .update({
          status: newStatus as DocumentStatus,
          paid_at: paidAt,
          payment_method: payMethod,
          bank_account_id: payMethod === "bank_transfer" ? payBankAccountId : null,
          amount_received: previousTotals.amountReceived + allocation.netAmount,
          wht_certificate_no: payWhtCert || null,
        })
        .eq("id", doc.id);

      if (doc.doc_type === "billing_note") {
        const { data: linked } = await supabase
          .from("billing_note_invoices")
          .select("invoice_id")
          .eq("billing_note_id", doc.id);

        if (linked?.length) {
          const invoiceNewStatus = isFullyPaid ? "paid" : "in_billing";
          await supabase
            .from("documents")
            .update({ status: invoiceNewStatus as DocumentStatus, paid_at: paidAt })
            .in("id", linked.map((item: any) => item.invoice_id));
        }
      }

      const recNumber = await resolveDocNumber(userId, "receipt", payDate, docNumberOverride);
      const { data: receipt, error: receiptError } = await supabase.from("documents").insert({
        user_id: userId,
        deal_id: doc.deal_id,
        customer_id: doc.customer_id,
        doc_type: "receipt",
        doc_number: recNumber,
        status: "generated" as DocumentStatus,
        issue_date: payDate,
        converted_from_id: doc.id,
        paid_at: paidAt,
        vat_registered: doc.vat_registered,
        vat_rate: doc.vat_rate,
        wht_rate: doc.wht_rate,
        discount_percent: doc.discount_percent,
        discount_amount: doc.discount_amount,
        subtotal: allocation.preTax,
        vat_amount: allocation.vatAmount,
        total_amount: allocation.grossAmount,
        wht_amount: allocation.whtAmount,
        net_payable: allocation.netAmount,
        payment_method: payMethod,
        bank_account_id: payMethod === "bank_transfer" ? payBankAccountId : null,
        amount_received: allocation.netAmount,
        wht_certificate_no: payWhtCert || null,
        ...receiptBackdateFields,
      }).select("id").single();
      if (receiptError || !receipt) throw receiptError || new Error("ไม่สามารถสร้างใบเสร็จได้");

      if (receiptInvoiceSources.length > 0) {
        const { error: receiptInvoiceError } = await supabase.from("receipt_invoices").insert(
          buildReceiptInvoiceRecords({
            receiptId: receipt.id,
            userId,
            sourceDocument: doc,
            invoices: receiptInvoiceSources,
            actualPaidAmount: allocation.netAmount,
          }),
        );
        if (receiptInvoiceError) throw receiptInvoiceError;
      }

      setPayModal(false);
      setPayMismatchConfirm(false);
      setPayBackdateReason("");
      setPayBackdateNote("");
      await fetchDoc();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleConvert = async () => {
    if (!doc || !userId) return;
    if (!canSendDocumentType(permissions, doc.doc_type)) {
      setError("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    setActionLoading("convert");
    let convertedInvoiceId: string | null = null;
    try {
      const issueDate = doc.issue_date || todayString();
      const { data: invoiceId, error: conversionError } = await supabase.rpc("convert_quotation_to_invoice", {
        p_user_id: userId,
        p_quotation_id: doc.id,
        p_doc_number: docNumberOverride.trim() || null,
        p_issue_date: issueDate,
      });
      if (conversionError || !invoiceId) throw conversionError || new Error("แปลงใบเสนอราคาไม่สำเร็จ");
      convertedInvoiceId = invoiceId as string;

      await deductStockOnDocumentSent(invoiceId as string, userId);

      setConvertModal(false);
      navigate(`/documents/${invoiceId}`);
    } catch (err: any) {
      if (convertedInvoiceId) {
        await restoreStockOnVoid(convertedInvoiceId, userId).catch(() => undefined);
        await supabase.from("document_line_items").delete().eq("document_id", convertedInvoiceId);
        await supabase.from("documents").delete().eq("id", convertedInvoiceId).eq("user_id", userId);
        await supabase.from("documents").update({ status: "sent" }).eq("id", doc.id).eq("user_id", userId);
      }
      setError(err.message || "แปลงใบเสนอราคาไม่สำเร็จ");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopy = async () => {
    if (!doc || !userId) return;
    setActionLoading("copy");
    try {
      const issueDate = doc.issue_date || todayString();
      const docNumber = await resolveDocNumber(userId, doc.doc_type, issueDate, docNumberOverride);
      const { data: copy } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          deal_id: doc.deal_id,
          customer_id: doc.customer_id,
          doc_type: doc.doc_type,
          doc_number: docNumber,
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
          payment_method: doc.doc_type === "tax_invoice_receipt" ? doc.payment_method : null,
          amount_received: doc.doc_type === "tax_invoice_receipt" ? doc.amount_received : null,
          paid_at: doc.doc_type === "tax_invoice_receipt" ? doc.paid_at : null,
          wht_certificate_no: doc.doc_type === "tax_invoice_receipt" ? doc.wht_certificate_no : null,
          copied_from_id: doc.id,
        })
        .select("*")
        .single();

      if (copy && doc.line_items?.length) {
        await saveLineItems(
          doc.line_items.map((lineItem, index) => ({
            document_id: copy.id,
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
            line_total: lineItem.line_total,
            sort_order: index,
          }))
        );
      }

      if (doc.doc_type === "billing_note") {
        const { data: billingNoteInvoices } = await supabase
          .from("billing_note_invoices")
          .select("*")
          .eq("billing_note_id", doc.id);

        if (billingNoteInvoices?.length) {
          await supabase.from("billing_note_invoices").insert(
            billingNoteInvoices.map((billingNote: any) => ({
              billing_note_id: copy.id,
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

  const openPayModal = async () => {
    if (!doc || !userId) return;
    if (!permissions.canRecordPayments) {
      setError("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    const { preTaxAmount: previousTotal, whtAmount: previousWht } = await getReceiptTotalsForDocument(doc, userId);
    const remaining = Math.max(0, doc.subtotal - previousTotal);
    setPaymentBaseAmount(remaining);
    setPaymentBaseRemaining(remaining);
    setPaymentInputBasis(getReceiptInputBasisPreference());
    setPaymentPreviousWht(previousWht);
    setPayMismatchConfirm(false);
    setPayMethod("bank_transfer");
    setPayBankAccountId(primaryBank?.id ?? null);
    setPayWhtCert("");
    setPayDate(todayString());
    setPayBackdateReason("");
    setPayBackdateNote("");
    setError("");
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
  const isOverdue = doc.due_date && isSent && new Date(doc.due_date) < new Date();
  const lineDiscountTotal = doc.line_items?.reduce((sum, item) => sum + (item.discount_amount || 0), 0) || 0;
  const grossSubtotal = doc.subtotal + (doc.discount_amount || 0) + lineDiscountTotal;
  const docLabel = documentTypeLabel(doc.doc_type, doc.vat_registered);
  const customerName = customer?.name || "ไม่ได้ระบุลูกค้า";
  const issueDateLabel = formatDate(doc.issue_date);
  const dueDateLabel = doc.due_date ? formatDate(doc.due_date) : "ไม่มีกำหนด";
  const hasBackdateAudit = Boolean(doc.backdated_at || doc.backdated_reason);
  const canEditDocument = doc.doc_type === "billing_note" || doc.doc_type === "credit_note";
  const isUtilityBill = doc.line_items?.some((li) => (li.line_note || "").includes("[USAGE_BILL]")) ?? false;
  const isCorrectionCandidate = doc.doc_type === "invoice" || doc.doc_type === "tax_invoice_receipt";
  const correctionTitle = doc.doc_type === "tax_invoice_receipt" ? "ยกเลิกและออกฉบับใหม่" : "แก้ไขโดยออกฉบับใหม่";
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
  const paymentPreview = calculateReceiptAllocationFromInput({
    amount: paymentBaseAmount,
    basis: paymentInputBasis,
    vatRate: doc.vat_rate,
    whtRate: doc.wht_rate,
    expectedWht: doc.wht_amount || 0,
    previousWht: paymentPreviousWht,
    isFullyPaid: convertReceiptInputToPreTax({ amount: paymentBaseAmount, basis: paymentInputBasis, vatRate: doc.vat_rate, whtRate: doc.wht_rate }) >= doc.subtotal - 0.01,
  });

  return (
    <AppShell
      title={docLabel.thai}
      showBack
      breadcrumbs={[
        { label: "หน้างานขาย", path: "/home" },
        { label: "เอกสาร", path: "/documents" },
        { label: doc.doc_number || docLabel.thai },
      ]}
    >
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mb-4 rounded-hero border border-card-border bg-[linear-gradient(135deg,theme(colors.paper.glow)_0%,theme(colors.paper.warm2)_100%)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <DocTypeBadge docType={doc.doc_type} vatRegistered={doc.vat_registered} />
              <Badge status={doc.status} />
              {isOverdue && (
                <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                  เกินกำหนด
                </span>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                <EditableDocNumberInline
                  value={doc.doc_number || "-"}
                  onSave={async (newValue) => {
                    if (!id || !userId) return;
                    await assertDocNumberAvailable(userId, newValue, id);
                    const { error } = await supabase.from("documents").update({ doc_number: newValue }).eq("id", id);
                    if (error) throw error;
                    if (!error) {
                      setDoc((prev) => prev ? { ...prev, doc_number: newValue } : prev);
                      toast.success("เปลี่ยนเลขที่เอกสารแล้ว");
                    } else {
                      toast.error("ไม่สามารถเปลี่ยนเลขที่เอกสารได้");
                    }
                  }}
                />
              </h2>
              <EditableDocNumber
                value={docNumberOverride}
                onChange={setDocNumberOverride}
                placeholder="ตั้งเลขที่เอง (เว้นว่าง = อัตโนมัติ)"
                className="mt-2 max-w-xs"
              />
              {isVoided && doc.voided_reason && (
                <p className="mt-1 text-xs text-ink-300 italic">เหตุผลการยกเลิก: {doc.voided_reason}</p>
              )}
              {copiedFromRef && (
                <button
                  type="button"
                  onClick={() => navigate(`/documents/${copiedFromRef.id}`)}
                  className="mt-2 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  ออกแทน {copiedFromRef.doc_number || "เอกสารเดิม"}
                </button>
              )}
              {replacementRef && (
                <button
                  type="button"
                  onClick={() => navigate(`/documents/${replacementRef.id}`)}
                  className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  ออกใหม่เป็น {replacementRef.doc_number || "ฉบับใหม่"}
                </button>
              )}
            </div>

            {dealChain.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(() => {
                  const steps = dealChain.map(d => {
                    const vatReg = d.doc_type === "invoice" ? doc.vat_registered : d.doc_type === "tax_invoice_receipt";
                    return {
                      key: d.doc_type,
                      label: documentTypeLabel(d.doc_type, vatReg).thai,
                      active: d.id === doc.id,
                    };
                  });
                  return steps.map((step, i) => (
                    <span key={`${step.key}-${i}`} className="flex items-center gap-1 shrink-0">
                      {i > 0 && <span className="text-ink-100 text-xs">→</span>}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0 ${
                          step.active
                            ? "bg-primary text-white"
                            : "bg-white/50 text-ink-400 border border-white/50"
                        }`}
                      >
                        {step.label}
                      </span>
                    </span>
                  ));
                })()}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
                  <UserRound className="h-3.5 w-3.5" />
                  ลูกค้า
                </div>
                <p className="mt-2 text-sm font-medium text-ink-900">{customerName}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
                  <CalendarDays className="h-3.5 w-3.5" />
                  วันที่ออก
                </div>
                <p className="mt-2 text-sm font-medium text-ink-900">{issueDateLabel}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
                  <ArrowRight className="h-3.5 w-3.5" />
                  ครบกำหนด
                </div>
                <p className={`mt-2 text-sm font-medium ${isOverdue ? "text-red-700" : "text-ink-900"}`}>{dueDateLabel}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
                  <CalendarDays className="h-3.5 w-3.5" />
                  แก้ไขล่าสุด
                </div>
                <p className="mt-2 text-sm font-medium text-ink-900">{doc.updated_at ? formatDate(doc.updated_at) : "-"}</p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-line-soft bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
              <CircleDollarSign className="h-4 w-4" />
              ยอดสำคัญ
            </div>
            <div className="mt-3 text-3xl font-semibold text-ink-900">฿ {formatCurrency(getDisplayAmount(doc))}</div>
            <p className="mt-1 text-sm text-ink-600">{getDisplayAmountLabel(doc)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {canEditDocument && (
                <Button size="sm" onClick={() => navigate(`/documents/${doc.id}/edit`)}>
                  แก้ไขเอกสาร
                </Button>
              )}
              {doc.deal_id && (
                <Button variant="secondary" size="sm" onClick={() => navigate(`/deals/${doc.deal_id}`)}>
              ไปที่หน้างานขาย
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
          isVoided
            ? "border-danger-border bg-danger-soft text-danger-text"
      : isPaid
        ? "border-success-border bg-success-soft text-success-text"
        : isPartiallyPaid
          ? "border-warning-border bg-warning-soft text-warning-text"
          : isOverdue
                ? "border-danger-border bg-danger-soft text-danger-text"
                : isSent || isIssued
                  ? "border-sent-bg bg-primary-soft text-primary-deep"
                  : "border-line-strong bg-paper-warm text-ink-700"
        }`}
      >
        {statusMessage}
      </div>

      {doc.line_items && doc.line_items.length > 0 && (
        <DetailCard title="รายการเอกสาร" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-hidden">
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
                  <td className="px-4 py-2 text-cool-400">{index + 1}</td>
                  <td className="px-4 py-2 text-cool-500">
                    <div>{item.item_name}</div>
                    {item.line_note ? <div className="mt-1 text-xs text-gray-500">{item.line_note}</div> : null}
                    {item.discount_amount > 0 && (
                      <div className="text-xs text-red-500">
                        ส่วนลด {item.discount_percent}% (-฿{formatCurrency(item.discount_amount)})
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-cool-500">{item.quantity} {item.unit}</td>
                  <td className="px-4 py-2 text-right text-cool-500">฿{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-2 text-right text-cool-500 font-medium">฿{formatCurrency(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      {doc.doc_type === "billing_note" && doc.billing_invoices && doc.billing_invoices.length > 0 && (
        <DetailCard title="ใบแจ้งหนี้ที่รวม" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-hidden">
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
                  <td className="px-4 py-2 text-cool-500">{invoice.invoice_number}</td>
                  <td className="px-4 py-2 text-right text-cool-500">฿{formatCurrency(invoice.subtotal)}</td>
                  <td className="px-4 py-2 text-right text-cool-500">฿{formatCurrency(invoice.vat_amount)}</td>
                  <td className="px-4 py-2 text-right text-cool-500">฿{formatCurrency(invoice.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      {doc.doc_type === "receipt" && doc.receipt_invoices && doc.receipt_invoices.length > 0 && (
        <DetailCard title="ใบแจ้งหนี้ที่ชำระ" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-hidden">
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
                  <td className="px-4 py-2 text-cool-500">{invoice.invoice_number}</td>
                  <td className="px-4 py-2 text-cool-500">{invoice.issue_date ? formatDate(invoice.issue_date) : "-"}</td>
                  <td className="px-4 py-2 text-right text-cool-500 font-medium">฿{formatCurrency(invoice.paid_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      {(doc.doc_type === "invoice" || doc.doc_type === "tax_invoice_receipt") && doc.invoice_delivery_notes && doc.invoice_delivery_notes.length > 0 && (
        <DetailCard title="อ้างอิงใบส่งของ" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-hidden">
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
                  <td className="px-4 py-2 text-cool-500">{deliveryNote.delivery_note_number}</td>
                  <td className="px-4 py-2 text-cool-500">{deliveryNote.issue_date ? formatDate(deliveryNote.issue_date) : "-"}</td>
                  <td className="px-4 py-2 text-right text-cool-500">฿{formatCurrency(deliveryNote.total_amount)}</td>
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
            <div className="rounded-lg bg-paper-field px-3 py-2">
              <AmountRow label="มูลค่าอ้างอิง" value={`฿${formatCurrency(doc.total_amount)}`} tone="strong" />
            </div>
          ) : (
            <>
              {!doc.vat_registered && (
                <div className="rounded-lg bg-paper-field px-3 py-2">
                  <AmountRow label="รวมทั้งสิ้น" value={`฿${formatCurrency(doc.total_amount)}`} tone="strong" />
                </div>
              )}
              {doc.vat_registered && (
                <div className="rounded-lg bg-paper-field px-3 py-2">
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
            className="border-t border-line-strong pt-2 text-base"
          />
        </div>
      </DetailCard>

      {isSettled && (doc.payment_method || doc.paid_at || doc.amount_received != null) && (
        <DetailCard title="ข้อมูลรับเงิน" icon={<CircleDollarSign className="h-4 w-4" />} className={`mb-4 ${isPartiallyPaid ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
          <div className="space-y-1 text-sm">
          {doc.payment_method && (
            <div className="flex justify-between">
              <span className={isPartiallyPaid ? "text-amber-700" : "text-green-700"}>วิธีชำระ:</span>
              <span>{PAYMENT_METHOD_LABELS[doc.payment_method] || doc.payment_method}</span>
            </div>
          )}
          {doc.amount_received != null && (
            <div className="flex justify-between">
              <span className={isPartiallyPaid ? "text-amber-700" : "text-green-700"}>จำนวนเงิน:</span>
              <span>฿{formatCurrency(doc.amount_received)}</span>
            </div>
          )}
          {isPartiallyPaid && (
            <div className="flex justify-between text-amber-700">
              <span>คงเหลือ:</span>
              <span className="font-semibold">฿{formatCurrency(Math.max(0, doc.net_payable - (doc.amount_received || 0)))}</span>
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
          <div className="space-y-2 text-sm text-amber-950">
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
              <div className="rounded-xl border border-amber-200 bg-white/70 p-3 text-sm text-amber-950">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-amber-700">เหตุผล</div>
                <p className="whitespace-pre-wrap">{doc.backdated_reason}</p>
              </div>
            )}
          </div>
        </DetailCard>
      )}

      {doc.note && (
        <DetailCard title="หมายเหตุ" icon={<NotebookText className="h-4 w-4" />} className="mb-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.note}</p>
        </DetailCard>
      )}

      <div className="bg-white border-t border-card-border px-4 py-3 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto w-full max-w-7xl space-y-2 rounded-2xl border border-card-border bg-white p-3 shadow-[0_12px_30px_rgba(26,26,24,0.08)] md:p-4">
          <div className="pb-1">
            <h3 className="text-sm font-semibold text-ink-900">การดำเนินการถัดไป</h3>
            <p className="mt-1 text-xs leading-5 text-ink-500">{statusMessage}</p>
          </div>
          <div className="space-y-2">
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={handleGeneratePdf}
            >
              ดาวน์โหลดเอกสาร
            </Button>
          </div>

          {isDraft && isUtilityBill && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => navigate(`/documents/${doc.id}/edit-utility`)}
            >
              <Pencil className="h-4 w-4 mr-1.5" />
              แก้ไข
            </Button>
          )}

          {isDraft && doc.doc_type === "invoice" && !isUtilityBill && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => navigate(`/documents/${doc.id}/edit`)}
            >
              แก้ไขฉบับร่าง
            </Button>
          )}

          {isDraft && doc.doc_type === "delivery_note" && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => navigate(`/documents/${doc.id}/edit`)}
            >
              แก้ไขฉบับร่าง
            </Button>
          )}

          {isDraft && doc.doc_type !== "receipt" && doc.doc_type !== "credit_note" && canSendDocumentType(permissions, doc.doc_type) && (
            <Button
              variant={doc.doc_type === "delivery_note" ? "primary" : "secondary"}
              size="md"
              className="w-full"
              onClick={async () => {
                setActionLoading("send");
                try {
                  const { warnings } = await sendDocumentWithSideEffects(doc, userId!, { issueDate: devIssueDate });
                  warnings.forEach((w) =>
                    toast.info(`${w.itemName} สต็อกไม่พอ (มี ${w.available} ${w.unit} แต่ใช้ ${w.requested} ${w.unit})`)
                  );
                  await fetchDoc();
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setActionLoading(null);
                }
              }}
              loading={actionLoading === "send"}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {doc.doc_type === "delivery_note" ? "ยืนยันส่งของแล้ว" : "ทำเครื่องหมายว่าส่งแล้ว"}
            </Button>
          )}

          {isDraft && doc.doc_type === "credit_note" && canSendDocumentType(permissions, doc.doc_type) && (
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={async () => {
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
                  toast.success("ออกใบลดหนี้แล้ว");
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setActionLoading(null);
                }
              }}
              loading={actionLoading === "send"}
            >
              <FileText className="h-4 w-4 mr-1.5" />
              ออกใบลดหนี้
            </Button>
          )}

          {isSent && doc.doc_type === "delivery_note" && canSendDocumentType(permissions, doc.doc_type) && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
              เอกสารถูกล็อกหลังยืนยันส่งของแล้ว หากผิดให้ยกเลิกและสร้างใหม่
            </div>
          )}

          {(isDraft || (isSent && doc.doc_type === "invoice")) && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700">
              {isDraft
                ? doc.doc_type === "delivery_note"
                  ? "ใบส่งของฉบับร่างยังแก้ไขหรือลบได้ก่อนยืนยันส่งของ"
                  : "ฉบับร่างสามารถลบได้ถาวร"
                : "ใบแจ้งหนี้ที่ส่งแล้วควรยกเลิกเพื่อเก็บประวัติ ใช้เมนูยกเลิกด้านล่างแทนการลบ"}
            </div>
          )}

          {isSent && doc.doc_type === "delivery_note" && (
            <div className="space-y-2">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={() => navigate(`/documents/new?type=invoice_from_delivery_notes&dnId=${doc.id}`)}
              >
                ออกใบแจ้งหนี้จากใบนี้
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={() => navigate(`/documents/new?type=invoice_from_delivery_notes&dnId=${doc.id}`)}
              >
                รวมกับใบส่งของอื่น
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {permissions.canVoidDocuments && (
                  <>
                    <Button
                      variant="ghost"
                      size="md"
                      className="w-full"
                      onClick={() => {
                        setVoidReason("");
                        setVoidAndRecreate(false);
                        setVoidModal(true);
                      }}
                    >
                      ยกเลิกอย่างเดียว
                    </Button>
                    <Button
                      variant="danger"
                      size="md"
                      className="w-full"
                      onClick={() => {
                        setVoidReason("");
                        setVoidAndRecreate(true);
                        setVoidModal(true);
                      }}
                    >
                      ยกเลิกและสร้างใหม่
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {isConverted && doc.doc_type === "delivery_note" && dnInvoiceRef && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => navigate(`/documents/${dnInvoiceRef.id}`)}
            >
              เปิดใบแจ้งหนี้ {dnInvoiceRef.doc_number || ""}
            </Button>
          )}

          {isSent && doc.doc_type === "invoice" && permissions.canRecordPayments && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => navigate(`/documents/new?type=billing_note&dealId=${doc.deal_id || ""}`)}
            >
              <ClipboardList className="h-4 w-4 mr-1.5" />
              วางบิล
            </Button>
          )}

          {isDraft && permissions.canDeleteDocuments && (
            <Button variant="danger" size="md" className="w-full" onClick={() => setDeleteModal(true)}>
              ลบเอกสาร
            </Button>
          )}

          {isSent && doc.doc_type === "quotation" && !hasQuotationDnActivity && canSendDocumentType(permissions, doc.doc_type) && (
            <Button
              variant="primary"
              size="md"
              className="w-full"
              loading={actionLoading === "convert"}
              onClick={() => setConvertModal(true)}
            >
              แปลงเป็นใบแจ้งหนี้
            </Button>
          )}

          {(isSent || isPartiallyPaid) && (doc.doc_type === "invoice" || doc.doc_type === "billing_note") && permissions.canRecordPayments && (
            <div className="space-y-2">
              <Button variant="primary" size="md" className="w-full" onClick={openPayModal}>
                {isPartiallyPaid ? "รับชำระเพิ่ม" : "รับเงินแล้ว"}
              </Button>
              {doc.doc_type === "invoice" && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
                  ระบบจะเก็บใบเดิมไว้เป็นประวัติ และสร้างฉบับใหม่ให้แก้ไข เลขที่ใบเดิมจะไม่ถูกนำกลับมาใช้ซ้ำ
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  className="w-full"
                  onClick={() => {
                    setVoidReason("");
                    setCorrectionReason("");
                    setVoidAndRecreate(false);
                    setVoidModal(true);
                  }}
                >
                  ยกเลิกอย่างเดียว
                </Button>
                <Button
                  variant={doc.doc_type === "invoice" ? "primary" : "danger"}
                  size="md"
                  className="w-full"
                  onClick={() => {
                    setVoidReason("");
                    setCorrectionReason("");
                    setVoidAndRecreate(true);
                    setVoidModal(true);
                  }}
                >
                  {doc.doc_type === "invoice" ? "แก้ไขโดยออกฉบับใหม่" : "ยกเลิกและสร้างใหม่"}
                </Button>
              </div>
            </div>
          )}

          {isIssued && doc.doc_type === "tax_invoice_receipt" && permissions.canVoidDocuments && (
            <div className="space-y-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                ใบกำกับภาษีออกแล้ว หากยอดลดลงควรออกใบลดหนี้ หากออกผิดให้ยกเลิกและออกฉบับใหม่พร้อมเหตุผล
              </div>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={() => navigate(`/documents/new?type=credit_note&dealId=${doc.deal_id || ""}`)}
              >
                ออกใบลดหนี้
              </Button>
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={() => {
                  setVoidReason("");
                  setCorrectionReason("");
                  setVoidAndRecreate(true);
                  setVoidModal(true);
                }}
              >
                ยกเลิกและออกฉบับใหม่
              </Button>
            </div>
          )}

          {(isSent || (isIssued && doc.doc_type === "tax_invoice_receipt")) && doc.doc_type !== "quotation" && doc.doc_type !== "invoice" && doc.doc_type !== "billing_note" && doc.doc_type !== "delivery_note" && doc.doc_type !== "tax_invoice_receipt" && permissions.canVoidDocuments && (
            <Button
              variant="danger"
              size="md"
              className="w-full"
              onClick={() => {
                setVoidReason("");
                setVoidAndRecreate(false);
                setVoidModal(true);
              }}
            >
              ยกเลิก
            </Button>
          )}

          {doc.deal_id && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => navigate(`/deals/${doc.deal_id}`)}
            >
              ไปที่หน้างานขาย
            </Button>
          )}

          {isSent && !isPaid && !isVoided && doc.doc_type !== "invoice" && doc.doc_type !== "billing_note" && doc.doc_type !== "delivery_note" && permissions.canVoidDocuments && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setVoidReason("");
                setVoidAndRecreate(false);
                setVoidModal(true);
              }}
            >
              ยกเลิกอย่างเดียว
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={voidModal}
        onClose={() => setVoidModal(false)}
        title={voidAndRecreate ? correctionTitle : "ยกเลิกเอกสาร"}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
            เอกสารเดิม: <span className="font-semibold text-stone-900">{doc.doc_number || docLabel.thai}</span>
          </div>
          <p className="text-sm text-gray-600">
            {voidAndRecreate
              ? "ฉบับเดิมจะถูกยกเลิกและเก็บไว้เป็นประวัติ จากนั้นระบบจะสร้างฉบับร่างใหม่ให้แก้ไข โดยใช้เลขที่ใหม่"
              : "คุณแน่ใจว่าต้องการยกเลิกเอกสารนี้?"}
          </p>
          {voidAndRecreate && isCorrectionCandidate && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              เอกสารที่ออกแล้วแก้ไขทับฉบับเดิมไม่ได้ หากเป็นการลดยอดหรือคืนเงิน ให้ใช้เมนู “ออกใบลดหนี้” แทน
            </div>
          )}
          {voidAndRecreate && isCorrectionCandidate && (
            <label className="block text-sm text-gray-700">
              <span className="mb-1 block font-medium">สาเหตุการแก้ไข *</span>
              <select
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                className="w-full rounded-lg border border-card-border bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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

      <Modal open={payModal} onClose={() => { setPayModal(false); setPayMismatchConfirm(false); }} title="ยืนยันการรับเงิน">
        <div className="space-y-3">
          {payMismatchConfirm ? (
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
                    <span className="font-medium text-amber-900">฿{formatCurrency(paymentPreview.preTax)}</span>
                  </div>
                  <div className="border-t border-amber-200 pt-1.5 flex justify-between">
                    <span className="text-amber-700">ส่วนต่าง</span>
                    <span className="font-bold text-amber-900">{paymentPreview.preTax > paymentBaseRemaining ? "+" : ""}฿{formatCurrency(paymentPreview.preTax - paymentBaseRemaining)}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-amber-700">
                  {paymentPreview.preTax < paymentBaseRemaining
                    ? "คุณกำลังบันทึกชำระบางส่วน ยอดคงเหลือจะแสดงในรายงานลูกหนี้จนกว่าจะชำระครบ"
                    : "ยอดก่อน VAT เกินยอดคงเหลือ ระบบจะไม่บันทึกยอดส่วนเกิน"}
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setPayMismatchConfirm(false)}>กลับไปแก้ไข</Button>
                <Button variant="primary" onClick={executePay} loading={paying}>ยืนยันรับเงิน</Button>
              </div>
            </>
          ) : (
            <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ยอดก่อน VAT คงเหลือ</label>
            <p className="text-lg font-semibold">฿{formatCurrency(paymentBaseRemaining)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">กรอกยอดโดยอ้างอิงจาก</label>
            <select
              className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white"
              value={paymentInputBasis}
              onChange={(e) => {
                const nextBasis = e.target.value as ReceiptInputBasis;
                setPaymentBaseAmount(convertReceiptInputAmount({
                  amount: paymentBaseAmount,
                  from: paymentInputBasis,
                  to: nextBasis,
                  vatRate: doc.vat_rate,
                  whtRate: doc.wht_rate,
                }));
                setPaymentInputBasis(nextBasis);
                setReceiptInputBasisPreference(nextBasis);
              }}
            >
              <option value="pre_tax">ยอดชำระก่อน VAT</option>
              <option value="gross">ยอดรวมก่อนหัก WHT</option>
              <option value="net_cash">ยอดโอนจริงหลังหัก WHT</option>
            </select>
          </div>
          <Input
            label={paymentInputBasis === "pre_tax" ? "ยอดชำระก่อน VAT" : paymentInputBasis === "gross" ? "ยอดรวมก่อนหัก WHT" : "ยอดโอนจริงหลังหัก WHT"}
            type="number"
            step="0.01"
            value={paymentBaseAmount || ""}
            onChange={(e) => setPaymentBaseAmount(parseFloat(e.target.value) || 0)}
          />
          <div className="rounded-lg border border-card-border bg-stone-50 px-3 py-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">VAT</span><span>฿{formatCurrency(paymentPreview.vatAmount)}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-gray-500">ยอดรวมก่อน WHT</span><span>฿{formatCurrency(paymentPreview.grossAmount)}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-gray-500">WHT</span><span>฿{formatCurrency(paymentPreview.whtAmount)}</span></div>
            <div className="mt-2 flex justify-between border-t border-card-border pt-2 font-semibold"><span>ยอดโอนจริงหลังหัก WHT</span><span>฿{formatCurrency(paymentPreview.netAmount)}</span></div>
          </div>
          <Select
            label="วิธีชำระเงิน"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
          >
            {Object.entries(PAYMENT_METHOD_LABELS).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </Select>
          {payMethod === "bank_transfer" && (
            <Select
              label="รับเข้าบัญชี"
              value={payBankAccountId ?? ""}
              onChange={(e) => setPayBankAccountId(e.target.value || null)}
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
            </Select>
          )}
          <Input
            label="เลขที่ใบหักภาษี ณ ที่จ่าย (ถ้ามี)"
            value={payWhtCert}
            onChange={(e) => setPayWhtCert(e.target.value)}
            placeholder="ไม่บังคับ"
          />
          <Input
            label="วันที่รับเงิน"
            type="date"
            value={payDate}
            max={todayString()}
            onChange={(e) => setPayDate(e.target.value)}
          />
          {isPastDate(payDate, businessToday) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-sm font-medium text-amber-900">กำลังออกใบเสร็จย้อนหลัง</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                ระบบจะใช้วันที่รับเงินจริงบนใบเสร็จ และเก็บเวลาที่บันทึกเข้าระบบไว้แยกกันเพื่อให้ตรวจสอบย้อนหลังได้
              </p>
              <div className="mt-3">
                <Select
                  label="เหตุผลในการออกย้อนหลัง"
                  value={payBackdateReason}
                  onChange={(e) => setPayBackdateReason(e.target.value)}
                >
                  <option value="">เลือกเหตุผล</option>
                  {RECEIPT_BACKDATE_REASON_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-amber-900">หมายเหตุเพิ่มเติม (ถ้ามี)</label>
                <textarea
                  value={payBackdateNote}
                  onChange={(e) => setPayBackdateNote(e.target.value)}
                  rows={3}
                  placeholder="รายละเอียดเพิ่มเติม เช่น วันที่ได้รับสลิป หรือข้อมูลที่ต้องการให้ทีมบัญชีเห็น"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setPayModal(false)}>ปิด</Button>
          <Button variant="primary" onClick={handlePay} loading={paying} disabled={paymentBaseAmount <= 0}>ยืนยัน</Button>
          </div>
            </>
          )}
        </div>
      </Modal>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="ลบเอกสาร">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            คุณแน่ใจว่าต้องการลบเอกสารนี้? การลบไม่สามารถเรียกคืนได้
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>ยกเลิก</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>ลบ</Button>
          </div>
        </div>
      </Modal>

      <Modal open={convertModal} onClose={() => setConvertModal(false)} title="แปลงเป็นใบแจ้งหนี้">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            คุณต้องการแปลงใบเสนอราคาเป็นใบแจ้งหนี้ใช่หรือไม่?
          </p>
          <p className="text-sm">
            ยอดรวม: <span className="font-semibold">฿{formatCurrency(getDisplayAmount(doc))}</span>
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConvertModal(false)}>ยกเลิก</Button>
            <Button variant="primary" onClick={handleConvert} loading={actionLoading === "convert"}>ยืนยัน</Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
