import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { AppShell } from "../../components/layout/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ViewToggle } from "../../components/ui/ViewToggle";
import type { ViewMode } from "../../components/ui/ViewToggle";
import { HomeTopBar } from "../../components/home/HomeTopBar";
import { SummaryRow } from "../../components/home/SummaryRow";
import { DealCard } from "../../components/home/DealCard";
import { DoneDealCard } from "../../components/home/DoneDealCard";
import { NewDealSheet } from "../../components/home/NewDealSheet";
import { supabase } from "../../lib/supabase";
import { formatCurrency } from "../../lib/format";
import { formatBuddhistDate } from "../../lib/dates";
import { HomeNudgeBanner } from "../../components/home/HomeNudgeBanner";
import { DOC_TYPE_LABELS } from "../../constants";
import type { Deal, Document, Customer, DocumentLineItem } from "../../types";

type DealDoc = Pick<
  Document,
  "id" | "doc_type" | "doc_number" | "status" | "total_amount" | "net_payable" | "due_date" | "created_at" | "updated_at" | "paid_at" | "line_items"
>;

type DealWithRelations = Deal & {
  customers: Pick<Customer, "id" | "name"> | null;
  documents: DealDoc[];
};

type DashboardDeal = {
  dealId: string;
  customerName: string;
  itemSummary: string;
  itemNames: string[];
  amount: number;
  status: Document["status"];
  stageLabel: string;
  workflowHint: string;
  queue: HomeQueue;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  paidAt: string | null;
  latestDocument: DealDoc | null;
  documents: DealDoc[];
  isDone: boolean;
  isOverdue: boolean;
  nextActionLabel: string;
};

type HomeQueue = "wait_send" | "wait_invoice" | "wait_collect" | "overdue" | "progress" | "done";
type HomeFilter = "all" | "wait_send" | "wait_invoice" | "wait_collect" | "overdue";

function firstNameFromCompanyName(name: string | null | undefined) {
  if (!name) return "";
  return name.trim() || "";
}

function isResolvedStatus(status: Document["status"]) {
  return ["paid", "converted", "generated", "voided", "issued"].includes(status);
}

function isOverdueDocument(doc: DealDoc | null) {
  if (!doc) return false;
  if (doc.status === "overdue") return true;
  if (doc.doc_type !== "billing_note" || !doc.due_date) return false;
  return new Date(doc.due_date) < new Date(new Date().toISOString().slice(0, 10)) && doc.status !== "paid";
}

function getLatestRelevantDocument(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  if (nonVoided.length === 0) return null;
  const unresolved = nonVoided.filter((doc) => !isResolvedStatus(doc.status));
  const pool = unresolved.length > 0 ? unresolved : nonVoided;
  const sorted = [...pool].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return sorted[sorted.length - 1] || null;
}

function getAmountDocument(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  return (
    [...nonVoided].reverse().find((doc) => doc.doc_type === "tax_invoice_receipt") ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "billing_note") ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "invoice") ||
    [...nonVoided].reverse().find((doc) => doc.doc_type === "quotation") ||
    null
  );
}

function getItemPreview(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const sourceDoc =
    [...nonVoided].reverse().find((doc) => (doc.line_items || []).length > 0) ||
    nonVoided.find((doc) => (doc.line_items || []).length > 0) ||
    null;

  return (sourceDoc?.line_items || []).map((item) => item.item_name.trim()).filter(Boolean);
}

function getCompletedAt(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");

  const receipt = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "receipt" && (doc.status === "generated" || doc.status === "paid" || doc.status === "issued"));
  if (receipt) return receipt.paid_at || receipt.updated_at;

  const combined = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "tax_invoice_receipt" && (doc.status === "issued" || doc.status === "paid"));
  if (combined) return combined.paid_at || combined.updated_at;

  const paidBilling = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "billing_note" && doc.status === "paid");
  if (paidBilling) return paidBilling.paid_at || paidBilling.updated_at;

  const paidInvoice = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "invoice" && doc.status === "paid");
  if (paidInvoice) return paidInvoice.paid_at || paidInvoice.updated_at;

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
  if (isOverdueDocument(doc)) return "⚠ เกินกำหนด — รับเงินแล้วใช่ไหม →";
  if (doc.doc_type === "quotation" && doc.status === "draft") return "ส่งใบเสนอราคาแล้วหรือยัง →";
  if (doc.doc_type === "quotation" && doc.status === "sent") return "ลูกค้าตกลงแล้วใช่ไหม →";
  if (doc.doc_type === "invoice" && doc.status === "draft") return "ส่งใบแจ้งหนี้แล้วหรือยัง →";
  if (doc.doc_type === "invoice" && doc.status === "sent") return "ถึงเวลาวางบิลแล้ว →";
  if (doc.doc_type === "delivery_note" && doc.status === "draft") return "ส่งของแล้วหรือยัง →";
  if (doc.doc_type === "delivery_note" && doc.status === "sent") return "ออกใบแจ้งหนี้จากใบส่งของ →";
  if (doc.doc_type === "tax_invoice_receipt") return "";
  if (doc.doc_type === "billing_note" && doc.status === "draft") return "ส่งใบวางบิลแล้วหรือยัง →";
  if (doc.doc_type === "billing_note" && doc.status === "sent") return "รับเงินแล้วใช่ไหม →";
  return "";
}

