import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { AppShell } from "../../components/layout/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
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
  updatedAt: string;
  dueDate: string | null;
  paidAt: string | null;
  latestDocument: DealDoc | null;
  documents: DealDoc[];
  isDone: boolean;
  isOverdue: boolean;
  nextActionLabel: string;
};

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
  if (doc.doc_type === "tax_invoice_receipt") return "";
  if (doc.doc_type === "billing_note" && doc.status === "draft") return "ส่งใบวางบิลแล้วหรือยัง →";
  if (doc.doc_type === "billing_note" && doc.status === "sent") return "รับเงินแล้วใช่ไหม →";
  return "";
}

function deriveDashboardDeal(deal: DealWithRelations): DashboardDeal {
  const latestDocument = getLatestRelevantDocument(deal.documents || []);
  const amountDocument = getAmountDocument(deal.documents || []);
  const paidAt = getCompletedAt(deal.documents || []);
  const isDone = isDealDone(deal.documents || []);
  const isOverdue = isOverdueDocument(latestDocument);

  return {
    dealId: deal.id,
    customerName: deal.customers?.name || "ลูกค้า",
    itemSummary: deal.title || latestDocument?.doc_number || "",
    itemNames: getItemPreview(deal.documents || []),
    amount: amountDocument?.net_payable || 0,
    status: isOverdue ? "overdue" : latestDocument?.status || "draft",
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
  const [pullDistance, setPullDistance] = useState(0);
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
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    return deals.reduce(
      (acc, deal) => {
        const billingNotes = deal.documents.filter((doc) => doc.doc_type === "billing_note");
        billingNotes.forEach((doc) => {
          if (doc.status === "sent" || isOverdueDocument(doc)) acc.unpaid += doc.net_payable || 0;
          if (isOverdueDocument(doc)) acc.overdue += doc.net_payable || 0;
          if (doc.status === "paid" && doc.paid_at) {
            const paidAt = new Date(doc.paid_at);
            if (paidAt.getMonth() === month && paidAt.getFullYear() === year) {
              acc.receivedThisMonth += doc.net_payable || 0;
            }
          }
        });

        const combinedDocs = deal.documents.filter((doc) => doc.doc_type === "tax_invoice_receipt");
        combinedDocs.forEach((doc) => {
          if ((doc.status === "issued" || doc.status === "paid") && doc.paid_at) {
            const paidAt = new Date(doc.paid_at);
            if (paidAt.getMonth() === month && paidAt.getFullYear() === year) {
              acc.receivedThisMonth += doc.net_payable || doc.total_amount || 0;
            }
          }
        });
        return acc;
      },
      { unpaid: 0, receivedThisMonth: 0, overdue: 0 }
    );
  }, [deals]);

  const activeDeals = useMemo(
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

  const recentlyDone = useMemo(
    () =>
      deals
        .filter((deal) => deal.isDone)
        .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""))
        .slice(0, 5),
    [deals]
  );

  const greetingName = clientProfile?.contact_name ? clientProfile.contact_name.trim() : "";
  const actionCount = activeDeals.length;

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
    { label: "ยังไม่ชำระ", value: summary.unpaid, alert: false, preset: "unpaid" },
    { label: "รับแล้วเดือนนี้", value: summary.receivedThisMonth, alert: false, preset: "paid_this_month" },
    { label: "เกินกำหนด", value: summary.overdue, alert: summary.overdue > 0, preset: "overdue" },
  ] as const;

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
            {Array.from({ length: 3 }).map((_, index) => (
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
            <SummaryRow items={summaryCards.map((card) => ({ ...card }))} onCardTap={(preset) => navigate(`/documents?preset=${preset}`)} />

            <section>
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <div className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">รายการที่ต้องดำเนินการ</div>
                <div className="ml-auto text-[11px] text-gray-400">{activeDeals.length} รายการ</div>
              </div>

              {activeDeals.length === 0 ? (
                <EmptyState title="ยังไม่มีรายการ" description="กด “สร้างใหม่” เพื่อเริ่มต้น" />
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
                      nextActionLabel={deal.nextActionLabel}
                      isOverdue={deal.isOverdue}
                      onTap={() => navigate(`/deals/${deal.dealId}`)}
                    />
                  ))}
                </div>
              )}
            </section>

            {recentlyDone.length > 0 && (
              <>
                <div className="border-t border-card-border pt-1" />
                <section className="opacity-60">
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
          navigate(`/deals/new?type=${type}`);
        }}
      />
    </AppShell>
  );
}
