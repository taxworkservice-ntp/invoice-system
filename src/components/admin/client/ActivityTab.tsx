import { useState } from "react";
import { formatCurrency } from "../../../lib/format";
import {
  formatBuddhistDate,
  formatBuddhistDateTimeParts,
  relativeTimeThai,
} from "../../../lib/dates";
import {
  filterActivities,
  groupActivitiesByDay,
  monitorRoleLabel,
  type MonitorActivity,
  type MonitorDealLike,
} from "../../../lib/monitoring";
import { Card } from "../../ui/Card";
import { StatusBadge } from "../../ui/StatusBadge";
import { SectionHeader } from "./shared";

interface ActivityTabProps {
  activities: MonitorActivity[];
  activityDeals: MonitorDealLike[];
}

export function ActivityTab({ activities, activityDeals }: ActivityTabProps) {
  const [activityFilter, setActivityFilter] = useState<"all" | "money" | "overdue" | "voided">(
    "all",
  );

  const activityDealMap = new Map<string, MonitorDealLike>();
  for (const deal of activityDeals) activityDealMap.set(deal.id, deal);
  const visibleActivities = filterActivities(activities, activityFilter, "all");
  const activityDayGroups = groupActivitiesByDay(visibleActivities, (iso) =>
    formatBuddhistDate(iso),
  );

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>กิจกรรมล่าสุดของทีม ({activities.length} รายการ)</SectionHeader>
        <Card>
          {activities.length === 0 ? (
            <p className="text-body text-ink-400 text-center py-4">ยังไม่มีกิจกรรม</p>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {(
                  [
                    { value: "all", label: "ทั้งหมด" },
                    { value: "money", label: "เงินเข้า" },
                    { value: "overdue", label: "เกินกำหนด" },
                    { value: "voided", label: "ยกเลิก" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={activityFilter === item.value}
                    onClick={() => setActivityFilter(item.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-label font-medium transition-colors ${activityFilter === item.value ? "border-primary bg-blue-50 text-primary" : "border-card-border bg-white text-ink-500 hover:bg-paper-field"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {visibleActivities.length === 0 ? (
                <p className="text-body text-ink-400 text-center py-4">ไม่มีกิจกรรมในมุมนี้</p>
              ) : (
                activityDayGroups.map((group) => (
                  <div key={group.key} className="mt-3 first:mt-1">
                    <div className="mb-1 text-label font-semibold text-ink-500">{group.label}</div>
                    <div className="divide-y divide-line-faint">
                      {group.items.map((activity) => {
                        const deal = activityDealMap.get(activity.deal_id);
                        const amount = activity.metadata?.amount;
                        const voidReason = (activity.metadata?.voided_reason || "").trim();
                        const { time } = formatBuddhistDateTimeParts(activity.created_at);
                        return (
                          <div key={activity.id} className="py-2">
                            <div className="text-body font-medium text-ink-900">
                              {activity.description}
                            </div>
                            <div className="mt-0.5 text-label text-ink-500">
                              {deal?.customer_name || deal?.title || deal?.deal_number || "งานขาย"}
                            </div>
                            {activity.metadata?.status === "voided" && voidReason ? (
                              <div className="mt-0.5 text-label text-danger-text">
                                เหตุผล: {voidReason}
                              </div>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {activity.metadata?.doc_type ? (
                                <StatusBadge
                                  docType={
                                    activity.metadata.doc_type as Parameters<
                                      typeof StatusBadge
                                    >[0]["docType"]
                                  }
                                />
                              ) : null}
                              <span className="text-label tabular-nums text-ink-600">
                                {activity.metadata?.doc_number || ""}
                              </span>
                              <StatusBadge
                                tone={activity.actor_role === "owner" ? "primary" : "gray"}
                                label={`${activity.actor_name} · ${monitorRoleLabel(activity.actor_role)}`}
                              />
                              <span className="ml-auto text-label tabular-nums text-ink-400">
                                {time} · {relativeTimeThai(activity.created_at)}
                              </span>
                              {typeof amount === "number" ? (
                                <span className="text-body tabular-nums text-ink-900">
                                  ฿{formatCurrency(amount)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
