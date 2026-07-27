import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
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
import { DealCard } from "../../components/home/DealCard";
import { NewDealSheet } from "../../components/home/NewDealSheet";
import { CustomerAvatar } from "../../components/customer/CustomerAvatar";
import { supabase } from "../../lib/supabase";
import { formatCurrency } from "../../lib/format";
import { formatBuddhistDate, formatBuddhistDateTime } from "../../lib/dates";
import { HomeNudgeBanner } from "../../components/home/HomeNudgeBanner";
import { DOC_TYPE_LABELS } from "../../constants";
import { TABLE } from "../../lib/tableStyles";
import type { Deal, Document, Customer, DocumentLineItem } from "../../types";

type DealDoc = Pick<
  Document,
  | "id"
  | "doc_type"
  | "doc_number"
  | "status"
  | "total_amount"
  | "net_payable"
  | "due_date"
  | "created_at"
  | "updated_at"
  | "paid_at"
  | "line_items"
>;

type DealWithRelations = Deal & {
  customers: Pick<
    Customer,
    "id" | "name" | "code" | "avatar_initials" | "avatar_color"
  > | null;
  documents: DealDoc[];
  deal_number: string | null;
};

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
  netPayable: number;
  completedDocNumber: string | null;
  status: Document["status"];
  stageLabel: string;
  stageHint: string;
  queue: HomeQueue;
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

function firstNameFromCompanyName(name: string | null | undefined) {
  if (!name) return "";
  return name.trim() || "";
}

function isResolvedStatus(status: Document["status"]) {
  return ["paid", "converted", "generated", "voided", "issued"].includes(
    status,
  );
}

function isOverdueDocument(doc: DealDoc | null) {
  if (!doc) return false;
  if (doc.status === "overdue") return true;
  if (doc.doc_type !== "billing_note" || !doc.due_date) return false;
  return (
    new Date(doc.due_date) < new Date(new Date().toISOString().slice(0, 10)) &&
    doc.status !== "paid" && doc.status !== "partially_paid"
  );
}

function getLatestRelevantDocument(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  if (nonVoided.length === 0) return null;
  const unresolved = nonVoided.filter((doc) => !isResolvedStatus(doc.status));
  const pool = unresolved.length > 0 ? unresolved : nonVoided;
  const sorted = [...pool].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  return sorted[sorted.length - 1] || null;
}

function getAmountDocument(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  return (
    [...nonVoided]
      .reverse()
      .find((doc) => doc.doc_type === "tax_invoice_receipt") ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "billing_note") ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "invoice") ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "quotation") ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "delivery_note") ||
    null
  );
}

function getItemPreview(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const sourceDoc =
    [...nonVoided].reverse().find((doc) => (doc.line_items || []).length > 0) ||
    nonVoided.find((doc) => (doc.line_items || []).length > 0) ||
    null;

  return (sourceDoc?.line_items || [])
    .map((item) => item.item_name.trim())
    .filter(Boolean);
}

function getCompletionDoc(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  return (
    [...nonVoided].reverse().find((doc) => doc.doc_type === "receipt" && (doc.status === "generated" || doc.status === "paid" || doc.status === "issued")) ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "tax_invoice_receipt" && (doc.status === "issued" || doc.status === "paid")) ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "billing_note" && (doc.status === "paid" || doc.status === "partially_paid")) ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "invoice" && (doc.status === "paid" || doc.status === "partially_paid")) ||
    null
  );
}

function hasPartialPayment(documents: DealDoc[]) {
  return documents.some((doc) => doc.status === "partially_paid");
}

function getCompletedAt(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const isPartial = hasPartialPayment(documents);

  const receipt = [...nonVoided]
    .reverse()
    .find(
      (doc) =>
        doc.doc_type === "receipt" &&
        (doc.status === "generated" ||
          doc.status === "paid" ||
          doc.status === "issued"),
    );
  if (receipt && !isPartial) return receipt.paid_at || receipt.updated_at;

  const combined = [...nonVoided]
    .reverse()
    .find(
      (doc) =>
        doc.doc_type === "tax_invoice_receipt" &&
        (doc.status === "issued" || doc.status === "paid"),
    );
  if (combined && !isPartial) return combined.paid_at || combined.updated_at;

  const paidBilling = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "billing_note" && doc.status === "paid");
  if (paidBilling && !isPartial) return paidBilling.paid_at || paidBilling.updated_at;

  const paidInvoice = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "invoice" && doc.status === "paid");
  if (paidInvoice && !isPartial) return paidInvoice.paid_at || paidInvoice.updated_at;

  return null;
}

