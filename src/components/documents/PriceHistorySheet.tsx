import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Skeleton } from "../ui/Skeleton";
import { fetchPriceHistory, priceHistoryDocTypeLabel, type PriceHistoryRow } from "../../lib/priceHistory";
import { useDocDate } from "../YearEraProvider";

interface PriceHistorySheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  itemId: string;
  itemName: string;
  customerId: string | null;
  customerName: string | null;
  excludeDocumentId?: string | null;
  /** The line's current price — shown in the confirm before replacing it. */
  currentPrice?: number | null;
  onApply: (unitPrice: number) => void;
}

function formatPrice(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  currentPrice = null,
  onApply,
}: PriceHistorySheetProps) {
  const docDate = useDocDate();
  const [filter, setFilter] = useState<"customer" | "all">(customerId ? "customer" : "all");
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pendingPrice, setPendingPrice] = useState<number | null>(null);

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
            className={`flex-1 rounded-control border px-3 py-2 text-label transition-colors ${ filter === "customer" ? "border-primary bg-primary-soft font-medium text-primary-deep" : "border-card-border bg-white text-ink-600" }`}
          >
            ลูกค้านี้{customerName ? ` · ${customerName}` : ""}
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex-1 rounded-control border px-3 py-2 text-label transition-colors ${ filter === "all" ? "border-primary bg-primary-soft font-medium text-primary-deep" : "border-card-border bg-white text-ink-600" }`}
          >
            ลูกค้าทั้งหมด
          </button>
        </div>
      )}

      {loading ? (
        <div className="divide-y divide-line-faint" role="status" aria-label="กำลังโหลดประวัติราคา">
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
        <div className="rounded-control border border-red-200 bg-red-50 px-3 py-2.5 text-label text-red-700">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-control border border-dashed border-card-border bg-paper-tint px-3 py-6 text-center text-label text-ink-300">
          {filter === "customer" ? (
            <>
              <div>ลูกค้านี้ยังไม่เคยซื้อรายการนี้</div>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="mt-2 text-label font-medium text-primary hover:underline"
              >
                ดูราคาลูกค้าอื่นแทน
              </button>
            </>
          ) : (
            "ยังไม่มีประวัติการขายรายการนี้"
          )}
        </div>
      ) : (
        <div className="divide-y divide-line-faint">
          {rows.map((row, idx) => (
            <div
              key={`${row.createdAt}-${idx}`}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-draft-bg px-1.5 py-0.5 text-label font-medium text-ink-600">
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
                        className="truncate text-label font-medium text-primary hover:underline"
                      >
                        {row.docNumber} ↗
                      </a>
                    ) : (
                      <span className="truncate text-label text-ink-500">{row.docNumber}</span>
                    ))}
                </div>
                <div className="mt-0.5 truncate text-label text-ink-500">
                  {docDate.date(row.issueDate || row.createdAt)}
                  {row.customerName ? ` · ${row.customerName}` : ""}
                  {` · ${row.quantity.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${row.unit}`}
                  {row.discountPercent > 0 ? ` · ลด ${row.discountPercent}%` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-body font-semibold tabular-nums text-ink-900">
                  ฿{formatPrice(row.unitPrice)}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingPrice(row.unitPrice)}
                  className="mt-1 rounded-control bg-primary px-2.5 py-1 text-label font-medium text-white transition-colors hover:bg-primary-deep"
                >
                  ใช้ราคานี้
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-label text-ink-400">แตะ “ใช้ราคานี้” เพื่อใส่ราคาในบรรทัดนี้ · แตะเลขที่เอกสารเพื่อเปิดงานขายในแท็บใหม่</p>

      <Modal
        open={pendingPrice != null}
        onClose={() => setPendingPrice(null)}
        title="ใช้ราคานี้?"
      >
        <p className="text-body text-ink-700">฿{formatPrice(pendingPrice ?? 0)} · {itemName}</p>
        {currentPrice != null && Math.abs(currentPrice - (pendingPrice ?? 0)) >= 0.005 ? (
          <p className="mt-2 text-label leading-5 text-ink-500">
            ระบบจะแทนที่ราคาปัจจุบัน ฿{formatPrice(currentPrice)} ของรายการนี้
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingPrice(null)}
            className="rounded-control border border-card-border bg-white px-3 py-1.5 text-label font-medium text-ink-600 transition-colors hover:border-line-strong"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => {
              if (pendingPrice != null) onApply(pendingPrice);
              setPendingPrice(null);
            }}
            className="rounded-control bg-primary px-3 py-1.5 text-label font-medium text-white transition-colors hover:bg-primary-deep"
          >
            ใช้ราคานี้
          </button>
        </div>
      </Modal>
    </Modal>
  );
}
