import { isDocumentOverdue } from "./dealStatus";

export const MONITOR_STALE_DAYS = 7;
export const MONITOR_FEED_LIMIT = 100;

export type MonitorFilter = "all" | "money" | "overdue" | "voided" | "stale";

export interface MonitorDocLike {
  id: string;
  deal_id: string | null;
  doc_type: string;
  doc_number: string | null;
  status: string;
  total_amount?: number | null;
  net_payable?: number | null;
  amount_received?: number | null;
  due_date?: string | null;
  updated_at?: string;
  created_at?: string;
}

export interface MonitorDealLike {
  id: string;
  deal_number: string | null;
  title: string | null;
  customer_name: string | null;
  updated_at: string;
}

export interface MonitorActivity {
  id: string;
  deal_id: string;
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
    old_status?: string | null;
    amount_before?: number | null;
    voided_reason?: string | null;
  };
  created_at: string;
}

const MONEY_STATUSES = new Set(["paid", "partially_paid", "generated", "issued"]);

export const MONITOR_ROLE_TH: Record<string, string> = {
  owner: "เจ้าของ",
  manager: "ผู้จัดการ",
  officer: "เจ้าหน้าที่",
};

export function monitorRoleLabel(role: string): string {
  return MONITOR_ROLE_TH[role] || role;
}

export function monitorAmountOf(doc: MonitorDocLike): number {
  return doc.amount_received ?? doc.net_payable ?? doc.total_amount ?? 0;
}

export function isStaleDeal(updatedAt: string, now = Date.now()): boolean {
  const age = now - new Date(updatedAt).getTime();
  return age > MONITOR_STALE_DAYS * 24 * 60 * 60 * 1000;
}

export function isMoneyActivity(activity: MonitorActivity): boolean {
  const status = activity.metadata?.status || "";
  if (MONEY_STATUSES.has(status)) return true;
  return activity.event_type === "document_status_changed" && MONEY_STATUSES.has(status);
}

export function isOverdueActivity(activity: MonitorActivity): boolean {
  return (activity.metadata?.status || "") === "overdue";
}

export function isVoidedActivity(activity: MonitorActivity): boolean {
  return (activity.metadata?.status || "") === "voided";
}

export function filterActivities(
  activities: MonitorActivity[],
  filter: MonitorFilter,
  actorRole: string,
): MonitorActivity[] {
  return activities.filter((activity) => {
    if (actorRole !== "all" && activity.actor_role !== actorRole) return false;
    if (filter === "money") return isMoneyActivity(activity);
    if (filter === "overdue") return isOverdueActivity(activity);
    if (filter === "voided") return isVoidedActivity(activity);
    return true;
  });
}

const bangkokDayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });

export function bangkokDayKey(iso: string): string {
  return bangkokDayFormatter.format(new Date(iso));
}

export interface MonitorDayGroup {
  key: string;
  label: string;
  items: MonitorActivity[];
}

export function groupActivitiesByDay(
  activities: MonitorActivity[],
  todayLabel: (iso: string) => string,
): MonitorDayGroup[] {
  const today = bangkokDayKey(new Date().toISOString());
  const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterday = bangkokDayKey(yesterdayDate.toISOString());
  const groups = new Map<string, MonitorActivity[]>();
  for (const activity of activities) {
    const key = bangkokDayKey(activity.created_at);
    const list = groups.get(key) || [];
    list.push(activity);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      label:
        key === today
          ? "วันนี้"
          : key === yesterday
            ? "เมื่อวานนี้"
            : todayLabel(items[0].created_at),
      items,
    }));
}

export function staleAgeDays(updatedAt: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)));
}

export function getStaleDeals(deals: MonitorDealLike[], now = Date.now()): MonitorDealLike[] {
  return deals
    .filter((deal) => isStaleDeal(deal.updated_at, now))
    .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
}

export interface MonitorCounts {
  overdue: number;
  overdueAmount: number;
  voidedWeek: number;
  stale: number;
  collectedToday: number;
}

export function countMonitorExceptions(
  docs: MonitorDocLike[],
  deals: MonitorDealLike[],
  now = new Date(),
): MonitorCounts {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const todayStr = now.toISOString().slice(0, 10);
  let overdue = 0;
  let overdueAmount = 0;
  let voidedWeek = 0;
  let collectedToday = 0;

  for (const doc of docs) {
    if (isDocumentOverdue({ status: doc.status, due_date: doc.due_date })) {
      overdue += 1;
      overdueAmount += monitorAmountOf(doc);
    }
    if (
      doc.status === "voided" &&
      doc.updated_at &&
      new Date(doc.updated_at).getTime() >= weekAgo
    ) {
      voidedWeek += 1;
    }
    if (
      (doc.status === "paid" || doc.status === "partially_paid") &&
      doc.updated_at &&
      doc.updated_at.slice(0, 10) === todayStr
    ) {
      collectedToday += doc.amount_received ?? 0;
    }
  }

  const stale = deals.filter((deal) => isStaleDeal(deal.updated_at, now.getTime())).length;
  return { overdue, overdueAmount, voidedWeek, stale, collectedToday };
}