function isDealDone(documents: DealDoc[]) {
  if (getCompletedAt(documents)) return true;

  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  if (nonVoided.length === 0) return true;

  return nonVoided.every((doc) => isResolvedStatus(doc.status));
}

function getNextActionLabel(doc: DealDoc | null) {
  if (!doc) return "";
  if (isOverdueDocument(doc)) return "เกินกำหนด — รับเงินแล้วใช่ไหม →";
  if (doc.doc_type === "quotation" && doc.status === "draft")
    return "ส่งใบเสนอราคาแล้วหรือยัง →";
  if (doc.doc_type === "quotation" && doc.status === "sent")
    return "ลูกค้าตกลงแล้วใช่ไหม →";
  if (doc.doc_type === "invoice" && doc.status === "draft")
    return "ส่งใบแจ้งหนี้แล้วหรือยัง →";
  if (doc.doc_type === "invoice" && doc.status === "sent")
    return "ถึงเวลาวางบิลแล้ว →";
  if (doc.doc_type === "delivery_note" && doc.status === "draft")
    return "ส่งของแล้วหรือยัง →";
  if (doc.doc_type === "delivery_note" && doc.status === "sent")
    return "ออกใบแจ้งหนี้จากใบส่งของ →";
  if (doc.doc_type === "tax_invoice_receipt") return "";
  if (doc.doc_type === "billing_note" && doc.status === "draft")
    return "ส่งใบวางบิลแล้วหรือยัง →";
  if (doc.doc_type === "billing_note" && doc.status === "sent")
    return "รับเงินแล้วใช่ไหม →";
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
    return {
      stageLabel: label,
      stageHint: "ฉบับร่าง",
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
  const latestDocument = getLatestRelevantDocument(deal.documents || []);
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

  const latestNote =
    (deal.notes || []).length > 0 ? deal.notes![0].content : "";
  const latestNoteRole =
    (deal.notes || []).length > 0 ? deal.notes![0].author_role : "";

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
    amount: amountDocument?.total_amount || amountDocument?.net_payable || 0,
    netPayable: amountDocument?.net_payable || amountDocument?.total_amount || 0,
    status: isOverdue ? "overdue" : latestDocument?.status || "draft",
    stageLabel: stageInfo.stageLabel,
    stageHint: stageInfo.stageHint,
    queue: stageInfo.queue,
    createdAt: deal.created_at,
    updatedAt: latestDocument?.updated_at || deal.updated_at,
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
  };
}

