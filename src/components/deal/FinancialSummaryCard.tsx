import { Card } from "../ui/Card";
import { formatCurrency } from "../../lib/format";
import type { DealFinancialSummary } from "../../lib/dealFinancials";

function Row({
  label,
  value,
  prefix = "",
  tone = "default",
  strong = false,
}: {
  label: string;
  value: number;
  prefix?: string;
  tone?: "default" | "red" | "green" | "amber" | "blue" | "muted";
  strong?: boolean;
}) {
  const toneClass = {
    default: "text-ink-900",
    red: "text-red-700",
    green: "text-green-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
    muted: "text-gray-500",
  }[tone];
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={`min-w-0 ${strong ? "text-xs font-medium text-gray-600" : "text-xs text-gray-500"}`}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          strong ? "text-sm font-semibold" : "text-[13px] font-medium"
        } ${toneClass}`}
      >
        {prefix}฿{formatCurrency(value)}
      </span>
    </div>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-1 pt-2 first:pt-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        {children}
      </span>
    </div>
  );
}

/**
 * Deal money story as a readable waterfall:
 *   invoice → WHT → net, adjustments → due after adjustment, receipts → remaining/credit.
 * Replaces the old flat KPI grid whose numbers readers could not reconcile.
 */
export function FinancialSummaryCard({
  summary,
  children,
}: {
  summary: DealFinancialSummary;
  /** Optional header-area content (e.g. status badges) rendered top-right. */
  children?: React.ReactNode;
}) {
  const hasAdjustments = summary.creditTotal > 0 || summary.debitTotal > 0;
  const hasCollectionDoc = summary.hasCollectionDoc;
  const vatRatePct =
    summary.subtotalBeforeVat > 0
      ? Math.round((summary.vatAmount / summary.subtotalBeforeVat) * 100)
      : null;
  const fallbackLabel =
    summary.sourceDocType === "delivery_note"
      ? "ใบส่งของ"
      : summary.sourceDocType === "quotation"
        ? "ใบเสนอราคา"
        : "เอกสารอ้างอิง";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">สรุปการเงิน</div>
          <div className="mt-0.5 text-[11px] text-gray-500">
            {summary.receiptCount > 0
              ? `${summary.receiptCount} ใบเสร็จ`
              : "ยังไม่มีใบเสร็จ"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {children}
        </div>
      </div>

      <div className="mt-3 divide-y divide-card-border">
        {/* 1) Per collection document — or the display-amount reference doc */}
        <section className="pb-2">
          <GroupHeader>{hasCollectionDoc ? "ตามใบกำกับภาษี" : `ยอดอ้างอิงจาก${fallbackLabel}`}</GroupHeader>
          <Row label="ยอดรวม (รวม VAT)" value={summary.grossAmount} />
          {summary.vatAmount > 0 && (
            <div className="pb-1 pl-2 text-2xs text-gray-400">
              ก่อน VAT ฿{formatCurrency(summary.subtotalBeforeVat)} · VAT {vatRatePct}% ฿
              {formatCurrency(summary.vatAmount)}
            </div>
          )}
          {summary.expectedWhtAmount > 0 && (
            <Row label="หัก ณ ที่จ่ายตามเอกสาร" value={summary.expectedWhtAmount} prefix="−" tone="amber" />
          )}
          <Row label="ยอดสุทธิตามเอกสาร" value={summary.netPayable} strong />
          {!hasCollectionDoc && (
            <p className="mt-1 rounded-md bg-stone-50 px-2 py-1.5 text-[11px] leading-4 text-gray-500">
              ยังไม่มีใบแจ้งหนี้ / ใบกำกับภาษี — ยอดนี้เป็นยอดอ้างอิงจาก{fallbackLabel} ยังไม่ถือเป็นลูกหนี้
            </p>
          )}
        </section>

        {/* 2) Adjustments — VAT gross effect plus optional confirmed WHT effect */}
        {hasAdjustments && (
          <section className="py-2">
            <GroupHeader>ปรับปรุงยอด</GroupHeader>
            {summary.debitTotal > 0 && (
              <>
                <Row label="ใบเพิ่มหนี้ (รวม VAT)" value={summary.debitTotal} prefix="+" tone="amber" />
                {summary.debitWht > 0 && (
                  <Row label="WHT ที่เกี่ยวข้องกับใบเพิ่มหนี้" value={summary.debitWht} prefix="−" tone="muted" />
                )}
              </>
            )}
            {summary.creditTotal > 0 && (
              <>
                <Row label="ใบลดหนี้ (รวม VAT)" value={summary.creditTotal} prefix="−" tone="red" />
                {summary.creditWht > 0 && (
                  <Row label="WHT ที่เกี่ยวข้องกับใบลดหนี้" value={summary.creditWht} prefix="+" tone="muted" />
                )}
              </>
            )}
            <Row
              label="ยอดคงเหลือหลังปรับปรุง"
              value={Math.max(0, summary.afterAdjustment)}
              strong
            />
          </section>
        )}

        {/* 3) Collection */}
        <section className="py-2">
          <GroupHeader>การรับเงิน</GroupHeader>
          {!hasCollectionDoc && summary.amountReceived === 0 ? (
            <p className="rounded-md bg-stone-50 px-2 py-1.5 text-[11px] leading-4 text-gray-500">
              ยังไม่มีเอกสารเรียกเก็บเงิน — จะเริ่มนับยอดค้างรับหลังออกใบแจ้งหนี้ / ใบกำกับภาษี
            </p>
          ) : (
            <>
              <Row label="รับแล้ว" value={summary.amountReceived} tone="green" />
              {summary.outstanding > 0 ? (
                <Row label="ค้างรับ" value={summary.outstanding} tone="red" strong />
              ) : (
                <Row label="ค้างรับ" value={0} tone="green" />
              )}
              {summary.customerCredit > 0 && (
                <>
                  <Row label="เครดิตเงินสดคงเหลือ" value={summary.customerCredit} tone="blue" strong />
                  <p className="mt-1 rounded-md bg-blue-50 px-2 py-1.5 text-[11px] leading-4 text-blue-800">
                     ลูกค้าชำระเกินหลังปรับปรุง — เครดิตส่วนนี้ใช้หักกลบใบกำกับถัดไปได้
                  </p>
                </>
              )}
              {summary.whtAmount > 0 && (
                <Row label="หัก ณ ที่จ่ายสะสม (ตามใบเสร็จ)" value={summary.whtAmount} tone="muted" />
              )}
            </>
          )}
        </section>
      </div>

      <div className="mt-2 border-t border-card-border pt-2 text-2xs leading-4 text-gray-400">
         ตามเอกสาร = จำนวนที่ระบุในใบแจ้งหนี้ · WHT แสดงเมื่อมีจำนวนที่ระบุไว้ในเอกสาร · สะสม = จำนวนที่เกิดขึ้นจริงจากใบเสร็จ
      </div>
    </Card>
  );
}
