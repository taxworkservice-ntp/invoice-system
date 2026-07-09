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
    <Card className="rounded-xl border-[0.5px] border-[#F0EEE8] bg-[#FAFAF8] p-3" onClick={onTap}>
      <div className="flex items-start gap-3">
        <CustomerAvatar customer={avatarCustomer} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5 flex-1">
              <div className="text-xs font-medium text-gray-500 truncate">{customerName}</div>
              {customerCode && <span className="text-[10px] text-gray-400 font-mono">{customerCode}</span>}
            </div>
            <div className="text-xs font-medium text-gray-400 shrink-0">{amountText}</div>
          </div>
          <div className="mt-0.5 text-[11px] text-gray-400 truncate">{itemSummary}</div>
        </div>
      </div>
      {paidAtText && <div className="mt-1.5 text-[10px] text-gray-300">ชำระเมื่อ {paidAtText}</div>}
    </Card>
  );
}