export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
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
          id, doc_type, doc_number, status,
          total_amount, net_payable, due_date, paid_at,
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
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_active", true)
        .then(({ count }) => {
          if (count === 0) {
            setShowNudge("customer");
            setNudgesLoaded(true);
          } else if (!dismissed.items) {
            supabase
              .from("items")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("is_active", true)
              .then(({ count: itemCount }) => {
                if ((itemCount || 0) < 3) {
                  const accountAge = clientProfile.created_at
                    ? Date.now() - new Date(clientProfile.created_at).getTime()
                    : 0;
                  if (accountAge > 24 * 60 * 60 * 1000) {
                    setShowNudge("items");
                  }
                }
                setNudgesLoaded(true);
              });
          } else {
            setNudgesLoaded(true);
          }
        });
      return;
    }

    if (!dismissed.items) {
      supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_active", true)
        .then(({ count: itemCount }) => {
          if ((itemCount || 0) < 3) {
            const accountAge = clientProfile.created_at
              ? Date.now() - new Date(clientProfile.created_at).getTime()
              : 0;
            if (accountAge > 24 * 60 * 60 * 1000) {
              setShowNudge("items");
            }
          }
          setNudgesLoaded(true);
        });
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
          acc.waitInvoiceAmount += deal.amount || 0;
        }
        if (deal.queue === "wait_collect") {
          acc.waitCollectCount += 1;
          acc.waitCollectAmount += deal.amount || 0;
        }
        if (deal.queue === "overdue") {
          acc.overdueCount += 1;
          acc.overdueAmount += deal.amount || 0;
        }
        if (deal.queue === "partial") {
          acc.partialCount += 1;
          acc.partialAmount += deal.amount || 0;
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
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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

  type DealSortKey = "customerName" | "stageLabel" | "createdAt" | "amount" | "netPayable";
  const dealSort = useTableSort<DashboardDeal, DealSortKey>(activeDeals, {
    key: "createdAt",
    dir: "desc",
  });

  const recentlyDone = useMemo(
    () =>
      deals
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
        .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || "")),
    [deals, searchQuery],
  );

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
    },
    {
      label: "รอเก็บเงิน",
      value: summary.waitCollectAmount,
      count: summary.waitCollectCount,
      alert: false,
      preset: "wait_collect",
      hint: "ใบวางบิล",
    },
    {
      label: "เกินกำหนด",
      value: summary.overdueAmount,
      count: summary.overdueCount,
      alert: summary.overdueCount > 0,
      preset: "overdue",
      hint: "ควรติดตาม",
    },
    {
      label: "ชำระบางส่วน",
      value: summary.partialAmount,
      count: summary.partialCount,
      alert: summary.partialCount > 0,
      preset: "partial",
      hint: "เก็บเพิ่มให้ครบ",
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
      <AppShell title="หน้างานขาย">
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
    <AppShell title="หน้างานขาย">
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
                              ฿ {formatCurrency(deal.amount)}
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
                            label="รับสุทธิ"
                            align="right"
                            active={dealSort.sort.key === "netPayable"}
                            dir={dealSort.sort.dir}
                            onClick={() => dealSort.handleSort("netPayable")}
                            className={`${TABLE.thSortable} hidden md:table-cell min-w-[110px]`}
                          />
                          <SortableTh
                            label="จำนวนเงิน"
                            align="right"
                            active={dealSort.sort.key === "amount"}
                            dir={dealSort.sort.dir}
                            onClick={() => dealSort.handleSort("amount")}
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
                          return (
                            <tr
                              key={deal.dealId}
                              onClick={() => navigate(`/deals/${deal.dealId}`)}
                              className={TABLE.tbodyTr}
                            >
                               <td className="px-3 py-2 whitespace-nowrap text-[11px] text-[#111827] tabular-nums">
                                 {deal.dealNumber || "-"}
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
                                <span className="whitespace-nowrap tabular-nums">
                                  {formatBuddhistDateTime(deal.createdAt)}
                                </span>
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
                                  ฿ {formatCurrency(deal.netPayable)}
                                </span>
                              </td>
                               <td className="px-3 py-2 text-right">
                                <span className="text-[#111827] min-w-[100px] inline-block text-right">
                                  ฿ {formatCurrency(deal.amount)}
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

            {recentlyDone.length > 0 && (
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
                        onClick={() => navigate("/documents")}
                      >
                        ดูทั้งหมด
                      </button>
                    </div>
                  </div>
                  <div className="bg-white border border-card-border rounded-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className={TABLE.table}>
                        <thead>
                          <tr className={TABLE.theadTr}>
                            <th className={`${TABLE.thStatic} w-[80px]`}>เลขที่ดีล</th>
                            <th className={TABLE.thStatic}>ลูกค้า</th>
                            <th className={`${TABLE.thStatic} w-[90px]`}>เลขที่ใบเสร็จ</th>
                            <th className={TABLE.thStatic}>วันที่ชำระ</th>
                            <th className={TABLE.thStatic}>จำนวนเงิน</th>
                            <th className={`${TABLE.thStatic} hidden sm:table-cell`}>รายการ</th>
                            <th className={`${TABLE.thStatic} w-[60px]`}>สถานะ</th>
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
                                 <td className="px-3 py-2 whitespace-nowrap text-[11px] font-mono tabular-nums text-primary">
                                  {deal.dealNumber || "-"}
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
                                <td className="px-3 py-2 text-[#475467] max-w-[130px] truncate font-mono text-[11px]">
                                  {deal.completedDocNumber || <span className="text-[#AAAAAA] italic font-sans">—</span>}
                                </td>
                                <td className={`${TABLE.tdDimmed} whitespace-nowrap tabular-nums`}>
                                  {deal.paidAt ? formatBuddhistDate(deal.paidAt) : "-"}
                                </td>
                                 <td className="px-3 py-2 text-right whitespace-nowrap text-[#111827]">
                                  ฿ {formatCurrency(deal.amount)}
                                </td>
                                <td className={`${TABLE.tdDimmed} hidden sm:table-cell max-w-[200px]`}>
                                  <span className="truncate block">
                                    {deal.itemNames?.length
                                      ? deal.itemNames.slice(0, 2).join(", ")
                                      : deal.itemSummary || "-"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className="text-green-500 text-sm font-bold">✓</span>
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
                              className={`min-w-[28px] px-1.5 py-1 text-xs rounded ${
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
