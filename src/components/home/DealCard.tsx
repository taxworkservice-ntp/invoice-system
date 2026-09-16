import { memo } from "react";
import { Card } from "../ui/Card";
import { formatBuddhistDateTime } from "../../lib/dates";
import { CustomerAvatar } from "../customer/CustomerAvatar";
import type { Customer } from "../../types";

interface DealCardProps {
  customerName: string;
  customerCode?: string | null;
  customerAvatar?: Pick<Customer, "name" | "avatar_initials" | "avatar_color"> | null;
  itemSummary: string;
  itemNames?: string[];
  amountText: string;
  stageLabel: string;
  stageHint?: string;
  docTypeLabel?: string;
  nextActionLabel?: string;
  internalNote: string;
  noteAuthorRole: string;
  isOverdue?: boolean;
  createdAt: string;
  updatedAt?: string | null;
  queue: string;
  onTap: () => void;
}

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  wait_send: { bg: "bg-warning-soft", text: "text-warning-text" },
  wait_invoice: { bg: "bg-primary-soft", text: "text-primary-deep" },
  wait_collect: { bg: "bg-success-soft", text: "text-success-text" },
  overdue: { bg: "bg-danger-soft", text: "text-danger" },
  progress: { bg: "bg-primary-soft", text: "text-primary-deep" },
  done: { bg: "bg-ink-50", text: "text-ink-500" },
};

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "bg-amber-100 text-amber-800" },
  manager: { label: "Manager", color: "bg-blue-100 text-blue-800" },
  officer: { label: "Officer", color: "bg-ink-50 text-ink-500" },
};

const ITEM_CHIP_CLASS = "bg-page-bg text-ink-600";

export const DealCard = memo(function DealCard({
  customerName,
  customerCode,
  customerAvatar,
  itemSummary,
  itemNames = [],
  amountText,
  stageLabel,
  stageHint,
  docTypeLabel,
  nextActionLabel,
  internalNote,
  noteAuthorRole,
  isOverdue,
  createdAt,
  updatedAt,
  queue,
  onTap,
}: DealCardProps) {
  const previewItems = itemNames.slice(0, 3);
  const remainingItems = itemNames.length - previewItems.length;
  const colors = STAGE_COLORS[queue] || STAGE_COLORS.progress;
  const roleBadge = ROLE_BADGE[noteAuthorRole];
  const avatarCustomer = customerAvatar ?? { name: customerName, avatar_initials: null, avatar_color: null };

  return (
    <Card
      className={`rounded-card border-[0.5px] py-3 px-4 ${isOverdue ? "border-l-4 border-l-danger" : ""}`}
      onClick={onTap}
    >
      <div className="flex items-start gap-2.5">
        <CustomerAvatar customer={avatarCustomer} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-col gap-0.5">
              <div className="text-body font-semibold text-ink-900 truncate">
                {customerName}
              </div>
              {customerCode && (
                <span className="text-label text-primary font-mono font-medium">{customerCode}</span>
              )}
            </div>
            <div className="text-body font-semibold text-ink-900 shrink-0">{amountText}</div>
          </div>
          <div className="mt-0.5 flex items-end justify-between gap-3">
            <div className="text-label text-ink-300 tabular-nums">
              {updatedAt && updatedAt !== createdAt ? (
                <>แก้ไข {formatBuddhistDateTime(updatedAt)}</>
              ) : (
                <>สร้าง {formatBuddhistDateTime(createdAt)}</>
              )}
            </div>
            <div className="text-right shrink-0">
              {stageHint && <div className="text-label leading-4 text-ink-400">{stageHint}</div>}
              <span className={`inline-flex rounded-control px-2 py-0.5 text-label font-medium ${colors.bg} ${colors.text}`}>
                {stageLabel}
              </span>
              {docTypeLabel && (
                <div className="mt-1 text-label leading-4 text-ink-400">{docTypeLabel}</div>
              )}
            </div>
          </div>
          <div className="mt-1">
              {previewItems.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {previewItems.map((itemName, index) => (
                    <span
                      key={`${customerName}-item-${index}-${itemName}`}
                      className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-label ${ITEM_CHIP_CLASS}`}
                    >
                      <span className="truncate">{itemName}</span>
                    </span>
                  ))}
                  {remainingItems > 0 && (
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-label font-medium ${ITEM_CHIP_CLASS} opacity-80`}>
                      +{remainingItems} more
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-label text-ink-500 truncate">{itemSummary}</div>
              )}
          </div>
        </div>
      </div>
      {nextActionLabel ? (
        <div className={`mt-2 border-t border-line-faint pt-1.5 text-label font-medium ${isOverdue ? "text-danger" : "text-primary"}`}>
          {nextActionLabel}
        </div>
      ) : null}
      {internalNote ? (
        <div className="mt-2 border-t border-line-faint pt-1.5 text-label leading-4 text-ink-500">
          {roleBadge && (
            <span className={`inline-flex rounded px-1.5 py-0.5 text-label font-medium mr-1 ${roleBadge.color}`}>
              {roleBadge.label}
            </span>
          )}
          {internalNote}
        </div>
      ) : null}
    </Card>
  );
});
