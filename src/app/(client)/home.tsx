import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import { isRefSummaryLine } from "../../lib/refSummary";
import { computeDealFinancialSummary } from "../../lib/dealFinancials";
import { isDocumentOverdue, pickAmountDocument } from "../../lib/dealStatus";
import { useAuth, useClientProfile, useWorkspaceRole } from "../../hooks/useAuth";
import { AppShell } from "../../components/layout/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ViewToggle } from "../../components/ui/ViewToggle";
import type { ViewMode } from "../../components/ui/ViewToggle";
import { SortableTh } from "../../components/ui/SortableTh";
import { useTableSort } from "../../components/ui/useTableSort";
import { HomeTopBar } from "../../components/home/HomeTopBar";
import { SummaryRow } from "../../components/home/SummaryRow";
import { isManualStage, MANUAL_STAGE_LABELS, type ManualStage } from "../../lib/dealStages";
import { DealCard } from "../../components/home/DealCard";
import { NewDealSheet } from "../../components/home/NewDealSheet";
import { CustomerAvatar } from "../../components/customer/CustomerAvatar";
import { supabase } from "../../lib/supabase";
import { formatCurrency } from "../../lib/format";
import { formatBuddhistDate, formatBuddhistDateTime, formatBuddhistDateTimeParts } from "../../lib/dates";
import { HomeNudgeBanner } from "../../components/home/HomeNudgeBanner";
import { DOC_TYPE_LABELS, DOC_TYPE_SHORT, DOC_TYPE_COLORS } from "../../constants";
import { TABLE } from "../../lib/tableStyles";
import type { Deal, Document, Customer, DocumentLineItem } from "../../types";
import { getWorkspacePermissions } from "../../lib/permissions";

type DealDoc = Pick<
  Document,
  | "id"
  | "doc_type"
  | "doc_number"
   | "status"
   | "total_amount"
   | "net_payable"
   | "wht_amount"
   | "amount_received"
  | "due_date"
  | "created_at"
  | "updated_at"
  | "paid_at"
  | "line_items"
  | "converted_from_id"
>;

type DealWithRelations = Deal & {
  customers: Pick<
    Customer,
    "id" | "name" | "code" | "avatar_initials" | "avatar_color"
  > | null;
  documents: DealDoc[];
  deal_number: string | null;
};

const DONE_MONTH_OPTIONS = [
  { value: "01", label: "ม.ค." },
  { value: "02", label: "ก.พ." },
  { value: "03", label: "มี.ค." },
  { value: "04", label: "เม.ย." },
  { value: "05", label: "พ.ค." },
  { value: "06", label: "มิ.ย." },
  { value: "07", label: "ก.ค." },
  { value: "08", label: "ส.ค." },
  { value: "09", label: "ก.ย." },
  { value: "10", label: "ต.ค." },
  { value: "11", label: "พ.ย." },
  { value: "12", label: "ธ.ค." },
];

type DashboardDeal = {
  dealId: string;
  dealNumber: string | null;
  customerName: string;
  customerCode: string | null;
  customerAvatar: Pick<
    Customer,
    "name" | "avatar_initials" | "avatar_color"
  > | null;
  itemSummary: string;
  itemNames: string[];
  amount: number;
  grossAmount: number;
  netPayable: number;
  amountReceived: number;
  outstandingAmount: number;
  customerCredit: number;
  whtAmount: number;
  expectedWhtAmount: number;
  receiptCount: number;
  completedDocNumber: string | null;
  status: Document["status"];
  stageLabel: string;
  stageHint: string;
  queue: HomeQueue;
  isStageManual: boolean;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  paidAt: string | null;
  latestDocument: DealDoc | null;
  documents: DealDoc[];
  isDone: boolean;
  isOverdue: boolean;
  isEmpty: boolean;
  nextActionLabel: string;
  internalNote: string;
  noteAuthorRole: string;
  docTypeLabel: string;
  partialReceived: number;
  isPartiallyPaid: boolean;
  taxDocNumber: string | null;
  isAllVoided: boolean;
};

type HomeQueue =
  | "wait_send"
  | "wait_invoice"
  | "wait_collect"
  | "partial"
  | "overdue"
  | "progress"
  | "done";
type HomeFilter =
  | "all"
  | "wait_send"
  | "wait_send_invoice"
  | "wait_invoice"
  | "wait_collect"
  | "partial"
  | "overdue";

const QUEUE_COLORS: Record<
  HomeQueue,
  { bg: string; text: string; dot: string }
> = {
  wait_send: {
    bg: "bg-[#FFF8EB]",
    text: "text-[#8B6914]",
    dot: "bg-amber-500",
  },
  wait_invoice: {
    bg: "bg-[#F5F0FF]",
    text: "text-[#5B21B6]",
    dot: "bg-violet-500",
  },
  wait_collect: {
    bg: "bg-[#ECFDF5]",
    text: "text-[#065F46]",
    dot: "bg-emerald-500",
  },
  partial: {
    bg: "bg-[#FFF8EB]",
    text: "text-[#B45309]",
    dot: "bg-amber-600",
  },
  overdue: { bg: "bg-[#FEF2F2]", text: "text-[#C0392B]", dot: "bg-[#C0392B]" },
  progress: { bg: "bg-[#EEF6FF]", text: "text-[#0C447C]", dot: "bg-primary" },
  done: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
};

function isResolvedStatus(status: Document["status"]) {
  return ["paid", "converted", "generated", "voided", "issued"].includes(
    status,
  );
}

// A quotation whose pipeline has moved past it (a delivery note or invoice was
// created from it) must not keep the deal open — its stored status may stay
// "sent" forever, but the deal can still be considered done.
function getQuotationsWithDownstream(documents: DealDoc[]) {
  const downstream = new Set<string>();
  for (const doc of documents) {
    if (doc.doc_type !== "quotation" && doc.converted_from_id) {
      downstream.add(doc.converted_from_id);
    }
    if (doc.doc_type === "quotation") continue;
    for (const line of doc.line_items || []) {
      if (line.source_document_id) downstream.add(line.source_document_id);
    }
  }
  return downstream;
}

function isQuotationResolved(doc: DealDoc, downstreamQuotes: Set<string>) {
  return (
    (doc.doc_type === "quotation" && downstreamQuotes.has(doc.id)) ||
    isResolvedStatus(doc.status)
  );
}

function isOverdueDocument(doc: DealDoc | null) {
  return isDocumentOverdue(doc);
}

function sortDocuments(documents: DealDoc[]) {
  return [...documents].sort((a, b) => {
    const updated = b.updated_at.localeCompare(a.updated_at);
    if (updated !== 0) return updated;
    const created = b.created_at.localeCompare(a.created_at);
    if (created !== 0) return created;
    return b.id.localeCompare(a.id);
  });
}

function getLatestRelevantDocument(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  if (nonVoided.length === 0) return null;
  const unresolved = nonVoided.filter((doc) => !isResolvedStatus(doc.status));
  return sortDocuments(unresolved.length > 0 ? unresolved : nonVoided)[0] || null;
}