function getDnWaitingForInvoice(documents: DealDoc[]) {
  return documents.filter((doc) => doc.doc_type === "delivery_note" && doc.status === "sent");
}

function getBillingWaitingForPayment(documents: DealDoc[]) {
  return documents.filter((doc) => doc.doc_type === "billing_note" && (doc.status === "sent" || doc.status === "overdue"));
}

function getQuotationDeliveryProgress(documents: DealDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const quote = [...nonVoided].reverse().find((doc) => doc.doc_type === "quotation");
  if (!quote?.line_items?.length) return null;

  const deliveredByQuoteLine = new Map<string, number>();
  for (const doc of nonVoided) {
    if (doc.doc_type !== "delivery_note" || (doc.status !== "sent" && doc.status !== "converted")) continue;
    for (const line of doc.line_items || []) {
      if (line.source_document_id !== quote.id || !line.source_line_item_id) continue;
      deliveredByQuoteLine.set(line.source_line_item_id, (deliveredByQuoteLine.get(line.source_line_item_id) || 0) + line.quantity);
    }
  }

  const quoted = quote.line_items.reduce((sum, line) => sum + line.quantity, 0);
  const delivered = quote.line_items.reduce((sum, line) => sum + (deliveredByQuoteLine.get(line.id) || 0), 0);
  if (delivered <= 0) return null;
  return { delivered, quoted };
}

function getStageInfo(documents: DealDoc[], latestDocument: DealDoc | null, isDone: boolean, isOverdue: boolean) {
  const dnWaiting = getDnWaitingForInvoice(documents);
  const billingWaiting = getBillingWaitingForPayment(documents);
  const quoteProgress = getQuotationDeliveryProgress(documents);

  if (isDone) return { stageLabel: "เสร็จแล้ว", workflowHint: "ปิดงานแล้ว", queue: "done" as HomeQueue };
  if (isOverdue) return { stageLabel: "เกินกำหนด", workflowHint: "ต้องติดตาม", queue: "overdue" as HomeQueue };
  if (dnWaiting.length > 0) {
    return {
      stageLabel: "รอออกใบแจ้งหนี้",
      workflowHint: `ส่งของแล้ว ${dnWaiting.length} ใบ`,
      queue: "wait_invoice" as HomeQueue,
    };
  }
  if (billingWaiting.length > 0) return { stageLabel: "รอรับเงิน", workflowHint: "ใบวางบิลส่งแล้ว", queue: "wait_collect" as HomeQueue };
  if (latestDocument?.status === "draft") {
    const label = latestDocument.doc_type === "quotation"
      ? "รอส่งใบเสนอราคา"
      : latestDocument.doc_type === "delivery_note"
        ? "รอส่งของ"
        : latestDocument.doc_type === "invoice"
          ? "รอส่งใบแจ้งหนี้"
          : "รอส่งเอกสาร";
    return { stageLabel: label, workflowHint: "ฉบับร่าง", queue: "wait_send" as HomeQueue };
  }
  if (quoteProgress) {
    return {
      stageLabel: "กำลังส่งของ",
      workflowHint: `ส่งแล้ว ${quoteProgress.delivered.toLocaleString("th-TH")} / ${quoteProgress.quoted.toLocaleString("th-TH")}`,
      queue: "progress" as HomeQueue,
    };
  }
  if (latestDocument?.doc_type === "quotation") return { stageLabel: "ใบเสนอราคา", workflowHint: "รอลูกค้าตอบ", queue: "progress" as HomeQueue };
  if (latestDocument?.doc_type === "invoice") return { stageLabel: "รอวางบิล", workflowHint: "ใบแจ้งหนี้ส่งแล้ว", queue: "progress" as HomeQueue };
  if (latestDocument?.doc_type === "delivery_note") return { stageLabel: "ใบส่งของ", workflowHint: "รอดำเนินการต่อ", queue: "progress" as HomeQueue };
  return { stageLabel: "กำลังดำเนินการ", workflowHint: latestDocument?.doc_number || "", queue: "progress" as HomeQueue };
}

