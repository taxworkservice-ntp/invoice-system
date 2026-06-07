import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, CircleDollarSign, FileStack, NotebookText, Printer, UserRound } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input, Select } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Spinner } from "../../../components/ui/Spinner";
import { getDocumentDetail, saveLineItems } from "../../../hooks/useDocuments";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { generateDocNumberBE } from "../../../lib/docNumber";
import { deductStockOnDocumentSent, restoreStockOnVoid } from "../../../lib/stock";
import { DOC_TYPE_LABELS, PAYMENT_METHOD_LABELS, DOC_TYPE_COLORS } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { isHtmlPrintTemplate } from "../../../lib/print";
import { buildReceiptBackdateFields, isPastDate, toLocalMiddayIso, todayString } from "../../../lib/receiptBackdating";
import type { Document, Customer, DocumentStatus, PaymentMethod, ClientProfile } from "../../../types";
import type { PDFData } from "../../../lib/pdf";
import type jsPDF from "jspdf";

function formatDate(date: string): string {
  return formatBuddhistDate(date);
}

function DocTypeBadge({ docType, vatRegistered }: { docType: Document["doc_type"]; vatRegistered: boolean }) {
  const color = DOC_TYPE_COLORS[docType];
  const label = documentTypeLabel(docType, vatRegistered);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${color.bg} ${color.text}`}>
      {label.thai}
    </span>
  );
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
    <section className={`rounded-[22px] border border-[#E8E6DF] bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        {icon ? <span className="text-[#8A8478]">{icon}</span> : null}
        <h3 className="text-sm font-semibold text-[#1A1A18]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);

  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const pdfDocRef = useRef<jsPDF | null>(null);
  const pdfDataRef = useRef<PDFData | null>(null);

  const [voidModal, setVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidAndRecreate, setVoidAndRecreate] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const [payModal, setPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("bank_transfer");
  const [payAmount, setPayAmount] = useState(0);
  const toast = useToast();
  const [payWhtCert, setPayWhtCert] = useState("");
  const [payDate, setPayDate] = useState(todayString());
  const [payBackdateReason, setPayBackdateReason] = useState("");
  const [paying, setPaying] = useState(false);

  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [convertModal, setConvertModal] = useState(false);

  const fetchDoc = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getDocumentDetail(id);
      setDoc(data);
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
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleDelete = async () => {
    if (!doc || !userId) return;
    setDeleting(true);
    try {
      await supabase.from("document_line_items").delete().eq("document_id", doc.id);
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
    setVoiding(true);
    try {
      await supabase
        .from("documents")
        .update({
          status: "voided" as DocumentStatus,
          voided_at: new Date().toISOString(),
          voided_reason: voidReason || null,
        })
        .eq("id", doc.id);

      if ((doc.doc_type === "invoice" && doc.status === "sent") || (doc.doc_type === "tax_invoice_receipt" && doc.status === "issued")) {
        await restoreStockOnVoid(doc.id, userId);
      }

      if (voidAndRecreate) {
        const issueDate = doc.issue_date || new Date().toISOString().slice(0, 10);
        const newDocNumber = await generateDocNumberBE(userId, doc.doc_type, issueDate);
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
            payment_method: doc.doc_type === "tax_invoice_receipt" ? doc.payment_method : null,
            amount_received: doc.doc_type === "tax_invoice_receipt" ? doc.amount_received : null,
            paid_at: doc.doc_type === "tax_invoice_receipt" ? doc.paid_at : null,
            wht_certificate_no: doc.doc_type === "tax_invoice_receipt" ? doc.wht_certificate_no : null,
            copied_from_id: doc.id,
          })
          .select("*")
          .single();

        if (newDoc && doc.line_items?.length) {
          await saveLineItems(
            doc.line_items.map((lineItem, index) => ({
              document_id: newDoc.id,
              user_id: userId,
              item_id: lineItem.item_id,
              item_name: lineItem.item_name,
              item_sku: lineItem.item_sku,
              item_type: lineItem.item_type,
              unit: lineItem.unit,
              unit_price: lineItem.unit_price,
              quantity: lineItem.quantity,
              discount_percent: lineItem.discount_percent,
              discount_amount: lineItem.discount_amount,
              qty_carton: lineItem.qty_carton,
              carton_unit: lineItem.carton_unit,
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
      setVoidAndRecreate(false);
      await fetchDoc();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVoiding(false);
    }
  };

  const handlePay = async () => {
    if (!doc || !userId || payAmount <= 0) return;
    const isBackdatedReceipt = isPastDate(payDate);
    if (isBackdatedReceipt && !payBackdateReason.trim()) {
      setError("กรุณาระบุเหตุผลในการออกใบเสร็จย้อนหลัง");
      return;
    }

    setPaying(true);
    try {
      const paidAt = toLocalMiddayIso(payDate);
      const receiptBackdateFields = buildReceiptBackdateFields({
        selectedDate: payDate,
        userId,
        reason: payBackdateReason,
      });
      await supabase
        .from("documents")
        .update({
          status: "paid" as DocumentStatus,
          paid_at: paidAt,
          payment_method: payMethod,
          amount_received: payAmount,
          wht_certificate_no: payWhtCert || null,
        })
        .eq("id", doc.id);

      if (doc.doc_type === "billing_note") {
        const { data: linked } = await supabase
          .from("billing_note_invoices")
          .select("invoice_id")
          .eq("billing_note_id", doc.id);

        if (linked?.length) {
          await supabase
            .from("documents")
            .update({ status: "paid" as DocumentStatus, paid_at: paidAt })
            .in("id", linked.map((item: any) => item.invoice_id));
        }
      }

      const recNumber = await generateDocNumberBE(userId, "receipt", payDate);
      await supabase.from("documents").insert({
        user_id: userId,
        deal_id: doc.deal_id,
        customer_id: doc.customer_id,
        doc_type: "receipt",
        doc_number: recNumber,
        status: "generated" as DocumentStatus,
        issue_date: payDate,
        paid_at: paidAt,
        vat_registered: doc.vat_registered,
        vat_rate: doc.vat_rate,
        wht_rate: doc.wht_rate,
        discount_percent: doc.discount_percent,
        discount_amount: doc.discount_amount,
        subtotal: doc.subtotal,
        vat_amount: doc.vat_amount,
        total_amount: doc.total_amount,
        wht_amount: doc.wht_amount,
        net_payable: payAmount,
        payment_method: payMethod,
        amount_received: payAmount,
        wht_certificate_no: payWhtCert || null,
        ...receiptBackdateFields,
      });

      setPayModal(false);
      setPayBackdateReason("");
      await fetchDoc();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleConvert = async () => {
    if (!doc || !userId) return;
    setActionLoading("convert");
    try {
      const issueDate = doc.issue_date || new Date().toISOString().slice(0, 10);
      const docNumber = await generateDocNumberBE(userId, "invoice", issueDate);
      const { data: invoice } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          deal_id: doc.deal_id,
          customer_id: doc.customer_id,
          doc_type: "invoice",
          doc_number: docNumber,
          status: "sent" as DocumentStatus,
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
          converted_from_id: doc.id,
        })
        .select("*")
        .single();

      if (invoice && doc.line_items?.length) {
        await saveLineItems(
          doc.line_items.map((lineItem, index) => ({
            document_id: invoice.id,
            user_id: userId,
            item_id: lineItem.item_id,
            item_name: lineItem.item_name,
            item_sku: lineItem.item_sku,
            item_type: lineItem.item_type,
            unit: lineItem.unit,
            unit_price: lineItem.unit_price,
            quantity: lineItem.quantity,
            discount_percent: lineItem.discount_percent,
            discount_amount: lineItem.discount_amount,
            qty_carton: lineItem.qty_carton,
            carton_unit: lineItem.carton_unit,
            line_total: lineItem.line_total,
            sort_order: index,
          }))
        );
        await deductStockOnDocumentSent(invoice.id, userId);
      }

      await supabase
        .from("documents")
        .update({ status: "converted" as DocumentStatus })
        .eq("id", doc.id);

      setConvertModal(false);
      navigate(`/documents/${invoice.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopy = async () => {
    if (!doc || !userId) return;
    setActionLoading("copy");
    try {
      const issueDate = doc.issue_date || new Date().toISOString().slice(0, 10);
      const docNumber = await generateDocNumberBE(userId, doc.doc_type, issueDate);
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
            item_sku: lineItem.item_sku,
            item_type: lineItem.item_type,
            unit: lineItem.unit,
            unit_price: lineItem.unit_price,
            quantity: lineItem.quantity,
            discount_percent: lineItem.discount_percent,
            discount_amount: lineItem.discount_amount,
            qty_carton: lineItem.qty_carton,
            carton_unit: lineItem.carton_unit,
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

  const handleGeneratePdf = async () => {
    if (!doc || !clientProfile || !doc.customer) return;

    if (isHtmlPrintTemplate(clientProfile.pdf_template)) {
      const previewUrl = `/documents/${doc.id}/print`;
      window.open(previewUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setGeneratingPdf(true);
    try {
      const { generatePDF, generatePDFBlob } = await import("../../../lib/pdf");
      const customer = doc.customer as unknown as Customer;
      const pdfData: PDFData = {
        document: doc,
        lineItems: doc.line_items || [],
        billingNoteInvoices: doc.billing_invoices || [],
        clientProfile,
        customer,
      };
      pdfDataRef.current = pdfData;
      const pdfDoc = await generatePDF(pdfData);
      pdfDocRef.current = pdfDoc;
      const blob = await generatePDFBlob(pdfData);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!pdfDocRef.current || !pdfDataRef.current) {
      await handleGeneratePdf();
      await new Promise((r) => setTimeout(r, 300));
    }
    if (pdfDocRef.current && pdfDataRef.current) {
      const { downloadPDF } = await import("../../../lib/pdf");
      downloadPDF(pdfDataRef.current, pdfDocRef.current);
    }
  };

  const openPayModal = () => {
    if (!doc) return;
    setPayAmount(doc.net_payable);
    setPayMethod("bank_transfer");
    setPayWhtCert("");
    setPayDate(todayString());
    setPayBackdateReason("");
    setError("");
    setPayModal(true);
  };

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
  const isIssued = doc.status === "issued";
  const isPaid = doc.status === "paid" || doc.status === "generated" || doc.status === "issued";
  const isVoided = doc.status === "voided";
  const isOverdue = doc.due_date && isSent && new Date(doc.due_date) < new Date();
  const lineDiscountTotal = doc.line_items?.reduce((sum, item) => sum + (item.discount_amount || 0), 0) || 0;
  const grossSubtotal = doc.subtotal + (doc.discount_amount || 0) + lineDiscountTotal;
  const usesHtmlPrintPreview = isHtmlPrintTemplate(clientProfile?.pdf_template);
  const docLabel = documentTypeLabel(doc.doc_type, doc.vat_registered);
  const customerName = customer?.name || "ไม่ได้ระบุลูกค้า";
  const issueDateLabel = formatDate(doc.issue_date);
  const dueDateLabel = doc.due_date ? formatDate(doc.due_date) : "ไม่มีกำหนด";
  const hasBackdateAudit = Boolean(doc.backdated_at || doc.backdated_reason);
  const statusMessage = isVoided
    ? "ยกเลิกแล้ว เก็บไว้เป็นประวัติ"
    : isPaid
      ? "ปิดงานแล้วและมีข้อมูลรับเงินครบ"
      : isOverdue
        ? "เกินกำหนดแล้ว ควรติดตามการชำระ"
        : isSent || isIssued
          ? "เอกสารถูกส่งแล้ว รอดำเนินการขั้นถัดไป"
          : "ฉบับร่าง ตรวจสอบและส่งเมื่อพร้อม";

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
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mb-4 rounded-[26px] border border-[#E8E6DF] bg-[linear-gradient(135deg,#FFFDF8_0%,#F5F1E8_100%)] p-5 sm:p-6">
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
              <h2 className="text-2xl font-semibold tracking-tight text-[#1A1A18] sm:text-3xl">{doc.doc_number || "-"}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#625C52]">{statusMessage}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#8A8478]">
                  <UserRound className="h-3.5 w-3.5" />
                  ลูกค้า
                </div>
                <p className="mt-2 text-sm font-medium text-[#1A1A18]">{customerName}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#8A8478]">
                  <CalendarDays className="h-3.5 w-3.5" />
                  วันที่ออก
                </div>
                <p className="mt-2 text-sm font-medium text-[#1A1A18]">{issueDateLabel}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#8A8478]">
                  <ArrowRight className="h-3.5 w-3.5" />
                  ครบกำหนด
                </div>
                <p className={`mt-2 text-sm font-medium ${isOverdue ? "text-red-700" : "text-[#1A1A18]"}`}>{dueDateLabel}</p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-[24px] border border-[#E5DED2] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#8A8478]">
              <CircleDollarSign className="h-4 w-4" />
              ยอดสำคัญ
            </div>
            <div className="mt-3 text-3xl font-semibold text-[#1A1A18]">฿ {formatCurrency(doc.net_payable)}</div>
            <p className="mt-1 text-sm text-[#6B655C]">{doc.wht_rate > 0 ? "ยอดสุทธิหลังหัก ณ ที่จ่าย" : "ยอดรวมเอกสารนี้"}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate(`/documents/edit?id=${doc.id}`)}>
                แก้ไขเอกสาร
              </Button>
              {doc.deal_id && (
                <Button variant="secondary" size="sm" onClick={() => navigate(`/deals/${doc.deal_id}`)}>
                  เปิดดีล
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
          isVoided
            ? "border-[#F2D4D4] bg-[#FFF4F4] text-[#8A2020]"
            : isPaid
              ? "border-[#CFE7D8] bg-[#EDF8F1] text-[#1E5A38]"
              : isOverdue
                ? "border-[#F0D0D0] bg-[#FFF0F0] text-[#8A2020]"
                : isSent || isIssued
                  ? "border-[#D9E7F7] bg-[#EAF4FF] text-[#0C447C]"
                  : "border-[#E5E1D9] bg-[#F6F2EA] text-[#4C463D]"
        }`}
      >
        {statusMessage}
      </div>

      {pdfUrl && (
        <DetailCard title="ตัวอย่างเอกสาร" icon={<Printer className="h-4 w-4" />} className="mb-4">
          <iframe
            src={pdfUrl}
            className="w-full h-[60vh] rounded-2xl border border-[#ECE7DD]"
            title="PDF Preview"
          />
        </DetailCard>
      )}

      {doc.line_items && doc.line_items.length > 0 && (
        <DetailCard title="รายการเอกสาร" icon={<FileStack className="h-4 w-4" />} className="mb-4 overflow-hidden !p-0">
          <div className="-mt-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-[#FAF8F3]">
                <th className="w-8 px-4 py-3 text-left text-xs font-medium text-gray-500">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">รายการ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">จำนวน</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">ราคา/หน่วย</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">รวม</th>
              </tr>
            </thead>
            <tbody>
              {doc.line_items.map((item, index) => (
                <tr key={item.id} className="border-b border-card-border last:border-0">
                  <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                  <td className="px-4 py-2 text-gray-700">
                    <div>{item.item_name}</div>
                    {item.discount_amount > 0 && (
                      <div className="text-xs text-red-500">
                        ส่วนลด {item.discount_percent}% (-฿{formatCurrency(item.discount_amount)})
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">{item.quantity} {item.unit}</td>
                  <td className="px-4 py-2 text-right text-gray-700">฿{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-2 text-right text-gray-700 font-medium">฿{formatCurrency(item.line_total)}</td>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-[#FAF8F3]">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">เลขที่ใบแจ้งหนี้</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">ยอดก่อน VAT</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">VAT</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">รวม</th>
              </tr>
            </thead>
            <tbody>
              {doc.billing_invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-card-border last:border-0">
                  <td className="px-4 py-2 text-gray-700">{invoice.invoice_number}</td>
                  <td className="px-4 py-2 text-right text-gray-700">฿{formatCurrency(invoice.subtotal)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">฿{formatCurrency(invoice.vat_amount)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">฿{formatCurrency(invoice.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DetailCard>
      )}

      <DetailCard title="สรุปยอด" icon={<CircleDollarSign className="h-4 w-4" />} className="mb-4">
        <div className="space-y-1 text-sm">
          {lineDiscountTotal > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">ยอดก่อนส่วนลด</span>
                <span className="text-gray-700">฿{formatCurrency(grossSubtotal)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>ส่วนลดรายการ</span>
                <span>-฿{formatCurrency(lineDiscountTotal)}</span>
              </div>
            </>
          )}
          {doc.discount_amount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>ส่วนลดท้ายบิล {doc.discount_percent > 0 ? `(${doc.discount_percent}%)` : ""}</span>
              <span>-฿{formatCurrency(doc.discount_amount)}</span>
            </div>
          )}
          {!doc.vat_registered && (
            <div className="flex justify-between font-semibold">
              <span className="text-gray-700">รวมทั้งสิ้น</span>
              <span className="text-gray-800">฿{formatCurrency(doc.total_amount)}</span>
            </div>
          )}
          {doc.vat_registered && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">ราคารวม</span>
                <span className="text-gray-700">฿{formatCurrency(doc.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">VAT {doc.vat_rate}%</span>
                <span className="text-gray-700">฿{formatCurrency(doc.vat_amount)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1 border-t border-gray-100">
                <span className="text-gray-700">รวมทั้งสิ้น</span>
                <span className="text-gray-800">฿{formatCurrency(doc.total_amount)}</span>
              </div>
            </>
          )}
          {doc.wht_rate > 0 && (
            <>
              <div className="flex justify-between text-red-600">
                <span>หัก ณ ที่จ่าย {doc.wht_rate}%</span>
                <span>-฿{formatCurrency(doc.wht_amount)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t border-gray-100">
                <span className="text-gray-800">ยอดที่ต้องชำระ</span>
                <span className="text-gray-900">฿{formatCurrency(doc.net_payable)}</span>
              </div>
            </>
          )}
        </div>
      </DetailCard>

      {isPaid && (doc.payment_method || doc.paid_at || doc.amount_received != null) && (
        <DetailCard title="ข้อมูลรับเงิน" icon={<CircleDollarSign className="h-4 w-4" />} className="mb-4 border-green-200 bg-green-50">
          <div className="space-y-1 text-sm">
          {doc.payment_method && (
            <div className="flex justify-between">
              <span className="text-green-700">วิธีชำระ:</span>
              <span>{PAYMENT_METHOD_LABELS[doc.payment_method] || doc.payment_method}</span>
            </div>
          )}
          {doc.amount_received != null && (
            <div className="flex justify-between">
              <span className="text-green-700">จำนวนเงิน:</span>
              <span>฿{formatCurrency(doc.amount_received)}</span>
            </div>
          )}
          {doc.paid_at && (
            <div className="flex justify-between">
              <span className="text-green-700">วันที่:</span>
              <span>{formatDate(doc.paid_at)}</span>
            </div>
          )}
          {doc.wht_certificate_no && (
            <div className="flex justify-between">
              <span className="text-green-700">ใบหักภาษี:</span>
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

      <div className="h-20" />

      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-white border-t border-card-border px-4 py-3 z-30 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="max-w-4xl mx-auto space-y-2 rounded-[24px] border border-[#E8E6DF] bg-white p-3 shadow-[0_12px_30px_rgba(26,26,24,0.08)] md:p-4">
          <div className="pb-1">
            <h3 className="text-sm font-semibold text-[#1A1A18]">การดำเนินการถัดไป</h3>
            <p className="mt-1 text-xs leading-5 text-[#6F6A61]">{statusMessage}</p>
          </div>
          {usesHtmlPrintPreview ? (
            <div className="space-y-2">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={handleGeneratePdf}
                disabled={!clientProfile || !doc.customer || generatingPdf}
                loading={generatingPdf}
              >
                {generatingPdf ? "กำลังเปิดเอกสาร..." : "ดูเอกสาร"}
              </Button>
            </div>
          ) : !pdfUrl ? (
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={handleGeneratePdf}
              disabled={!clientProfile || !doc.customer || generatingPdf}
              loading={generatingPdf}
            >
              {generatingPdf ? "กำลังสร้าง PDF..." : "สร้าง PDF"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                className="flex-1 !bg-[#378ADD] !text-white"
                size="md"
                onClick={handleDownloadPdf}
              >
                ⬇ ดาวน์โหลด PDF
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={handleGeneratePdf}
                loading={generatingPdf}
              >
                สร้างใหม่
              </Button>
            </div>
          )}

          {isDraft && doc.doc_type !== "receipt" && doc.doc_type !== "credit_note" && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={async () => {
                setActionLoading("send");
                try {
                  await supabase
                    .from("documents")
                    .update({ status: (doc.doc_type === "tax_invoice_receipt" ? "issued" : "sent") as DocumentStatus })
                    .eq("id", doc.id);
                  if (doc.doc_type === "invoice" || doc.doc_type === "delivery_note" || doc.doc_type === "tax_invoice_receipt") {
                    const { warnings } = await deductStockOnDocumentSent(doc.id, userId!);
                    warnings.forEach((w) =>
                      console.warn(`Stock warning: ${w.itemName} insufficient (have ${w.available} ${w.unit}, used ${w.requested})`)
                    );
                  }
                  await fetchDoc();
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setActionLoading(null);
                }
              }}
              loading={actionLoading === "send"}
            >
              📤 ทำเครื่องหมายว่าส่งแล้ว
            </Button>
          )}

          {isDraft && doc.doc_type === "credit_note" && (
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={async () => {
                setActionLoading("send");
                try {
                  await supabase
                    .from("documents")
                    .update({ status: "issued" as DocumentStatus })
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
              📄 ออกใบลดหนี้
            </Button>
          )}

          {(isDraft || (isSent && doc.doc_type === "invoice")) && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700">
              {isDraft
                ? "Drafts can be deleted permanently."
                : "Sent invoices should be voided to preserve history. Use the void actions below instead of deleting."}
            </div>
          )}

          {isSent && doc.doc_type === "invoice" && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => navigate(`/documents/new?type=billing_note&deal=${doc.deal_id || ""}`)}
            >
              📋 วางบิล
            </Button>
          )}

          {isDraft && (
            <Button variant="danger" size="md" className="w-full" onClick={() => setDeleteModal(true)}>
              ลบเอกสาร
            </Button>
          )}

          {isSent && doc.doc_type === "quotation" && (
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

          {isSent && (doc.doc_type === "invoice" || doc.doc_type === "billing_note") && (
            <div className="space-y-2">
              <Button variant="primary" size="md" className="w-full" onClick={openPayModal}>
                รับเงินแล้ว
              </Button>
              <div className="grid grid-cols-2 gap-2">
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
              </div>
            </div>
          )}

          {(isSent || (isIssued && doc.doc_type === "tax_invoice_receipt")) && doc.doc_type !== "quotation" && doc.doc_type !== "invoice" && doc.doc_type !== "billing_note" && (
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

          {(isPaid || isVoided) && (
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              loading={actionLoading === "copy"}
              onClick={handleCopy}
            >
              คัดลอกเป็นฉบับร่าง
            </Button>
          )}

          {isSent && !isPaid && !isVoided && doc.doc_type !== "invoice" && doc.doc_type !== "billing_note" && (
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
        title={voidAndRecreate ? "ยกเลิกและสร้างใหม่" : "ยกเลิกเอกสาร"}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {voidAndRecreate
              ? "การยกเลิกจะเปลี่ยนสถานะเป็นยกเลิก และสร้างสำเนาใหม่ในสถานะร่าง"
              : "คุณแน่ใจว่าต้องการยกเลิกเอกสารนี้?"}
          </p>
          <Input
            label="เหตุผลการยกเลิก"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="ไม่บังคับ"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setVoidModal(false)}>ปิด</Button>
            <Button variant="danger" onClick={handleVoid} loading={voiding}>ยืนยัน</Button>
          </div>
        </div>
      </Modal>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="ยืนยันการรับเงิน">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ยอดที่ต้องชำระ</label>
            <p className="text-lg font-semibold">฿{formatCurrency(doc.net_payable)}</p>
          </div>
          <Input
            label="จำนวนเงินที่รับ"
            type="number"
            step="0.01"
            value={payAmount || ""}
            onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
          />
          <Select
            label="วิธีชำระเงิน"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
          >
            {Object.entries(PAYMENT_METHOD_LABELS).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </Select>
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
          {isPastDate(payDate) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-sm font-medium text-amber-900">กำลังออกใบเสร็จย้อนหลัง</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                ระบบจะใช้วันที่รับเงินจริงบนใบเสร็จ และเก็บเวลาที่บันทึกเข้าระบบไว้แยกกันเพื่อให้ตรวจสอบย้อนหลังได้
              </p>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-amber-900">เหตุผลในการออกย้อนหลัง</label>
                <textarea
                  value={payBackdateReason}
                  onChange={(e) => setPayBackdateReason(e.target.value)}
                  rows={3}
                  placeholder="เช่น รับชำระเมื่อ 2 วันก่อน แต่เพิ่งได้รับหลักฐานและเข้ามาบันทึกวันนี้"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setPayModal(false)}>ปิด</Button>
            <Button variant="primary" onClick={handlePay} loading={paying} disabled={payAmount <= 0}>ยืนยัน</Button>
          </div>
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
            ยอดรวม: <span className="font-semibold">฿{formatCurrency(doc.net_payable)}</span>
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