function getMostUrgentDocument(documents: DealDoc[]) {
  const overdue = documents
    .filter((doc) => doc.status !== "voided" && isOverdueDocument(doc))
    .sort((a, b) => (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31"));
  return overdue[0] || getLatestRelevantDocument(documents);
}

// Shared selector (BN > INV > TIR > QT > DN) — identical to the deal page.
function getAmountDocument(documents: DealDoc[]) {
  return pickAmountDocument(documents);
}

function getDealWhtAmount(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const receipts = nonVoided.filter(
    (doc) => doc.doc_type === "receipt" && ["generated", "issued", "paid"].includes(doc.status),
  );

  // Each receipt represents one payment, so summing receipts handles partial payments correctly.
  if (receipts.length > 0) {
    return receipts.reduce((sum, receipt) => sum + (receipt.wht_amount || 0), 0);
  }

  const combinedReceipts = nonVoided.filter(
    (doc) => doc.doc_type === "tax_invoice_receipt" && ["issued", "paid"].includes(doc.status),
  );
  if (combinedReceipts.length > 0) {
    return combinedReceipts.reduce((sum, receipt) => sum + (receipt.wht_amount || 0), 0);
  }

  return 0;
}

function getItemPreview(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const withItems = sortDocuments(nonVoided).filter((doc) => (doc.line_items || []).length > 0);

  // Newest document first; skip docs whose only rows are reference summaries
  // so previews show real item/service names.
  for (const doc of withItems) {
    const names = (doc.line_items || [])
      .filter((item) => !isRefSummaryLine(item))
      .map((item) => item.item_name.trim())
      .filter(Boolean);
    if (names.length > 0) return names;
  }
  return [];
}

function getCompletionDoc(documents: DealDoc[]) {
  const nonVoided = sortDocuments(documents.filter((doc) => doc.status !== "voided"));
  return (
    nonVoided.find((doc) => doc.doc_type === "receipt" && ["generated", "paid", "issued"].includes(doc.status)) ||
    nonVoided.find((doc) => doc.doc_type === "tax_invoice_receipt" && ["issued", "paid"].includes(doc.status)) ||
    nonVoided.find((doc) => doc.doc_type === "billing_note" && ["paid", "partially_paid"].includes(doc.status)) ||
    nonVoided.find((doc) => doc.doc_type === "invoice" && ["paid", "partially_paid"].includes(doc.status)) ||
    null
  );
}

function getReceiptDocuments(documents: DealDoc[]) {
  return sortDocuments(documents).filter(
    (doc) => doc.status !== "voided" && doc.doc_type === "receipt" && ["generated", "issued", "paid"].includes(doc.status),
  );
}

function hasPartialPayment(documents: DealDoc[]) {
  return documents.some((doc) => doc.status === "partially_paid");
}

function getCompletedAt(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const downstreamQuotes = getQuotationsWithDownstream(nonVoided);
  if (nonVoided.some((doc) => !isQuotationResolved(doc, downstreamQuotes))) return null;
  const completion = getCompletionDoc(nonVoided);
  return completion?.paid_at || completion?.updated_at || null;
}

function isDealDone(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  if (nonVoided.length === 0) return true;
  const downstreamQuotes = getQuotationsWithDownstream(nonVoided);
  return nonVoided.every((doc) => isQuotationResolved(doc, downstreamQuotes));
}

function getDealReceivedAmount(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const receipts = nonVoided.filter((doc) => doc.doc_type === "receipt" && ["generated", "issued", "paid"].includes(doc.status));
  const receiptReceived = receipts.reduce((sum, doc) => sum + (doc.amount_received || 0), 0);
  const billingReceived = nonVoided
    .filter((doc) => doc.doc_type === "billing_note" && ["paid", "partially_paid"].includes(doc.status))
    .reduce((sum, doc) => sum + (doc.amount_received || 0), 0);
  const invoiceReceived = nonVoided
    .filter((doc) => doc.doc_type === "invoice" && ["paid", "partially_paid"].includes(doc.status))
    .reduce((sum, doc) => sum + (doc.amount_received || 0), 0);
  const combinedReceived = nonVoided
    .filter((doc) => doc.doc_type === "tax_invoice_receipt" && ["paid", "issued"].includes(doc.status))
    .reduce((sum, doc) => sum + (doc.amount_received || 0), 0);

  // Receipts and source documents can be populated by different workflows;
  // use the highest authoritative cumulative total without double-counting them.
  return Math.max(receiptReceived, billingReceived, invoiceReceived, combinedReceived);
}

// Unique non-voided document types in pipeline order — rendered as badges
// in the done-deals table (replaces the redundant status checkmark).
const DONE_BADGE_ORDER = [
  "quotation",
  "delivery_note",
  "invoice",
  "tax_invoice_receipt",
  "billing_note",
  "receipt",
  "credit_note",
  "debit_note",
] as const;

function getDoneDocBadges(documents: DealDoc[]) {
  const present = new Set(
    documents.filter((doc) => doc.status !== "voided").map((doc) => doc.doc_type),
  );
  return DONE_BADGE_ORDER.filter((t) => present.has(t));
}

function compareActiveDeals(a: DashboardDeal, b: DashboardDeal) {
  const queuePriority: Record<HomeQueue, number> = {
    overdue: 0,
    partial: 1,
    wait_collect: 2,
    wait_invoice: 3,
    wait_send: 4,
    progress: 5,
    done: 6,
  };
  const priority = queuePriority[a.queue] - queuePriority[b.queue];
  if (priority !== 0) return priority;
  if (a.queue === "overdue" || b.queue === "overdue") {
    const due = (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31");
    if (due !== 0) return due;
  }
  return b.updatedAt.localeCompare(a.updatedAt);
}

function getNextActionLabel(doc: DealDoc | null) {
  if (!doc) return "";
  if (isOverdueDocument(doc)) return "เกินกำหนด — บันทึกรับเงิน →";
  if (doc.doc_type === "receipt" && doc.status === "draft")
    return "ยืนยันการรับเงิน →";
  if (doc.doc_type === "quotation" && doc.status === "draft")
    return "ส่งใบเสนอราคาให้ลูกค้า →";
  if (doc.doc_type === "quotation" && doc.status === "sent")
    return "ลูกค้าตกลงแล้ว? สร้างบิลต่อ →";
  if (doc.doc_type === "invoice" && doc.status === "draft")
    return "ส่งใบแจ้งหนี้ให้ลูกค้า →";
  if (doc.doc_type === "invoice" && doc.status === "sent")
    return "สร้างใบวางบิล →";
  if (doc.doc_type === "delivery_note" && doc.status === "draft")
    return "บันทึกว่าส่งของแล้ว →";
  if (doc.doc_type === "delivery_note" && doc.status === "sent")
    return "สร้างบิลจากใบส่งของ →";
  if (doc.doc_type === "tax_invoice_receipt") return "";
  if (doc.doc_type === "billing_note" && doc.status === "draft")
    return "ส่งใบวางบิลให้ลูกค้า →";
  if (doc.doc_type === "billing_note" && doc.status === "sent")
    return "บันทึกรับเงิน →";
  return "";
}

function getDnWaitingForInvoice(documents: DealDoc[]) {
  return documents.filter(
    (doc) => doc.doc_type === "delivery_note" && doc.status === "sent",
  );
}

function getBillingWaitingForPayment(documents: DealDoc[]) {
  return documents.filter(
    (doc) =>
      doc.doc_type === "billing_note" &&
      (doc.status === "sent" || doc.status === "overdue"),
  );
}

function getQuotationDeliveryProgress(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const quote = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "quotation");
  if (!quote?.line_items?.length) return null;

  const deliveredByQuoteLine = new Map<string, number>();
  for (const doc of nonVoided) {
    if (
      doc.doc_type !== "delivery_note" ||
      (doc.status !== "sent" && doc.status !== "converted")
    )
      continue;
    for (const line of doc.line_items || []) {
      if (line.source_document_id !== quote.id || !line.source_line_item_id)
        continue;
      deliveredByQuoteLine.set(
        line.source_line_item_id,
        (deliveredByQuoteLine.get(line.source_line_item_id) || 0) +
          line.quantity,
      );
    }
  }

  const quoted = quote.line_items.reduce((sum, line) => sum + line.quantity, 0);
  const delivered = quote.line_items.reduce(
    (sum, line) => sum + (deliveredByQuoteLine.get(line.id) || 0),
    0,
  );
  if (delivered <= 0) return null;
  return { delivered, quoted };
}

function getStageInfo(
  documents: DealDoc[],
  latestDocument: DealDoc | null,
  isDone: boolean,
  isOverdue: boolean,
) {
  const dnWaiting = getDnWaitingForInvoice(documents);
  const billingWaiting = getBillingWaitingForPayment(documents);
  const quoteProgress = getQuotationDeliveryProgress(documents);

  if (isDone)
    return {
      stageLabel: "เสร็จแล้ว",
      stageHint: "ปิดงานแล้ว",
      queue: "done" as HomeQueue,
    };
  if (isOverdue)
    return {
      stageLabel: "เกินกำหนด",
      stageHint: "ต้องติดตาม",
      queue: "overdue" as HomeQueue,
    };
  if (hasPartialPayment(documents))
    return {
      stageLabel: "ชำระบางส่วน",
      stageHint: "ยังรับเงินไม่ครบ",
      queue: "partial" as HomeQueue,
    };
  if (dnWaiting.length > 0) {
    return {
      stageLabel: "รอออกใบแจ้งหนี้",
      stageHint: `ส่งของแล้ว ${dnWaiting.length} ใบ`,
      queue: "wait_invoice" as HomeQueue,
    };
  }
  if (billingWaiting.length > 0)
    return {
      stageLabel: "รอรับเงิน",
      stageHint: "ใบวางบิลส่งแล้ว",
      queue: "wait_collect" as HomeQueue,
    };
  // Draft receipt = payment recorded but not confirmed yet.
  const draftReceipt = documents.find(
    (doc) => doc.doc_type === "receipt" && doc.status === "draft",
  );
  if (draftReceipt)
    return {
      stageLabel: "รอยืนยันการรับเงิน",
      stageHint: "ใบเสร็จร่าง",
      queue: "wait_collect" as HomeQueue,
    };
  if (latestDocument?.status === "draft") {
    const label =
      latestDocument.doc_type === "quotation"
        ? "รอส่งใบเสนอราคา"
        : latestDocument.doc_type === "delivery_note"
          ? "รอส่งของ"
          : latestDocument.doc_type === "invoice"
            ? "รอส่งใบแจ้งหนี้"
            : latestDocument.doc_type === "billing_note"
              ? "รอส่งใบวางบิล"
              : "รอส่งเอกสาร";
    const draftCount = documents.filter((doc) => doc.status === "draft").length;
    return {
      stageLabel: label,
      stageHint:
        draftCount > 1
          ? `ฉบับร่าง • มี ${draftCount} ร่างค้าง`
          : "ฉบับร่าง",
      queue: "wait_send" as HomeQueue,
    };
  }
  if (quoteProgress) {
    return {
      stageLabel: "กำลังส่งของ",
      stageHint: `ส่งแล้ว ${quoteProgress.delivered.toLocaleString("th-TH")} / ${quoteProgress.quoted.toLocaleString("th-TH")}`,
      queue: "progress" as HomeQueue,
    };
  }
  if (latestDocument?.doc_type === "quotation")
    return {
      stageLabel: "ใบเสนอราคา",
      stageHint: "รอลูกค้าตอบ",
      queue: "progress" as HomeQueue,
    };
  if (latestDocument?.doc_type === "invoice")
    return {
      stageLabel: "รอวางบิล",
      stageHint: "ใบแจ้งหนี้ส่งแล้ว",
      queue: "progress" as HomeQueue,
    };
  if (latestDocument?.doc_type === "delivery_note")
    return {
      stageLabel: "ใบส่งของ",
      stageHint: "รอดำเนินการต่อ",
      queue: "progress" as HomeQueue,
    };
  return {
    stageLabel: "กำลังดำเนินการ",
    stageHint: latestDocument?.doc_number || "",
    queue: "progress" as HomeQueue,
  };
}

function deriveDashboardDeal(deal: DealWithRelations): DashboardDeal {
  const latestDocument = getMostUrgentDocument(deal.documents || []);
  const amountDocument = getAmountDocument(deal.documents || []);
  const paidAt = getCompletedAt(deal.documents || []);
  const isDone = isDealDone(deal.documents || []);
  const isOverdue = isOverdueDocument(latestDocument);
  const stageInfo = getStageInfo(
    deal.documents || [],
    latestDocument,
    isDone,
    isOverdue,
  );

  // Officer-pinned stage wins over the derived stage, except completion which
  // is factual (derived from document state) and always takes precedence.
  let stageLabel = stageInfo.stageLabel;
  let stageHint = stageInfo.stageHint;
  let queue: HomeQueue = stageInfo.queue;
  let isStageManual = false;
  if (!isDone && isManualStage(deal.manual_stage)) {
    queue = deal.manual_stage;
    stageLabel = MANUAL_STAGE_LABELS[deal.manual_stage];
    stageHint = "ตั้งค่าสถานะเอง";
    isStageManual = true;
  }

  const latestNote =
    (deal.notes || []).length > 0 ? deal.notes![0].content : "";
  const latestNoteRole =
    (deal.notes || []).length > 0 ? deal.notes![0].author_role : "";

  const amountReceived = getDealReceivedAmount(deal.documents || []);
  const grossAmount = amountDocument?.total_amount ?? amountDocument?.net_payable ?? 0;
  const netPayable = amountDocument?.net_payable ?? amountDocument?.total_amount ?? 0;
  const expectedWhtAmount = amountDocument?.wht_amount ?? 0;
  // Adjustment notes reconcile on their NET amounts (gross incl. VAT minus the
  // WHT they release), same basis as the invoice — shared with the deal page.
  const adjustmentSummary = computeDealFinancialSummary(deal.documents || [], amountDocument ?? null);
  const outstandingAmount = adjustmentSummary.outstanding;
  const customerCredit = adjustmentSummary.customerCredit;
  const receiptCount = getReceiptDocuments(deal.documents || []).length;
  const partialReceived = amountReceived;
  const isPartiallyPaid = (deal.documents || []).some((d) => d.status === "partially_paid");

  const taxDoc = (deal.documents || []).find(
    (d) => d.doc_type === "tax_invoice_receipt" || d.doc_type === "invoice",
  ) || null;
  const taxDocNumber = taxDoc?.doc_number || null;

  const isAllVoided = (deal.documents || []).length > 0 &&
    (deal.documents || []).every((d) => d.status === "voided");

  return {
    dealId: deal.id,
    dealNumber: (deal as any).deal_number || null,
    customerName: deal.customers?.name || "ลูกค้า",
    customerCode: deal.customers?.code || null,
    customerAvatar: deal.customers
      ? {
          name: deal.customers.name,
          avatar_initials: deal.customers.avatar_initials,
          avatar_color: deal.customers.avatar_color,
        }
      : null,
    itemSummary: deal.title || latestDocument?.doc_number || "",
    itemNames: getItemPreview(deal.documents || []),
    amount: netPayable,
    grossAmount,
    netPayable,
    amountReceived,
    outstandingAmount,
    customerCredit,
    whtAmount: getDealWhtAmount(deal.documents || []),
    expectedWhtAmount,
    receiptCount,
    status: isOverdue ? "overdue" : latestDocument?.status || "draft",
    stageLabel,
    stageHint,
    queue,
    isStageManual,
    createdAt: deal.created_at,
    // Most recent activity across the deal itself and any of its documents, so
    // editing the deal (without touching documents) still surfaces it on top.
    updatedAt:
      [deal.updated_at, latestDocument?.updated_at]
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || deal.updated_at,
    dueDate: latestDocument?.due_date || null,
    paidAt,
    latestDocument,
    completedDocNumber: getCompletionDoc(deal.documents || [])?.doc_number || null,
    documents: deal.documents || [],
    isDone,
    isOverdue,
    isEmpty: isDone && (deal.documents || []).filter((d) => d.status !== "voided").length === 0,
    nextActionLabel: getNextActionLabel(latestDocument),
    internalNote: latestNote,
    noteAuthorRole: latestNoteRole,
    docTypeLabel: latestDocument?.doc_type ? (DOC_TYPE_LABELS[latestDocument.doc_type]?.th || latestDocument.doc_type) : "",
    partialReceived,
    isPartiallyPaid,
    taxDocNumber,
    isAllVoided,
  };
}

export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);

  const [deals, setDeals] = useState<DashboardDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [homeFilter, setHomeFilter] = useState<HomeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [donePage, setDonePage] = useState(1);
  const [doneSort, setDoneSort] = useState<"updatedAt" | "paidAt">(() => {
    if (typeof window === "undefined") return "updatedAt";
    const stored = window.localStorage.getItem("home.done.sort");
    return stored === "paidAt" ? "paidAt" : "updatedAt";
  });
  const [doneYear, setDoneYear] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return window.localStorage.getItem("home.done.year") || "all";
  });
  const [doneMonth, setDoneMonth] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return window.localStorage.getItem("home.done.month") || "all";
  });

  // Persist the done-section filters so the last choice survives reloads.
  useEffect(() => {
    window.localStorage.setItem("home.done.sort", doneSort);
    window.localStorage.setItem("home.done.year", doneYear);
    window.localStorage.setItem("home.done.month", doneMonth);
  }, [doneSort, doneYear, doneMonth]);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem("homeViewMode");
    return stored === "list" || stored === "grid" || stored === "table"
      ? stored
      : "list";
  });
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    window.localStorage.setItem("homeViewMode", viewMode);
  }, [viewMode]);
  const [showNudge, setShowNudge] = useState<
    "profile" | "customer" | "items" | null
  >(null);
  const [nudgesLoaded, setNudgesLoaded] = useState(false);

  const touchStartY = useRef<number | null>(null);
  const pulling = useRef(false);

  const fetchDashboard = useCallback(
    async (showRefresh = false) => {
      if (!userId) return;
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("deals")
        .select(
          `
        *,
        customers(id, name, code, avatar_initials, avatar_color),
        documents(
          id, doc_type, doc_number, status, converted_from_id,
           total_amount, net_payable, wht_amount, amount_received,
          due_date, paid_at,
          created_at, updated_at
        )
      `,
        )
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const dealsWithRelations = (data || []) as unknown as DealWithRelations[];
      const docIds = dealsWithRelations
        .flatMap((deal) => (deal.documents || []).map((doc) => doc.id))
        .filter(Boolean);
      const lineItemsByDoc = new Map<string, DocumentLineItem[]>();

      if (docIds.length > 0) {
        const { data: lineItemsData } = await supabase
          .from("document_line_items")
          .select("*")
          .in("document_id", docIds)
          .order("sort_order", { ascending: true });

        for (const item of (lineItemsData || []) as DocumentLineItem[]) {
          const current = lineItemsByDoc.get(item.document_id) || [];
          current.push(item);
          lineItemsByDoc.set(item.document_id, current);
        }
      }

      setDeals(
        dealsWithRelations
          .map((deal) => ({
            ...deal,
            documents: (deal.documents || []).map((doc) => ({
              ...doc,
              line_items: lineItemsByDoc.get(doc.id) || [],
            })),
          }))
          .map(deriveDashboardDeal),
      );
      setLoading(false);
      setRefreshing(false);
    },
    [userId],
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (!userId || !clientProfile || loading || nudgesLoaded) return;

    const dismissed = JSON.parse(
      localStorage.getItem("nudges_dismissed") || "{}",
    ) as Record<string, boolean>;

    if (clientProfile.company_name_th && !dismissed.profile) {
      const missingProfile =
        !clientProfile.address ||
        (clientProfile.vat_registered && !clientProfile.tax_id);
      if (missingProfile) {
        setShowNudge("profile");
        setNudgesLoaded(true);
        return;
      }
    }

    if (!dismissed.customer) {
      supabase
        .from("customers")
        .select("id", { count: "exact" })
        .eq("user_id", userId)
        .eq("is_active", true)
        .then(
          ({ count }) => {
            if (count === 0) {
              setShowNudge("customer");
              setNudgesLoaded(true);
            } else if (!dismissed.items) {
              supabase
                .from("items")
                .select("id", { count: "exact" })
                .eq("user_id", userId)
                .eq("is_active", true)
                .then(
                  ({ count: itemCount }) => {
                    if ((itemCount || 0) < 3) {
                      const accountAge = clientProfile.created_at
                        ? Date.now() - new Date(clientProfile.created_at).getTime()
                        : 0;
                      if (accountAge > 24 * 60 * 60 * 1000) {
                        setShowNudge("items");
                      }
                    }
                    setNudgesLoaded(true);
                  },
                  () => setNudgesLoaded(true),
                );
            } else {
              setNudgesLoaded(true);
            }
          },
          () => setNudgesLoaded(true),
        );
      return;
    }

    if (!dismissed.items) {
      supabase
        .from("items")
        .select("id", { count: "exact" })
        .eq("user_id", userId)
        .eq("is_active", true)
        .then(
          ({ count: itemCount }) => {
            if ((itemCount || 0) < 3) {
              const accountAge = clientProfile.created_at
                ? Date.now() - new Date(clientProfile.created_at).getTime()
                : 0;
              if (accountAge > 24 * 60 * 60 * 1000) {
                setShowNudge("items");
              }
            }
            setNudgesLoaded(true);
          },
          () => setNudgesLoaded(true),
        );
      return;
    }

    setNudgesLoaded(true);
  }, [userId, clientProfile, loading, nudgesLoaded]);

  function handleDismissNudge(type: string) {
    const dismissed = JSON.parse(
      localStorage.getItem("nudges_dismissed") || "{}",
    ) as Record<string, boolean>;
    dismissed[type] = true;
    localStorage.setItem("nudges_dismissed", JSON.stringify(dismissed));
    setShowNudge(null);
  }

  const summary = useMemo(() => {
    return deals.reduce(
      (acc, deal) => {
        if (deal.queue === "wait_invoice") {
          acc.waitInvoiceCount += 1;
          acc.waitInvoiceAmount += deal.outstandingAmount;
        }
        if (deal.queue === "wait_collect") {
          acc.waitCollectCount += 1;
          acc.waitCollectAmount += deal.outstandingAmount;
        }
        if (deal.queue === "overdue") {
          acc.overdueCount += 1;
          acc.overdueAmount += deal.outstandingAmount;
        }
        if (deal.queue === "partial") {
          acc.partialCount += 1;
          acc.partialAmount += deal.outstandingAmount;
        }
        if (deal.queue === "wait_send") {
          acc.waitSendCount += 1;
          if (deal.latestDocument?.doc_type === "invoice")
            acc.waitSendInvoiceCount += 1;
        }
        return acc;
      },
      {
        waitInvoiceCount: 0,
        waitInvoiceAmount: 0,
        waitCollectCount: 0,
        waitCollectAmount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        partialCount: 0,
        partialAmount: 0,
        waitSendCount: 0,
        waitSendInvoiceCount: 0,
      },
    );
  }, [deals]);

  const activeDealsAll = useMemo(
    () =>
      deals
        .filter((deal) => !deal.isDone)
        .sort(compareActiveDeals),
    [deals],
  );

  const activeDeals = useMemo(
    () =>
      activeDealsAll
        .filter((deal) => {
          if (homeFilter === "all") return true;
          if (homeFilter === "wait_send_invoice") {
            return (
              deal.queue === "wait_send" &&
              deal.latestDocument?.doc_type === "invoice"
            );
          }
          return deal.queue === homeFilter;
        })
        .filter((deal) => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            deal.customerName.toLowerCase().includes(q) ||
            (deal.dealNumber || "").toLowerCase().includes(q) ||
            (deal.customerCode || "").toLowerCase().includes(q)
          );
        }),
    [activeDealsAll, homeFilter, searchQuery],
  );

  type DealSortKey = "customerName" | "stageLabel" | "createdAt" | "grossAmount" | "netPayable" | "whtAmount";
  const dealSort = useTableSort<DashboardDeal, DealSortKey>(activeDeals, {
    key: "createdAt",
    dir: "desc",
  });

  const recentlyDone = useMemo(() => {
    const sortKey = doneSort;
    return deals
      .filter((deal) => deal.isDone && !deal.isEmpty)
      .filter((deal) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          deal.customerName.toLowerCase().includes(q) ||
          (deal.dealNumber || "").toLowerCase().includes(q) ||
          (deal.customerCode || "").toLowerCase().includes(q)
        );
      })
      .filter((deal) => {
        if (doneYear === "all" && doneMonth === "all") return true;
        const d = (deal[sortKey] as string) || "";
        if (!d) return false;
        if (doneYear !== "all" && d.slice(0, 4) !== doneYear) return false;
        if (doneMonth !== "all" && d.slice(5, 7) !== doneMonth) return false;
        return true;
      })
      .sort((a, b) =>
        (b[sortKey] || "").localeCompare(a[sortKey] || ""),
      );
  }, [deals, searchQuery, doneSort, doneYear, doneMonth]);

  const doneYearOptions = useMemo(() => {
    const years = new Set<string>();
    deals.forEach((deal) => {
      if (!(deal.isDone && !deal.isEmpty)) return;
      [deal.paidAt, deal.updatedAt].forEach((value) => {
        const year = (value || "").slice(0, 4);
        if (year) years.add(year);
      });
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [deals]);

  const hasAnyDone = useMemo(
    () => deals.some((deal) => deal.isDone && !deal.isEmpty),
    [deals],
  );

  const clearDoneFilters = () => {
    setDoneYear("all");
    setDoneMonth("all");
    setSearchQuery("");
    setDonePage(1);
  };

  const DONE_PAGE_SIZE = 15;
  const totalDonePages = Math.max(1, Math.ceil(recentlyDone.length / DONE_PAGE_SIZE));
  const paginatedDone = useMemo(
    () => recentlyDone.slice((donePage - 1) * DONE_PAGE_SIZE, donePage * DONE_PAGE_SIZE),
    [recentlyDone, donePage],
  );

  useEffect(() => {
    if (donePage > totalDonePages) setDonePage(totalDonePages);
  }, [totalDonePages, donePage]);

  const homeTitle = clientProfile?.company_name_th?.trim() || "หน้างานขาย";
  const actionCount = activeDealsAll.length;

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY > 0 || refreshing) return;
    touchStartY.current = event.touches[0].clientY;
    pulling.current = true;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!pulling.current || touchStartY.current === null) return;
    const distance = event.touches[0].clientY - touchStartY.current;
    if (distance > 0 && window.scrollY === 0)
      setPullDistance(Math.min(distance, 80));
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= 60) await fetchDashboard(true);
    setPullDistance(0);
    touchStartY.current = null;
    pulling.current = false;
  };

  const summaryCards = [
    {
      label: "ทั้งหมด",
      value: activeDealsAll.reduce((s, d) => s + d.amount, 0),
      count: activeDealsAll.length,
      alert: false,
      preset: "all",
      hint: "ทุกรายการที่ต้องทำ",
      primary: "count",
    },
    {
      label: "รอเก็บเงิน",
      value: summary.waitCollectAmount,
      count: summary.waitCollectCount,
      alert: false,
      preset: "wait_collect",
      hint: "ใบวางบิล",
      primary: "amount",
    },
    {
      label: "เกินกำหนด",
      value: summary.overdueAmount,
      count: summary.overdueCount,
      alert: summary.overdueCount > 0,
      preset: "overdue",
      hint: "ควรติดตาม",
      primary: "amount",
    },
    {
      label: "ชำระบางส่วน",
      value: summary.partialAmount,
      count: summary.partialCount,
      alert: summary.partialCount > 0,
      preset: "partial",
      hint: "เก็บเพิ่มให้ครบ",
      primary: "amount",
    },
  ] as const;

  const quickFilters: { label: string; value: HomeFilter; count: number }[] = [
    { label: "ทั้งหมด", value: "all", count: activeDealsAll.length },
    { label: "รอส่ง", value: "wait_send", count: summary.waitSendCount },
    {
      label: "รอส่งใบแจ้งหนี้",
      value: "wait_send_invoice",
      count: summary.waitSendInvoiceCount,
    },
    {
      label: "รอออกบิล",
      value: "wait_invoice",
      count: summary.waitInvoiceCount,
    },
    {
      label: "รอเก็บเงิน",
      value: "wait_collect",
      count: summary.waitCollectCount,
    },
    {
      label: "ชำระบางส่วน",
      value: "partial",
      count: summary.partialCount,
    },
    { label: "เกินกำหนด", value: "overdue", count: summary.overdueCount },
  ];

  if (loading) {
    return (
      <AppShell title="หน้างานขาย" wide>
        <div className="space-y-4">
          <div className="space-y-1 px-1">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-48 rounded-md" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-card border border-card-border bg-white p-3 shadow-sm"
              >
                <Skeleton className="mb-2 h-5 w-16 rounded-md" />
                <Skeleton className="h-3 w-14 rounded-md" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({
              length: viewMode === "grid" ? 6 : viewMode === "table" ? 5 : 3,
            }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl bg-[#F1EFE8]" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="หน้างานขาย" wide>
      <div
        className="space-y-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="overflow-hidden transition-all"
          style={{
            height:
              pullDistance > 0 || refreshing
                ? Math.max(pullDistance, refreshing ? 40 : 0)
                : 0,
          }}
        >
          <div className="flex h-10 items-center justify-center text-gray-500">
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </div>
        </div>

        <HomeTopBar
          greeting={homeTitle}
          subtitle={
            actionCount === 0
              ? "ไม่มีงานค้างในวันนี้"
              : `วันนี้มี ${actionCount} รายการรอดำเนินการ`
          }
          isAllClear={actionCount === 0}
          onNewDeal={() => setNewSheetOpen(true)}
        />

        <div className="flex justify-end">
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>

        {showNudge && (
          <HomeNudgeBanner
            type={showNudge}
            onDismiss={() => handleDismissNudge(showNudge)}
          />
        )}

        {error ? (
          <Card className="py-10 text-center">
            <div className="text-sm font-medium text-gray-700">
              โหลดข้อมูลไม่สำเร็จ
            </div>
            <button
              className="mt-3 text-sm text-primary hover:underline"
              onClick={() => fetchDashboard()}
            >
              ลองใหม่
            </button>
          </Card>
        ) : deals.length === 0 ? (
          <EmptyState
            title="เริ่มต้นใช้งาน"
            description="เริ่มต้นด้วยงานขายแรกของคุณ"
            action={
              <Button onClick={() => setNewSheetOpen(true)}>
                เริ่มงานขายแรก
              </Button>
            }
          />
        ) : (
          <>
            <SummaryRow
              items={summaryCards.map((card) => ({ ...card }))}
              onCardTap={(preset) => setHomeFilter(preset as HomeFilter)}
            />

            {deals.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาตามชื่อลูกค้า เลขที่ หรือรหัส..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setDonePage(1); }}
                  className="w-full rounded-lg border border-[#E8E6DF] bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}

            <section>
              <div className="mb-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <div className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">
                    {homeFilter === "all"
                      ? "กำลังดำเนินการ"
                      : quickFilters.find(
                          (filter) => filter.value === homeFilter,
                        )?.label}
                  </div>
                  <div className="ml-auto text-[11px] text-gray-400">
                    {activeDeals.length} รายการ
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {quickFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setHomeFilter(filter.value)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        homeFilter === filter.value
                          ? "border-primary bg-blue-50 text-primary"
                          : "border-card-border bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {filter.label}
                      <span className="ml-1 text-[10px] opacity-70">
                        {filter.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {activeDeals.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีรายการในคิวนี้"
                  description="ลองเปลี่ยนตัวกรอง หรือกด “สร้างงานขายใหม่” เพื่อเริ่มงาน"
                />
              ) : viewMode === "grid" ? (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {activeDeals.map((deal) => {
                    const gridAvatar = deal.customerAvatar ?? {
                      name: deal.customerName,
                      avatar_initials: null,
                      avatar_color: null,
                    };
                    return (
                      <Card
                        key={deal.dealId}
                        className={`rounded-xl border-[0.5px] p-3.5 shadow-sm hover:shadow-md cursor-pointer flex flex-col gap-2.5 min-h-[130px] ${deal.isOverdue ? "border-l-4 border-l-[#C0392B]" : ""}`}
                        onClick={() => navigate(`/deals/${deal.dealId}`)}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <CustomerAvatar
                              customer={gridAvatar}
                              size="md"
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-[#1A1A18] line-clamp-2 leading-tight">
                                {deal.customerName}
                              </div>
                              <div className="mt-0.5 text-[10px] text-[#888780] tabular-nums">
                                สร้าง {formatBuddhistDateTime(deal.createdAt)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[13px] font-semibold text-[#1A1A18]">
                              ฿ {formatCurrency(deal.netPayable)}
                            </div>
                            <span
                              className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium ${QUEUE_COLORS[deal.queue].bg} ${QUEUE_COLORS[deal.queue].text}`}
                            >
                              {deal.stageLabel}
                            </span>
                            {deal.docTypeLabel && (
                              <div className="mt-1 text-[10px] text-[#888780]">{deal.docTypeLabel}</div>
                            )}
                          </div>
                        </div>
                        {deal.internalNote ? (
                          <div className="mt-auto pt-2 border-t border-[#F0EFE9] text-[11px] text-[#888780] leading-4">
                            {deal.internalNote}
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              ) : viewMode === "table" ? (
                <div className="bg-white border border-card-border rounded-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className={TABLE.table}>
                      <thead>
                        <tr className={TABLE.theadTr}>
                          <th className={`${TABLE.thStatic} w-[80px]`}>
                            เลขที่ดีล
                          </th>
                          <SortableTh
                            label="ลูกค้า"
                            align="left"
                            active={dealSort.sort.key === "customerName"}
                            dir={dealSort.sort.dir}
                            onClick={() => dealSort.handleSort("customerName")}
                            className={TABLE.thSortable}
                          />
                          <th className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 whitespace-nowrap">เอกสารล่าสุด</th>
                          <SortableTh
                            label="สถานะ"
                            align="left"
                            active={dealSort.sort.key === "stageLabel"}
                            dir={dealSort.sort.dir}
                            onClick={() => dealSort.handleSort("stageLabel")}
                            className={TABLE.thSortable}
                          />
                          <SortableTh
                            label="สร้างเมื่อ"
                            align="left"
                            active={dealSort.sort.key === "createdAt"}
                            dir={dealSort.sort.dir}
                            onClick={() => dealSort.handleSort("createdAt")}
                            className={TABLE.thSortable}
                          />
                          <th
                            className={`${TABLE.thStatic} hidden sm:table-cell`}
                          >
                            รายการ
                          </th>
                          <SortableTh
                            label="ยอดรวม"
                            align="right"
                            active={dealSort.sort.key === "grossAmount"}
                            dir={dealSort.sort.dir}
                            onClick={() => dealSort.handleSort("grossAmount")}
                            className={`${TABLE.thSortable} hidden md:table-cell min-w-[110px]`}
                          />
                          <SortableTh
                            label="หัก ณ ที่จ่าย"
                            align="right"
                            active={dealSort.sort.key === "whtAmount"}
                            dir={dealSort.sort.dir}
                            onClick={() => dealSort.handleSort("whtAmount")}
                            className={`${TABLE.thSortable} hidden lg:table-cell min-w-[120px]`}
                          />
                          <SortableTh
                            label="รับสุทธิ"
                            align="right"
                            active={dealSort.sort.key === "netPayable"}
                            dir={dealSort.sort.dir}
                            onClick={() => dealSort.handleSort("netPayable")}
                            className={`${TABLE.thSortable} min-w-[120px]`}
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {dealSort.sorted.map((deal) => {
                          const rowAvatar = deal.customerAvatar ?? {
                            name: deal.customerName,
                            avatar_initials: null,
                            avatar_color: null,
                          };
                          const createdAtParts = formatBuddhistDateTimeParts(deal.createdAt);
                          return (
                            <tr
                              key={deal.dealId}
                              onClick={() => navigate(`/deals/${deal.dealId}`)}
                              className={TABLE.tbodyTr}
                            >
                               <td className="px-3 py-2">
                                  <div className="text-[10px] text-[#111827] font-medium whitespace-nowrap">
                                   {deal.dealNumber || "-"}
                                 </div>
                                 {deal.taxDocNumber ? (
                                   <div className="text-[10px] text-[#888780] mt-0.5 whitespace-nowrap">
                                     {deal.taxDocNumber}
                                   </div>
                                 ) : (
                                   <div className="text-[10px] text-[#AAAAAA] italic mt-0.5 whitespace-nowrap">
                                     ยังไม่มีใบกำกับภาษี
                                   </div>
                                 )}
                               </td>
                               <td className="px-3 py-2">
                                 <div className="flex items-center gap-2 min-w-0">
                                   <CustomerAvatar
                                     customer={rowAvatar}
                                     size="sm"
                                   />
                                    <span className="text-[#111827] truncate">
                                     {deal.customerName}
                                   </span>
                                 </div>
                               </td>
                               <td className="px-3 py-2 text-[#475467] max-w-[130px] truncate">
                                 {deal.latestDocument?.doc_number || <span className="text-[#AAAAAA] italic">—</span>}
                               </td>
                               <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${QUEUE_COLORS[deal.queue].dot}`}
                                  />
                                  <span className="text-[12px] text-[#475467]">
                                    {deal.stageLabel}
                                  </span>
                                </div>
                                {deal.docTypeLabel && (
                                  <div className="mt-0.5 text-[10px] text-[#888780]">
                                    {deal.docTypeLabel}
                                  </div>
                                )}
                              </td>
                              <td className={TABLE.tdDimmed}>
                                <div className="tabular-nums leading-tight">
                                  <div>{createdAtParts.date}</div>
                                  <div className="text-[10px]">เวลา {createdAtParts.time}</div>
                                </div>
                              </td>
                              <td
                                className={`${TABLE.tdDimmed} hidden sm:table-cell`}
                              >
                                <span className="truncate block max-w-[200px]">
                                  {deal.itemNames?.length
                                    ? deal.itemNames.slice(0, 2).join(", ")
                                    : deal.itemSummary}
                                </span>
                              </td>
                              <td
                                className="px-3 py-2 text-right hidden md:table-cell"
                              >
                                <span className="text-[#475467] min-w-[100px] inline-block text-right">
                                  ฿ {formatCurrency(deal.grossAmount)}
                                  {deal.isPartiallyPaid && deal.partialReceived > 0 && (
                                    <div className="text-[10px] text-amber-700 font-medium leading-tight">
                                      รับแล้ว ฿{formatCurrency(deal.partialReceived)}
                                    </div>
                                  )}
                                </span>
                              </td>
                              <td className="hidden px-3 py-2 text-right lg:table-cell">
                                <span className={`inline-block min-w-[100px] text-right ${deal.expectedWhtAmount > 0 ? "text-[#C0392B]" : "text-[#98A2B3]"}`}>
                                  ฿ {formatCurrency(deal.expectedWhtAmount)}
                                  {deal.whtAmount > 0 && deal.whtAmount !== deal.expectedWhtAmount && (
                                    <span className="block text-[10px] font-medium text-amber-700">
                                      สะสม ฿{formatCurrency(deal.whtAmount)}
                                    </span>
                                  )}
                                </span>
                              </td>
                               <td className="px-3 py-2 text-right">
                                <span className="text-[#111827] min-w-[100px] inline-block text-right">
                                  ฿ {formatCurrency(deal.netPayable)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDeals.map((deal) => (
                    <DealCard
                      key={deal.dealId}
                      customerName={deal.customerName}
                      customerCode={deal.customerCode}
                      customerAvatar={deal.customerAvatar}
                      itemSummary={
                        deal.itemSummary ||
                        deal.latestDocument?.doc_number ||
                        DOC_TYPE_LABELS[
                          deal.latestDocument?.doc_type || "quotation"
                        ].th
                      }
                      itemNames={deal.itemNames}
                      amountText={`฿ ${formatCurrency(deal.amount)}`}
                      stageLabel={deal.stageLabel}
                      stageHint={deal.stageHint}
                      docTypeLabel={deal.docTypeLabel}
                      nextActionLabel={deal.nextActionLabel}
                      internalNote={deal.internalNote}
                      noteAuthorRole={deal.noteAuthorRole}
                      isOverdue={deal.isOverdue}
                      createdAt={deal.createdAt}
                      queue={deal.queue}
                      onTap={() => navigate(`/deals/${deal.dealId}`)}
                    />
                  ))}
                </div>
              )}
            </section>

            {hasAnyDone && (
              <>
                <div className="border-t border-card-border pt-1" />
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <div className="text-xs font-semibold uppercase tracking-[0.05em] text-emerald-700">
                        เสร็จสิ้นล่าสุด
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-gray-400">
                        {recentlyDone.length} รายการ
                      </span>
                      <button
                        className="text-[11px] text-gray-400 hover:text-gray-600"
                        onClick={() => navigate("/documents?preset=paid")}
                      >
                        ดูเอกสารที่ชำระแล้ว
                      </button>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-gray-500">เรียงตาม</span>
                    <select
                      value={doneSort}
                      onChange={(e) => {
                        setDoneSort(e.target.value as "updatedAt" | "paidAt");
                        setDonePage(1);
                      }}
                      className="rounded-lg border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="updatedAt">แก้ไขล่าสุด</option>
                      <option value="paidAt">วันที่ชำระ</option>
                    </select>

                    <span className="text-[11px] text-gray-500">ปี</span>
                    <select
                      value={doneYear}
                      onChange={(e) => {
                        setDoneYear(e.target.value);
                        setDonePage(1);
                      }}
                      className="rounded-lg border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="all">ทุกปี</option>
                      {doneYearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>

                    <span className="text-[11px] text-gray-500">เดือน</span>
                    <select
                      value={doneMonth}
                      onChange={(e) => {
                        setDoneMonth(e.target.value);
                        setDonePage(1);
                      }}
                      className="rounded-lg border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="all">ทุกเดือน</option>
                      {DONE_MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {(doneYear !== "all" || doneMonth !== "all" || searchQuery) && (
                      <button
                        type="button"
                        onClick={clearDoneFilters}
                        className="rounded-lg border border-[#E8E6DF] bg-white px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        ล้างตัวกรอง
                      </button>
                    )}
                  </div>
                  {recentlyDone.length > 0 ? (
                    <>
                      <div className="bg-white border border-card-border rounded-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className={`${TABLE.table} table-fixed min-w-[1100px]`}>
                        <thead>
                          <tr className={TABLE.theadTr}>
                            <th className={`${TABLE.thStatic} w-[90px]`}>เลขที่ดีล</th>
                            <th className={TABLE.thStatic}>ลูกค้า</th>
                            <th className={`${TABLE.thStatic} w-[135px]`}>เลขที่ใบเสร็จ</th>
                            <th className={`${TABLE.thStatic} w-[105px]`}>วันที่ชำระ</th>
                            <th className={`${TABLE.thStatic} w-[125px] text-right`}>ยอดรวม</th>
                            <th className={`${TABLE.thStatic} w-[145px] text-right`}>หัก ณ ที่จ่ายสะสม</th>
                            <th className={`${TABLE.thStatic} w-[125px] text-right`}>รับสุทธิ</th>
                            <th className={`${TABLE.thStatic} hidden sm:table-cell`}>รายการ</th>
                            <th className={`${TABLE.thStatic} w-[150px]`}>เอกสาร</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedDone.map((deal) => {
                            const rowAvatar = deal.customerAvatar ?? {
                              name: deal.customerName,
                              avatar_initials: null,
                              avatar_color: null,
                            };
                            return (
                              <tr
                                key={deal.dealId}
                                onClick={() => navigate(`/deals/${deal.dealId}`)}
                                className={TABLE.tbodyTr}
                              >
                                 <td className="px-3 py-2">
                                    <div className="text-[10px] font-mono tabular-nums text-green-500 whitespace-nowrap">
                                      {deal.dealNumber || "-"}
                                    </div>
                                   {deal.taxDocNumber && (
                                     <div className="text-[10px] text-[#888780] mt-0.5 whitespace-nowrap">
                                       {deal.taxDocNumber}
                                     </div>
                                   )}
                                 </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <CustomerAvatar customer={rowAvatar} size="sm" />
                                    <div className="min-w-0">
                                         <div className="truncate text-[#111827]">
                                        {deal.customerName}
                                      </div>
                                      {deal.customerCode && (
                                        <div className="text-[10px] font-mono text-primary">{deal.customerCode}</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                 <td className="px-3 py-2 text-[#475467] whitespace-nowrap font-mono text-[11px]">
                                   {deal.completedDocNumber ? (
                                     <>
                                       <div>{deal.completedDocNumber}</div>
                                       {deal.receiptCount > 1 && (
                                         <div className="mt-0.5 font-sans text-[10px] text-[#667085]">
                                           +{deal.receiptCount - 1} ใบเสร็จ
                                         </div>
                                       )}
                                     </>
                                   ) : (
                                     <span className="text-[#AAAAAA] italic font-sans">—</span>
                                   )}
                                 </td>
                                <td className={`${TABLE.tdDimmed} whitespace-nowrap tabular-nums`}>
                                  {deal.paidAt ? formatBuddhistDate(deal.paidAt) : "-"}
                                </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap text-[#111827]">
                                    ฿ {formatCurrency(deal.grossAmount)}
                                 </td>
                                 <td className="px-3 py-2 text-right whitespace-nowrap">
                                   <span className={deal.whtAmount > 0 ? "text-[#C0392B]" : "text-[#98A2B3]"}>
                                     ฿ {formatCurrency(deal.whtAmount)}
                                   </span>
                                 </td>
                                 <td className="px-3 py-2 text-right whitespace-nowrap text-[#111827]">
                                   ฿ {formatCurrency(deal.netPayable)}
                                 </td>
                                <td className={`${TABLE.tdDimmed} hidden sm:table-cell max-w-[200px]`}>
                                  <span className="truncate block">
                                    {deal.itemNames?.length
                                      ? deal.itemNames.slice(0, 2).join(", ")
                                      : deal.itemSummary || "-"}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  {deal.isAllVoided ? (
                                    <span className="inline-flex rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                                      ยกเลิก
                                    </span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {getDoneDocBadges(deal.documents).map((docType) => (
                                        <span
                                          key={docType}
                                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${DOC_TYPE_COLORS[docType]?.bg} ${DOC_TYPE_COLORS[docType]?.text}`}
                                          title={DOC_TYPE_LABELS[docType]?.th || docType}
                                        >
                                          {DOC_TYPE_SHORT[docType] || docType.slice(0, 3).toUpperCase()}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {totalDonePages > 1 && (
                    <div className="flex items-center justify-center gap-1 mt-3">
                      <button
                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        disabled={donePage === 1}
                        onClick={() => setDonePage((p) => Math.max(1, p - 1))}
                      >
                        ←
                      </button>
                      {Array.from({ length: totalDonePages }, (_, i) => i + 1)
                        .filter((p) => {
                          if (totalDonePages <= 7) return true;
                          if (p === 1 || p === totalDonePages) return true;
                          if (Math.abs(p - donePage) <= 1) return true;
                          return false;
                        })
                        .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === "..." ? (
                            <span key={`dots-${i}`} className="px-1 text-xs text-gray-300">…</span>
                          ) : (
                            <button
                              key={p}
                              className={`min-w-9 px-1 py-1.5 text-xs rounded ${
                                donePage === p
                                  ? "bg-primary text-white font-medium"
                                  : "text-gray-500 hover:bg-gray-100"
                              }`}
                              onClick={() => setDonePage(p)}
                            >
                              {p}
                            </button>
                          ),
                        )}
                      <button
                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        disabled={donePage === totalDonePages}
                        onClick={() => setDonePage((p) => Math.min(totalDonePages, p + 1))}
                      >
                        →
                      </button>
                    </div>
                  )}
                  </>
                  ) : (
                    <div className="rounded-card border border-card-border bg-white p-8">
                      <EmptyState
                        title="ไม่พบรายการในช่วงที่เลือก"
                        description="ลองเปลี่ยนเดือน/ปี หรือกด “ล้างตัวกรอง”"
                      />
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>

      <NewDealSheet
        open={newSheetOpen}
        onClose={() => setNewSheetOpen(false)}
        vatRegistered={clientProfile?.vat_registered}
        workspaceRole={workspaceRole}
        workspacePermissions={permissions}
        onSelect={(type) => {
          setNewSheetOpen(false);
          if (type === "billing_note") {
            navigate("/documents/new?type=billing_note");
            return;
          }
          if (type === "invoice_from_delivery_notes") {
            navigate("/documents/new?type=invoice_from_delivery_notes");
            return;
          }
          navigate(`/deals/new?type=${type}`);
        }}
      />
    </AppShell>
  );
}