function deriveDashboardDeal(deal: DealWithRelations): DashboardDeal {
  const latestDocument = getLatestRelevantDocument(deal.documents || []);
  const amountDocument = getAmountDocument(deal.documents || []);
  const paidAt = getCompletedAt(deal.documents || []);
  const isDone = isDealDone(deal.documents || []);
  const isOverdue = isOverdueDocument(latestDocument);
  const stageInfo = getStageInfo(deal.documents || [], latestDocument, isDone, isOverdue);

  return {
    dealId: deal.id,
    customerName: deal.customers?.name || "ลูกค้า",
    itemSummary: deal.title || latestDocument?.doc_number || "",
    itemNames: getItemPreview(deal.documents || []),
    amount: amountDocument?.total_amount || amountDocument?.net_payable || 0,
    status: isOverdue ? "overdue" : latestDocument?.status || "draft",
    stageLabel: stageInfo.stageLabel,
    workflowHint: stageInfo.workflowHint,
    queue: stageInfo.queue,
    createdAt: deal.created_at,
    updatedAt: latestDocument?.updated_at || deal.updated_at,
    dueDate: latestDocument?.due_date || null,
    paidAt,
    latestDocument,
    documents: deal.documents || [],
    isDone,
    isOverdue,
    nextActionLabel: getNextActionLabel(latestDocument),
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem("homeViewMode");
    return stored === "list" || stored === "grid" || stored === "table" ? stored : "list";
  });
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    window.localStorage.setItem("homeViewMode", viewMode);
  }, [viewMode]);
  const [showNudge, setShowNudge] = useState<"profile" | "customer" | "items" | null>(null);
  const [nudgesLoaded, setNudgesLoaded] = useState(false);

  const touchStartY = useRef<number | null>(null);
  const pulling = useRef(false);

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    if (!userId) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("deals")
      .select(`
        *,
        customers(id, name),
        documents(
          id, doc_type, doc_number, status,
          total_amount, net_payable, due_date, paid_at,
          created_at, updated_at
        )
      `)
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
    const docIds = dealsWithRelations.flatMap((deal) => (deal.documents || []).map((doc) => doc.id)).filter(Boolean);
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
  }, [userId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (!userId || !clientProfile || loading || nudgesLoaded) return;

    const dismissed = JSON.parse(localStorage.getItem("nudges_dismissed") || "{}") as Record<string, boolean>;

    if (clientProfile.company_name_th && !dismissed.profile) {
      const missingProfile = !clientProfile.address || (clientProfile.vat_registered && !clientProfile.tax_id);
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
    const dismissed = JSON.parse(localStorage.getItem("nudges_dismissed") || "{}") as Record<string, boolean>;
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
        if (deal.queue === "wait_send") acc.waitSendCount += 1;
        return acc;
      },
      {
        waitInvoiceCount: 0,
        waitInvoiceAmount: 0,
        waitCollectCount: 0,
        waitCollectAmount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        waitSendCount: 0,
      }
    );
  }, [deals]);

  const activeDealsAll = useMemo(
    () =>
      deals
        .filter((deal) => !deal.isDone)
        .sort((a, b) => {
          if (a.isOverdue && !b.isOverdue) return -1;
          if (!a.isOverdue && b.isOverdue) return 1;
          if (a.isOverdue && b.isOverdue) return (a.dueDate || "").localeCompare(b.dueDate || "");
          return b.updatedAt.localeCompare(a.updatedAt);
        }),
    [deals]
  );

  const activeDeals = useMemo(
    () =>
      activeDealsAll.filter((deal) => {
        if (homeFilter === "all") return true;
        return deal.queue === homeFilter;
      }),
    [activeDealsAll, homeFilter]
  );

  const recentlyDone = useMemo(
    () =>
      deals
        .filter((deal) => deal.isDone)
        .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""))
        .slice(0, 5),
    [deals]
  );

  const greetingName = clientProfile?.contact_name ? clientProfile.contact_name.trim() : "";
  const actionCount = activeDealsAll.length;

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY > 0 || refreshing) return;
    touchStartY.current = event.touches[0].clientY;
    pulling.current = true;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!pulling.current || touchStartY.current === null) return;
    const distance = event.touches[0].clientY - touchStartY.current;
    if (distance > 0 && window.scrollY === 0) setPullDistance(Math.min(distance, 80));
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= 60) await fetchDashboard(true);
    setPullDistance(0);
    touchStartY.current = null;
    pulling.current = false;
  };

  const summaryCards = [
    { label: "รอออกบิล", value: summary.waitInvoiceAmount, count: summary.waitInvoiceCount, alert: false, preset: "wait_invoice", hint: "ใบส่งของ" },
    { label: "รอเก็บเงิน", value: summary.waitCollectAmount, count: summary.waitCollectCount, alert: false, preset: "wait_collect", hint: "ใบวางบิล" },
    { label: "เกินกำหนด", value: summary.overdueAmount, count: summary.overdueCount, alert: summary.overdueCount > 0, preset: "overdue", hint: "ควรติดตาม" },
  ] as const;

  const quickFilters: { label: string; value: HomeFilter; count: number }[] = [
    { label: "ทั้งหมด", value: "all", count: activeDealsAll.length },
    { label: "รอส่ง", value: "wait_send", count: summary.waitSendCount },
    { label: "รอออกบิล", value: "wait_invoice", count: summary.waitInvoiceCount },
    { label: "รอเก็บเงิน", value: "wait_collect", count: summary.waitCollectCount },
    { label: "เกินกำหนด", value: "overdue", count: summary.overdueCount },
  ];

  if (loading) {
    return (
      <AppShell title="หน้าหลัก">
        <div className="space-y-4">
          <div className="space-y-1 px-1">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-48 rounded-md" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-card border border-card-border bg-white p-3 shadow-sm">
                <Skeleton className="mb-2 h-5 w-16 rounded-md" />
                <Skeleton className="h-3 w-14 rounded-md" />
              </div>
            ))}
          </div>
        <div className="space-y-3">
            {Array.from({ length: viewMode === "grid" ? 6 : viewMode === "table" ? 5 : 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl bg-[#F1EFE8]" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="หน้าหลัก">
      <div className="space-y-4" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className="overflow-hidden transition-all" style={{ height: pullDistance > 0 || refreshing ? Math.max(pullDistance, refreshing ? 40 : 0) : 0 }}>
          <div className="flex h-10 items-center justify-center text-gray-500">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </div>
        </div>

        <HomeTopBar
          greeting={greetingName ? `สวัสดี, ${greetingName} 👋` : "สวัสดี 👋"}
          subtitle={actionCount === 0 ? "ทุกรายการเรียบร้อย ✓" : `วันนี้มี ${actionCount} รายการรอดำเนินการ`}
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
            <div className="text-sm font-medium text-gray-700">โหลดข้อมูลไม่สำเร็จ</div>
            <button className="mt-3 text-sm text-primary hover:underline" onClick={() => fetchDashboard()}>
              ลองใหม่
            </button>
          </Card>
        ) : deals.length === 0 ? (
          <EmptyState
            title="ยินดีต้อนรับ!"
            description="เริ่มต้นด้วยการสร้างดีลแรกของคุณ"
            action={<Button onClick={() => setNewSheetOpen(true)}>สร้างดีลแรก</Button>}
          />
        ) : (
          <>
            <SummaryRow
              items={summaryCards.map((card) => ({ ...card }))}
              onCardTap={(preset) => setHomeFilter(preset as HomeFilter)}
            />

            <section>
              <div className="mb-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <div className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">
                    {homeFilter === "all" ? "ต้องทำวันนี้ / กำลังดำเนินการ" : quickFilters.find((filter) => filter.value === homeFilter)?.label}
                  </div>
                  <div className="ml-auto text-[11px] text-gray-400">{activeDeals.length} รายการ</div>
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
                      <span className="ml-1 text-[10px] opacity-70">{filter.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {activeDeals.length === 0 ? (
                <EmptyState title="ยังไม่มีรายการในคิวนี้" description="ลองเปลี่ยนตัวกรอง หรือกด “สร้างใหม่” เพื่อเริ่มงาน" />
              ) : viewMode === "grid" ? (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {activeDeals.map((deal) => (
                    <Card
                      key={deal.dealId}
                      className={`rounded-xl border-[0.5px] p-3.5 shadow-sm hover:shadow-md cursor-pointer flex flex-col gap-2.5 min-h-[130px] ${deal.isOverdue ? "border-l-4 border-l-[#C0392B]" : ""}`}
                      onClick={() => navigate(`/deals/${deal.dealId}`)}
                    >
                      <div className="text-[13px] font-semibold text-[#1A1A18] line-clamp-2 leading-tight">
                        {deal.customerName}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex rounded-md bg-[#EEF6FF] px-2 py-0.5 text-[10px] font-medium text-[#0C447C]">
                          {deal.stageLabel}
                        </span>
                        <span className={`inline-flex items-center justify-center w-2 h-2 rounded-full ${
                          deal.isOverdue ? "bg-[#C0392B]" : deal.status === "sent" ? "bg-primary" : "bg-[#888780]"
                        }`} />
                      </div>
                      <div className="mt-auto flex items-end justify-between pt-2 border-t border-[#F0EFE9]">
                        <span className="text-[11px] text-[#888780] truncate max-w-[60%]">{deal.nextActionLabel}</span>
                        <span className="text-[13px] font-semibold text-[#1A1A18]">฿ {formatCurrency(deal.amount)}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : viewMode === "table" ? (
                <div className="bg-white border border-card-border rounded-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-[#F7F6F3] border-b border-card-border text-left text-[11px] uppercase tracking-wide text-[#888780]">
                          <th className="px-3 py-2 font-semibold">ลูกค้า</th>
                          <th className="px-3 py-2 font-semibold">สถานะ</th>
                          <th className="px-3 py-2 font-semibold hidden lg:table-cell">สร้างเมื่อ</th>
                          <th className="px-3 py-2 font-semibold hidden sm:table-cell">รายการ</th>
                          <th className="px-3 py-2 font-semibold text-right">จำนวนเงิน</th>
                          <th className="px-3 py-2 font-semibold hidden md:table-cell">ขั้นตอนถัดไป</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDeals.map((deal) => (
                          <tr
                            key={deal.dealId}
                            onClick={() => navigate(`/deals/${deal.dealId}`)}
                            className="border-b border-[#F0EFE9] last:border-0 hover:bg-[#FAFAF7] cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2">
                              <span className="font-semibold text-[#1A1A18] truncate block max-w-[180px]">{deal.customerName}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {deal.isOverdue && <span className="w-2 h-2 rounded-full bg-[#C0392B] shrink-0" />}
                                <span className="text-[12px] text-[#444441]">{deal.stageLabel}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 hidden lg:table-cell">
                              <span className="text-[11px] text-[#888780] tabular-nums">{formatBuddhistDate(deal.createdAt)}</span>
                            </td>
                            <td className="px-3 py-2 hidden sm:table-cell">
                              <span className="text-[12px] text-[#888780] truncate block max-w-[200px]">
                                {deal.itemNames?.length ? deal.itemNames.slice(0, 2).join(", ") : deal.itemSummary}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-medium text-[#1A1A18]">฿ {formatCurrency(deal.amount)}</span>
                            </td>
                            <td className="px-3 py-2 hidden md:table-cell">
                              <span className={`text-[11px] ${deal.isOverdue ? "text-[#C0392B] font-medium" : "text-[#888780]"}`}>
                                {deal.nextActionLabel}
                              </span>
                            </td>
                          </tr>
                        ))}
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
                      itemSummary={deal.itemSummary || deal.latestDocument?.doc_number || DOC_TYPE_LABELS[deal.latestDocument?.doc_type || "quotation"].th}
                      itemNames={deal.itemNames}
                      amountText={`฿ ${formatCurrency(deal.amount)}`}
                      status={deal.status}
                      stageLabel={deal.stageLabel}
                      workflowHint={deal.workflowHint}
                      nextActionLabel={deal.nextActionLabel}
                      isOverdue={deal.isOverdue}
                      createdAt={deal.createdAt}
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
                    <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-400">เสร็จสิ้นล่าสุด</div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-gray-400">{recentlyDone.length} รายการ</span>
                      <button
                        className="text-[11px] text-gray-400 hover:text-gray-600"
                        onClick={() => navigate("/documents?preset=paid")}
                      >
                        ดูทั้งหมด
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {recentlyDone.map((deal) => (
                      <DoneDealCard
                        key={deal.dealId}
                        customerName={deal.customerName}
                        itemSummary={deal.itemSummary || deal.latestDocument?.doc_number || "ชำระเรียบร้อย"}
                        itemNames={deal.itemNames}
                        amountText={`฿ ${formatCurrency(deal.amount)}`}
                        paidAtText={deal.paidAt ? formatBuddhistDate(deal.paidAt) : undefined}
                        onTap={() => navigate(`/deals/${deal.dealId}`)}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>

      <NewDealSheet
        open={newSheetOpen}
        onClose={() => setNewSheetOpen(false)}
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
