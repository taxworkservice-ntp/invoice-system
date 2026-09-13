import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Skeleton } from "../ui/Skeleton";
import { fetchPriceHistory, priceHistoryDocTypeLabel, type PriceHistoryRow } from "../../lib/priceHistory";
import { formatBuddhistDate } from "../../lib/dates";

interface PriceHistorySheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  itemId: string;
  itemName: string;
  customerId: string | null;
  customerName: string | null;
  excludeDocumentId?: string | null;
  onApply: (unitPrice: number) => void;
}

function formatPrice(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(row: PriceHistoryRow): string {
  try {
    return formatBuddhistDate(row.issueDate || row.createdAt);
  } catch {
    return (row.issueDate || row.createdAt || "").slice(0, 10);
  }
}

export function PriceHistorySheet({
  open,
  onClose,
  userId,
  itemId,
  itemName,
  customerId,
  customerName,
  excludeDocumentId,
  onApply,
}: PriceHistorySheetProps) {
  const [filter, setFilter] = useState<"customer" | "all">(customerId ? "customer" : "all");
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset to customer scope whenever a new item/customer is opened.
  useEffect(() => {
    if (open) setFilter(customerId ? "customer" : "all");
  }, [open, itemId, customerId]);

  useEffect(() => {
    if (!open || !userId || !itemId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchPriceHistory(userId, itemId, {
      customerId: filter === "customer" ? customerId : null,
      excludeDocumentId,
    })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "โหลดประวัติไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, itemId, filter, customerId, excludeDocumentId]);

  return (
    <Modal open={open} onClose={onClose} title={`ประวัติราคาขาย · ${itemName}`}>
      {customerId && (
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("customer")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs transition-colors ${
              filter === "customer"
                ? "border-[#378ADD] bg-[#EEF6FF] font-medium text-[#1A56DB]"
                : "border-[#E8E6DF] bg-white text-[#5F5B54]"
            }`}
          >
            ลูกค้านี้{customerName ? ` · ${customerName}` : ""}
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex-1 rounded-lg border px-3 py-2 text-xs transition-colors ${
              filter === "all"
                ? "border-[#378ADD] bg-[#EEF6FF] font-medium text-[#1A56DB]"
                : "border-[#E8E6DF] bg-white text-[#5F5B54]"
            }`}
          >
            ลูกค้าทั้งหมด
          </button>
        </div>
      )}

      {loading ? (
        <div className="divide-y divide-[#F0EEE8]" role="status" aria-label="กำลังโหลดประวัติราคา">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-between gap-3 py-3" aria-hidden="true">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E8E6DF] bg-[#FBFAF7] px-3 py-6 text-center text-xs text-[#888780]">
          {filter === "customer" ? (
            <>
              <div>ลูกค้านี้ยังไม่เคยซื้อรายการนี้</div>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="mt-2 text-xs font-medium text-[#378ADD] hover:underline"
              >
                ดูราคาลูกค้าอื่นแทน
              </button>
            </>
          ) : (
            "ยังไม่มีประวัติการขายรายการนี้"
          )}
        </div>
      ) : (
        <div className="divide-y divide-[#F0EEE8]">
          {rows.map((row, idx) => (
            <div
              key={`${row.createdAt}-${idx}`}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-[#F1EFE8] px-1.5 py-0.5 text-[10px] font-medium text-[#5F5B54]">
                    {priceHistoryDocTypeLabel(row.docType)}
                  </span>
                  {row.docNumber &&
                    (row.dealId ? (
                      <a
                        href={`/deals/${row.dealId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`เปิดงานขายของ ${row.docNumber} ในแท็บใหม่`}
                        title="เปิดงานขายในแท็บใหม่"
                        className="truncate text-[11px] font-medium text-[#378ADD] hover:underline"
                      >
                        {row.docNumber} ↗
                      </a>
                    ) : (
                      <span className="truncate text-[11px] text-gray-500">{row.docNumber}</span>
                    ))}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-gray-500">
                  {formatDate(row)}
                  {row.customerName ? ` · ${row.customerName}` : ""}
                  {` · ${row.quantity.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${row.unit}`}
                  {row.discountPercent > 0 ? ` · ลด ${row.discountPercent}%` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums text-ink-900">
                  ฿{formatPrice(row.unitPrice)}
                </div>
                <button
                  type="button"
                  onClick={() => onApply(row.unitPrice)}
                  className="mt-1 rounded-lg bg-[#378ADD] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[#2B70B8]"
                >
                  ใช้ราคานี้
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-[11px] text-gray-400">แตะ “ใช้ราคานี้” เพื่อใส่ราคาในบรรทัดนี้ · แตะเลขที่เอกสารเพื่อเปิดงานขายในแท็บใหม่</p>
    </Modal>
  );
}
