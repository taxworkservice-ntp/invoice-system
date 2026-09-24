import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SkeletonTable, Skeleton } from "../../../components/ui/Skeleton";
import { Input, Select } from "../../../components/ui/Input";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { SummaryRow } from "../../../components/home/SummaryRow";
import { TABLE } from "../../../lib/tableStyles";
import { supabase } from "../../../lib/supabase";
import { useAuth, useWorkspaceRole } from "../../../hooks/useAuth";
import { formatCurrency } from "../../../lib/format";
import {
  formatBuddhistDate,
  formatBuddhistDateTimeParts,
  relativeTimeThai,
} from "../../../lib/dates";
import {
  countMonitorExceptions,
  filterActivities,
  getStaleDeals,
  groupActivitiesByDay,
  monitorRoleLabel,
  staleAgeDays,
  type MonitorActivity,
  type MonitorDealLike,
  type MonitorDocLike,
  type MonitorFilter,
} from "../../../lib/monitoring";

const FILTERS: { value: MonitorFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "money", label: "เงินเข้า" },
  { value: "overdue", label: "เกินกำหนด" },
  { value: "voided", label: "ยกเลิก" },
  { value: "stale", label: "งานค้าง" },
];

const EMPTY_COPY: Record<MonitorFilter, { title: string; description: string }> = {
  all: {
    title: "ยังไม่มีความเคลื่อนไหว",
    description: "กิจกรรมทั้งหมดในงานขายจะแสดงที่นี่เมื่อทีมเริ่มออกเอกสาร",
  },
  money: {
    title: "ยังไม่มีเงินเข้า",
    description: "ใบเสร็จที่ยืนยันแล้วจะแสดงที่นี่ — ถือว่าเป็นสัญญาณที่ดี",
  },
  overdue: {
    title: "ไม่มีเอกสารเกินกำหนด",
    description: "ดีแล้ว — ไม่มีงานที่ต้องตามเก็บเงินในตอนนี้",
  },
  voided: {
    title: "ไม่มีการยกเลิก",
    description: "ดีแล้ว — ไม่มีเอกสารถูกยกเลิกในช่วงนี้",
  },
  stale: {
    title: "ไม่มีงานค้าง",
    description: "ดีแล้ว — ทุกงานขายมีการเคลื่อนไหวใน 7 วันที่ผ่านมา",
  },
};

function displayActorName(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed || trimmed === "ผู้ใช้งาน") return "ผู้ใช้งาน";
  const at = trimmed.indexOf("@");
  return at > 0 ? trimmed.slice(0, at) : trimmed;
}

