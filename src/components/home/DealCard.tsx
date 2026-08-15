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
  queue: string;
  onTap: () => void;
}

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  wait_send: { bg: "bg-[#FFF8EB]", text: "text-[#8B6914]" },
  wait_invoice: { bg: "bg-[#F5F0FF]", text: "text-[#5B21B6]" },
  wait_collect: { bg: "bg-[#ECFDF5]", text: "text-[#065F46]" },
  overdue: { bg: "bg-[#FEF2F2]", text: "text-[#C0392B]" },
  progress: { bg: "bg-[#EEF6FF]", text: "text-[#0C447C]" },
  done: { bg: "bg-gray-100", text: "text-gray-500" },
};

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "bg-amber-100 text-amber-800" },
  manager: { label: "Manager", color: "bg-blue-100 text-blue-800" },
  officer: { label: "Officer", color: "bg-slate-100 text-slate-600" },
};

const ITEM_CHIP_CLASS = "bg-[#F7F6F3] text-[#62605A]";

export function DealCard({
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
      className={`rounded-xl border-[0.5px] py-3 px-4 shadow-sm hover:shadow-md ${isOverdue ? "border-l-4 border-l-[#C0392B]" : ""}`}
      onClick={onTap}
    >
      <div className="flex items-start gap-2.5">
        <CustomerAvatar customer={avatarCustomer} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-col gap-0.5">
              <div className="text-sm font-semibold text-[#1A1A18] truncate">
                {customerName}
              </div>
              {customerCode && (
                <span className="text-[10px] text-primary font-mono font-medium">{customerCode}</span>
              )}
            </div>
            <div className="text-sm font-semibold text-[#1A1A18] shrink-0">{amountText}</div>
          </div>
          <div className="mt-0.5 flex items-end justify-between gap-3">
            <div className="text-[10px] text-[#888780] tabular-nums">
              สร้าง {formatBuddhistDateTime(createdAt)}
            </div>
            <div className="text-right shrink-0">
              {stageHint && <div className="text-[10px] leading-4 text-gray-400">{stageHint}</div>}
              <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}>
                {stageLabel}
              </span>
              {docTypeLabel && (
                <div className="mt-1 text-[10px] leading-4 text-gray-400">{docTypeLabel}</div>
              )}
            </div>
          </div>
          <div className="mt-1">
              {previewItems.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {previewItems.map((itemName, index) => (
                    <span
                      key={`${customerName}-item-${index}-${itemName}`}
                      className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs ${ITEM_CHIP_CLASS}`}
                    >
                      <span className="truncate">{itemName}</span>
                    </span>
                  ))}
                  {remainingItems > 0 && (
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ITEM_CHIP_CLASS} opacity-80`}>
                      +{remainingItems} more
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 truncate">{itemSummary}</div>
              )}
          </div>
        </div>
      </div>
      {nextActionLabel ? (
        <div className={`mt-2 border-t border-[#F0EFE9] pt-1.5 text-xs font-medium ${isOverdue ? "text-[#C0392B]" : "text-primary"}`}>
          {nextActionLabel}
        </div>
      ) : null}
      {internalNote ? (
        <div className="mt-2 border-t border-[#F0EFE9] pt-1.5 text-xs leading-4 text-[#777166]">
          {roleBadge && (
            <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium mr-1 ${roleBadge.color}`}>
              {roleBadge.label}
            </span>
          )}
          {internalNote}
        </div>
      ) : null}
    </Card>
  );
}
