import { Card } from "../ui/Card";
import { CustomerAvatar } from "../customer/CustomerAvatar";
import type { Customer } from "../../types";

interface DoneDealCardProps {
  customerName: string;
  customerCode?: string | null;
  customerAvatar?: Pick<Customer, "name" | "avatar_initials" | "avatar_color"> | null;
  itemSummary: string;
  itemNames?: string[];
  amountText: string;
  paidAtText?: string;
  onTap: () => void;
}

export function DoneDealCard({ customerName, customerCode, customerAvatar, itemSummary, amountText, paidAtText, onTap }: DoneDealCardProps) {
  const avatarCustomer = customerAvatar ?? { name: customerName, avatar_initials: null, avatar_color: null };
  return (
    <Card className="rounded-card border-[0.5px] border-line-faint bg-paper-field p-3" onClick={onTap}>
      <div className="flex items-start gap-3">
        <CustomerAvatar customer={avatarCustomer} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5 flex-1">
              <div className="text-label font-medium text-ink-500 truncate">{customerName}</div>
              {customerCode && <span className="text-label text-ink-400 font-mono">{customerCode}</span>}
            </div>
            <div className="text-label font-medium text-ink-400 shrink-0">{amountText}</div>
          </div>
          <div className="mt-0.5 text-label text-ink-400 truncate">{itemSummary}</div>
        </div>
      </div>
      {paidAtText && <div className="mt-1.5 text-label text-ink-300">ชำระเมื่อ {paidAtText}</div>}
    </Card>
  );
}