export default function MonitoringPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { workspaceRole } = useWorkspaceRole();
  const userId = profile?.id;
  const isOwner = workspaceRole === "owner";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<MonitorActivity[]>([]);
  const [deals, setDeals] = useState<MonitorDealLike[]>([]);
  const [docs, setDocs] = useState<MonitorDocLike[]>([]);
  const [filter, setFilter] = useState<MonitorFilter>("all");
  const [actorRole, setActorRole] = useState("all");
  const [query, setQuery] = useState("");
  const [feedLimit, setFeedLimit] = useState(100);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchMonitoring = useCallback(
    async (limit: number, append: boolean) => {
      if (!userId) return;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      const { data: dealRows, error: dealError } = await supabase
        .from("deals")
        .select("id, deal_number, title, updated_at, customers(name)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (dealError) {
        setError(dealError.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const dealList: MonitorDealLike[] = (dealRows || []).map((row) => ({
        id: row.id,
        deal_number: row.deal_number,
        title: row.title,
        customer_name: Array.isArray(row.customers)
          ? (row.customers[0]?.name ?? null)
          : ((row.customers as { name?: string } | null)?.name ?? null),
        updated_at: row.updated_at,
      }));
      setDeals(dealList);

      const { data: docRows } = await supabase
        .from("documents")
        .select(
          "id, deal_id, doc_type, doc_number, status, total_amount, net_payable, amount_received, due_date, updated_at, created_at",
        )
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(500);
      setDocs((docRows || []) as MonitorDocLike[]);

      const dealIds = dealList.map((deal) => deal.id);
      if (dealIds.length === 0) {
        setActivities([]);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const { data: activityRows, error: activityError } = await supabase
        .from("deal_activities")
        .select(
          "id, deal_id, document_id, actor_name, actor_role, event_type, description, metadata, created_at",
        )
        .in("deal_id", dealIds)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (activityError) {
        setError(activityError.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      setActivities((activityRows || []) as MonitorActivity[]);
      setLoading(false);
      setLoadingMore(false);
    },
    [userId],
  );

  useEffect(() => {
    fetchMonitoring(100, false);
  }, [fetchMonitoring]);

  const dealMap = useMemo(() => {
    const map = new Map<string, MonitorDealLike>();
    for (const deal of deals) map.set(deal.id, deal);
    return map;
  }, [deals]);

  const latestDocMap = useMemo(() => {
    const map = new Map<string, MonitorDocLike>();
    for (const doc of docs) {
      if (!doc.deal_id) continue;
      const current = map.get(doc.deal_id);
      if (!current || (doc.updated_at || "") > (current.updated_at || "")) {
        map.set(doc.deal_id, doc);
      }
    }
    return map;
  }, [docs]);

  const staleDeals = useMemo(() => getStaleDeals(deals), [deals]);
  const counts = useMemo(() => countMonitorExceptions(docs, deals), [docs, deals]);

  const matchesQuery = useCallback(
    (activity: MonitorActivity): boolean => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const deal = dealMap.get(activity.deal_id);
      return (
        (activity.description || "").toLowerCase().includes(q) ||
        (activity.actor_name || "").toLowerCase().includes(q) ||
        (activity.metadata?.doc_number || "").toLowerCase().includes(q) ||
        (deal?.customer_name || "").toLowerCase().includes(q) ||
        (deal?.deal_number || "").toLowerCase().includes(q)
      );
    },
    [query, dealMap],
  );

  const visible = useMemo(
    () => filterActivities(activities, filter, actorRole).filter(matchesQuery),
    [activities, filter, actorRole, matchesQuery],
  );

  const dayGroups = useMemo(
    () => groupActivitiesByDay(visible, (iso) => formatBuddhistDate(iso)),
    [visible],
  );

  const visibleStaleDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staleDeals;
    return staleDeals.filter(
      (deal) =>
        (deal.customer_name || "").toLowerCase().includes(q) ||
        (deal.deal_number || "").toLowerCase().includes(q) ||
        (deal.title || "").toLowerCase().includes(q),
    );
  }, [staleDeals, query]);

  const hasActiveFilters = filter !== "all" || actorRole !== "all" || query.trim() !== "";

  function clearFilters() {
    setFilter("all");
    setActorRole("all");
    setQuery("");
  }

  function openDeal(dealId: string) {
    navigate(`/deals/${dealId}`);
  }

  function handleRowKeyDown(event: React.KeyboardEvent, dealId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDeal(dealId);
    }
  }

  function renderActivityRow(activity: MonitorActivity) {
    const deal = dealMap.get(activity.deal_id);
    const amount = activity.metadata?.amount;
    const amountBefore = activity.metadata?.amount_before;
    const voidReason = (activity.metadata?.voided_reason || "").trim();
    const { time } = formatBuddhistDateTimeParts(activity.created_at);
    const dealLabel = deal?.customer_name || deal?.title || deal?.deal_number || "งานขาย";
    const showTrail =
      typeof amountBefore === "number" && typeof amount === "number" && amountBefore !== amount;
    return (
      <tr
        key={activity.id}
        className={TABLE.tbodyTr}
        onClick={() => openDeal(activity.deal_id)}
        onKeyDown={(event) => handleRowKeyDown(event, activity.deal_id)}
        tabIndex={0}
      >
        <td className="px-3 py-2 text-ink-400 tabular-nums whitespace-nowrap">{time}</td>
        <td className={TABLE.tdPrimary}>
          <div>{activity.description}</div>
          <div className="mt-0.5 text-label font-normal text-ink-500">{dealLabel}</div>
          {activity.metadata?.status === "voided" && voidReason ? (
            <div className="mt-0.5 text-label font-normal text-danger-text">
              เหตุผล: {voidReason}
            </div>
          ) : null}
        </td>
        <td className={TABLE.tdRegular}>
          <div className="flex flex-wrap items-center gap-1.5">
            {activity.metadata?.doc_type ? (
              <StatusBadge
                docType={activity.metadata.doc_type as Parameters<typeof StatusBadge>[0]["docType"]}
              />
            ) : null}
            <span className="tabular-nums">{activity.metadata?.doc_number || "-"}</span>
          </div>
        </td>
        <td className={TABLE.tdRegular}>
          <div className="whitespace-nowrap">{displayActorName(activity.actor_name)}</div>
          <div className="mt-0.5">
            <StatusBadge
              tone={activity.actor_role === "owner" ? "primary" : "gray"}
              label={monitorRoleLabel(activity.actor_role)}
            />
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-ink-900">
          {typeof amount === "number" ? `฿${formatCurrency(amount)}` : "-"}
          {showTrail ? (
            <div className="text-label font-normal text-ink-400">
              จาก ฿{formatCurrency(amountBefore as number)}
            </div>
          ) : null}
        </td>
      </tr>
    );
  }

  function renderActivityCard(activity: MonitorActivity) {
    const deal = dealMap.get(activity.deal_id);
    const amount = activity.metadata?.amount;
    const amountBefore = activity.metadata?.amount_before;
    const voidReason = (activity.metadata?.voided_reason || "").trim();
    const { time } = formatBuddhistDateTimeParts(activity.created_at);
    const dealLabel = deal?.customer_name || deal?.title || deal?.deal_number || "งานขาย";
    const showTrail =
      typeof amountBefore === "number" && typeof amount === "number" && amountBefore !== amount;
    return (
      <button
        key={activity.id}
        type="button"
        onClick={() => openDeal(activity.deal_id)}
        className="w-full rounded-card border-[0.5px] border-card-border bg-white p-3 text-left transition-colors active:bg-paper-field"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium text-ink-900">{activity.description}</div>
            <div className="mt-0.5 text-label text-ink-500">{dealLabel}</div>
            {activity.metadata?.status === "voided" && voidReason ? (
              <div className="mt-0.5 text-label text-danger-text">เหตุผล: {voidReason}</div>
            ) : null}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {activity.metadata?.doc_type ? (
            <StatusBadge
              docType={activity.metadata.doc_type as Parameters<typeof StatusBadge>[0]["docType"]}
            />
          ) : null}
          <span className="text-label tabular-nums text-ink-600">
            {activity.metadata?.doc_number || ""}
          </span>
          <StatusBadge
            tone={activity.actor_role === "owner" ? "primary" : "gray"}
            label={`${displayActorName(activity.actor_name)} · ${monitorRoleLabel(activity.actor_role)}`}
          />
          <span className="ml-auto text-label tabular-nums text-ink-400">
            {time} · {relativeTimeThai(activity.created_at)}
          </span>
          {typeof amount === "number" ? (
            <span className="text-body tabular-nums text-ink-900">
              {showTrail ? `จาก ฿${formatCurrency(amountBefore as number)} → ` : ""}฿
              {formatCurrency(amount)}
            </span>
          ) : null}
        </div>
      </button>
    );
  }

  if (!isOwner) {
    return (
      <AppShell title="ติดตามงาน">
        <EmptyState
          title="เฉพาะเจ้าของร้าน"
          description="หน้านี้สำหรับเจ้าของร้านเพื่อติดตามงานของทีม"
        />
      </AppShell>
    );
  }

  const emptyCopy = EMPTY_COPY[filter];
  const showingStaleView = filter === "stale";

  return (
    <AppShell title="ติดตามงาน">
      <div className="space-y-4">
        {loading ? (
          <>
            <div className="grid max-w-row grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-card" />
              ))}
            </div>
            <SkeletonTable />
          </>
        ) : error ? (
          <Card className="py-10 text-center">
            <div className="text-body font-medium text-ink-700">โหลดข้อมูลไม่สำเร็จ</div>
            <button
              type="button"
              className="mt-3 text-body text-primary hover:underline"
              onClick={() => {
                setFeedLimit(100);
                fetchMonitoring(100, false);
              }}
            >
              ลองใหม่
            </button>
          </Card>
        ) : (
          <>
            <SummaryRow
              activePreset={filter}
              items={[
                {
                  label: "รับเงินวันนี้",
                  value: counts.collectedToday,
                  hint: "ใบเสร็จที่ยืนยันแล้ว",
                  preset: "money",
                },
                {
                  label: "เกินกำหนดชำระ",
                  value: counts.overdueAmount,
                  count: counts.overdue,
                  alert: counts.overdue > 0,
                  hint: "ต้องตามเก็บเงิน",
                  preset: "overdue",
                },
                {
                  label: "ยกเลิกใน 7 วัน",
                  value: counts.voidedWeek,
                  count: counts.voidedWeek,
                  primary: "count",
                  alert: counts.voidedWeek > 0,
                  hint: "เอกสารที่ถูก void",
                  preset: "voided",
                },
                {
                  label: "งานไม่ขยับ 7 วัน",
                  value: counts.stale,
                  count: counts.stale,
                  primary: "count",
                  alert: counts.stale > 0,
                  hint: "ดีลที่เงียบเกินไป",
                  preset: "stale",
                },
              ]}
              onCardTap={(preset) =>
                setFilter((current) => (current === preset ? "all" : (preset as MonitorFilter)))
              }
            />

            <div
              className="flex gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="ตัวกรองกิจกรรม"
            >
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-label font-medium transition-colors ${filter === item.value ? "border-primary bg-blue-50 text-primary" : "border-card-border bg-white text-ink-500 hover:bg-paper-field"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="ค้นหากิจกรรม"
                placeholder="ค้นหาเลขเอกสาร ชื่อลูกค้า ผู้ทำ..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {!showingStaleView && (
                <Select
                  aria-label="กรองตามบทบาทผู้ทำ"
                  value={actorRole}
                  onChange={(event) => setActorRole(event.target.value)}
                >
                  <option value="all">ทุกคนในทีม</option>
                  <option value="officer">เจ้าหน้าที่</option>
                  <option value="manager">ผู้จัดการ</option>
                  <option value="owner">เจ้าของ</option>
                </Select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="text-label text-ink-500">
                {showingStaleView
                  ? `${visibleStaleDeals.length} งาน`
                  : `${visible.length} รายการ · ${feedLimit} ล่าสุด`}
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-label font-medium text-primary hover:underline"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            {showingStaleView ? (
              visibleStaleDeals.length === 0 ? (
                <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
              ) : (
                <>
                  <div className="space-y-2 sm:hidden">
                    {visibleStaleDeals.map((deal) => {
                      const latest = latestDocMap.get(deal.id);
                      const age = staleAgeDays(deal.updated_at);
                      return (
                        <button
                          key={deal.id}
                          type="button"
                          onClick={() => openDeal(deal.id)}
                          className="w-full rounded-card border-[0.5px] border-card-border bg-white p-3 text-left transition-colors active:bg-paper-field"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-body font-medium text-ink-900">
                                {deal.customer_name || deal.title || deal.deal_number || "งานขาย"}
                              </div>
                              <div className="mt-0.5 text-label tabular-nums text-ink-500">
                                {deal.deal_number || ""} · ไม่ขยับ {age} วัน
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                          </div>
                          {latest && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <StatusBadge
                                docType={
                                  latest.doc_type as Parameters<typeof StatusBadge>[0]["docType"]
                                }
                              />
                              <span className="text-label tabular-nums text-ink-600">
                                {latest.doc_number || ""}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className={`${TABLE.cardWrapper} hidden sm:block`}>
                    <div className={TABLE.scrollBody}>
                      <table className={`${TABLE.table} min-w-[640px]`}>
                        <thead>
                          <tr className={TABLE.theadTr}>
                            <th className={TABLE.thStatic}>งานขาย / ลูกค้า</th>
                            <th className={TABLE.thStatic}>เอกสารล่าสุด</th>
                            <th className={TABLE.thStaticRight}>ไม่ขยับมา</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleStaleDeals.map((deal) => {
                            const latest = latestDocMap.get(deal.id);
                            const age = staleAgeDays(deal.updated_at);
                            return (
                              <tr
                                key={deal.id}
                                className={TABLE.tbodyTr}
                                onClick={() => openDeal(deal.id)}
                                onKeyDown={(event) => handleRowKeyDown(event, deal.id)}
                                tabIndex={0}
                              >
                                <td className={TABLE.tdPrimary}>
                                  <div>
                                    {deal.customer_name ||
                                      deal.title ||
                                      deal.deal_number ||
                                      "งานขาย"}
                                  </div>
                                  <div className="mt-0.5 text-label font-normal tabular-nums text-ink-500">
                                    {deal.deal_number || ""}
                                  </div>
                                </td>
                                <td className={TABLE.tdRegular}>
                                  {latest ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <StatusBadge
                                        docType={
                                          latest.doc_type as Parameters<
                                            typeof StatusBadge
                                          >[0]["docType"]
                                        }
                                      />
                                      <span className="tabular-nums">
                                        {latest.doc_number || "-"}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-ink-400">ยังไม่มีเอกสาร</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-ink-900">
                                  {age} วัน
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )
            ) : visible.length === 0 ? (
              <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
            ) : (
              <>
                <div className="space-y-4 sm:hidden">
                  {dayGroups.map((group) => (
                    <section key={group.key}>
                      <div className="px-1 mb-2 text-label font-semibold text-ink-500">
                        {group.label}
                      </div>
                      <div className="space-y-2">{group.items.map(renderActivityCard)}</div>
                    </section>
                  ))}
                </div>
                <div className="hidden sm:block space-y-4">
                  {dayGroups.map((group) => (
                    <section key={group.key}>
                      <div className="px-1 mb-2 text-label font-semibold text-ink-500">
                        {group.label}
                      </div>
                      <div className={TABLE.cardWrapper}>
                        <div className={TABLE.scrollBody}>
                          <table className={`${TABLE.table} min-w-[760px]`}>
                            <thead>
                              <tr className={TABLE.theadTr}>
                                <th className={TABLE.thStatic}>เวลา</th>
                                <th className={TABLE.thStatic}>กิจกรรม</th>
                                <th className={TABLE.thStatic}>เอกสาร</th>
                                <th className={TABLE.thStatic}>ผู้ทำ</th>
                                <th className={TABLE.thStaticRight}>ยอดเงิน</th>
                              </tr>
                            </thead>
                            <tbody>{group.items.map(renderActivityRow)}</tbody>
                          </table>
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
                <div className="text-center">
                  <div className="text-label tabular-nums text-ink-400">
                    แสดง {activities.length} รายการล่าสุด
                  </div>
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => {
                      const next = feedLimit + 100;
                      setFeedLimit(next);
                      fetchMonitoring(next, true);
                    }}
                    className="mt-2 text-body font-medium text-primary hover:underline disabled:text-ink-300 disabled:no-underline"
                  >
                    {loadingMore ? "กำลังโหลด..." : "ดูเพิ่มเติม"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
