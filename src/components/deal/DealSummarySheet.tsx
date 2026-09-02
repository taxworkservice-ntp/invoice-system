import { useMemo } from "react";
import { createPortal } from "react-dom";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { DOC_TYPE_LABELS } from "../../constants";
import { documentTypeLabel } from "../../lib/docLabels";
import { formatCurrency } from "../../lib/format";
import { formatBuddhistDate } from "../../lib/dates";
import type { Document, DealActivity } from "../../types";
import { computeDealFinancialSummary, type DealFinancialSummary } from "../../lib/dealFinancials";

const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  in_billing: "รอวางบิล",
  issued: "ออกแล้ว",
  generated: "ออกใบเสร็จแล้ว",
  paid: "ชำระแล้ว",
  partially_paid: "ชำระบางส่วน",
  converted: "แปลงแล้ว",
  voided: "ยกเลิก",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "เงินสด",
  bank_transfer: "โอนเงิน",
  cheque: "เช็ค",
};

const DOC_ORDER = [
  "quotation", "delivery_note", "invoice",
  "billing_note", "receipt", "credit_note", "debit_note",
];

function sortLedger(docs: Document[]): Document[] {
  return [...docs].sort((a, b) => {
    const orderDiff = DOC_ORDER.indexOf(a.doc_type) - DOC_ORDER.indexOf(b.doc_type);
    if (orderDiff !== 0) return orderDiff;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  dealNumber?: string | null;
  customerName?: string;
  documents: Document[];
  activities: DealActivity[];
}

/**
 * Full-fidelity view of everything that happened on a deal — stage timeline,
 * document ledger (incl. voided), payment ledger and the money reconciliation
 * statement — plus a print-optimized layout via the browser print dialog.
 */
export function DealSummarySheet({
  open,
  onClose,
  dealNumber,
  customerName,
  documents,
  activities,
}: Props) {
  const summary: DealFinancialSummary = useMemo(
    () => computeDealFinancialSummary(documents),
    [documents],
  );

  const ledgerDocs = useMemo(() => sortLedger(documents), [documents]);
  const receipts = useMemo(
    () =>
      sortLedger(
        documents.filter(
          (d) => d.doc_type === "receipt" && !["draft", "voided"].includes(d.status),
        ),
      ),
    [documents],
  );
  // Chronological so the sheet reads like a story; the deal page feed is newest-first.
  const timeline = useMemo(
    () => [...activities].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [activities],
  );

  const timelineByDay = useMemo(() => {
    const groups = new Map<string, DealActivity[]>();
    for (const activity of timeline) {
      const day = new Date(activity.created_at).toLocaleDateString("th-TH", {
        dateStyle: "long",
      });
      const list = groups.get(day) || [];
      list.push(activity);
      groups.set(day, list);
    }
    return [...groups.entries()];
  }, [timeline]);

  return (
    <>
    <Modal open={open} onClose={onClose} title="สรุปงานขาย">
      {/* On-screen content */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-cool-25 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink-900">{customerName}</div>
            {dealNumber && (
              <div className="text-[11px] text-gray-500">รหัสงานขาย DL-{dealNumber.slice(0, 8)}</div>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              document.body.classList.add("deal-summary-print");
              const cleanup = () => {
                document.body.classList.remove("deal-summary-print");
                window.removeEventListener("afterprint", cleanup);
              };
              window.addEventListener("afterprint", cleanup);
              window.print();
              setTimeout(cleanup, 2000);
            }}
          >
            พิมพ์
          </Button>
        </div>

        {/* Stage / activity timeline */}
        <section>
          <SectionTitle>ความเคลื่อนไหวตามลำดับ</SectionTitle>
          {timelineByDay.length === 0 ? (
            <EmptyLine>ยังไม่มีความเคลื่อนไหว</EmptyLine>
          ) : (
            <div className="space-y-3">
              {timelineByDay.map(([day, events]) => (
                <div key={day}>
                  <div className="mb-1 text-[11px] font-semibold text-gray-500">{day}</div>
                  <div className="space-y-2">
                    {events.map((activity) => (
                      <div key={activity.id} className="flex gap-2.5">
                        <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                            <span className="font-medium text-ink-900">{activity.description}</span>
                            <span className="text-[11px] text-gray-400">
                              {new Date(activity.created_at).toLocaleTimeString("th-TH", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                            <span>{activity.actor_name}</span>
                            {activity.metadata?.doc_type && (
                              <span className="rounded-full bg-cool-25 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                                {DOC_TYPE_LABELS[activity.metadata.doc_type as keyof typeof DOC_TYPE_LABELS]?.th ||
                                  activity.metadata.doc_type}
                                {activity.metadata.doc_number ? ` · ${activity.metadata.doc_number}` : ""}
                              </span>
                            )}
                            {typeof activity.metadata?.amount === "number" &&
                              ` · ฿${formatCurrency(activity.metadata.amount)}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Document ledger */}
        <section>
          <SectionTitle>รายการเอกสารทั้งหมด</SectionTitle>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-card-border text-left text-[11px] text-gray-400">
                  <th className="py-1.5 pr-2 font-medium">เลขที่</th>
                  <th className="py-1.5 pr-2 font-medium">ประเภท</th>
                  <th className="py-1.5 pr-2 font-medium">วันที่</th>
                  <th className="py-1.5 pr-2 text-right font-medium">ยอดรวม</th>
                  <th className="py-1.5 pr-2 text-right font-medium">VAT</th>
                  <th className="py-1.5 pr-2 text-right font-medium">WHT</th>
                  <th className="py-1.5 pr-2 text-right font-medium">สุทธิ</th>
                  <th className="py-1.5 text-right font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {ledgerDocs.map((doc) => {
                  const isVoided = doc.status === "voided";
                  return (
                    <tr key={doc.id} className={isVoided ? "text-gray-300 line-through decoration-gray-300/60" : "text-ink-900"}>
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{doc.doc_number || "—"}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{documentTypeLabel(doc.doc_type, doc.vat_registered).thai}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{formatBuddhistDate(doc.issue_date)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(doc.total_amount || 0)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{doc.vat_amount ? formatCurrency(doc.vat_amount) : "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{doc.wht_amount ? formatCurrency(doc.wht_amount) : "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(doc.net_payable || 0)}</td>
                      <td className={`py-1.5 text-right whitespace-nowrap ${isVoided ? "" : "text-gray-500"}`}>
                        {STATUS_LABELS[doc.status] || doc.status}
                      </td>
                    </tr>
                  );
                })}
                {ledgerDocs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-3 text-center text-gray-400">ยังไม่มีเอกสาร</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Payment ledger */}
        {receipts.length > 0 && (
          <section>
            <SectionTitle>การรับชำระ</SectionTitle>
            <div className="divide-y divide-stone-100 rounded-lg border border-card-border">
              {receipts.map((receipt) => (
                <div key={receipt.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink-900">
                      {receipt.doc_number} · ฿{formatCurrency(receipt.amount_received || 0)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {[
                        receipt.payment_method
                          ? PAYMENT_METHOD_LABELS[receipt.payment_method] || receipt.payment_method
                          : null,
                        receipt.paid_at
                          ? new Date(receipt.paid_at).toLocaleDateString("th-TH", { dateStyle: "medium" })
                          : null,
                        receipt.wht_certificate_no ? `ใบหักภาษี ณ ที่จ่าย ${receipt.wht_certificate_no}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reconciliation */}
        <section>
          <SectionTitle>สรุปยอด</SectionTitle>
          <div className="rounded-lg border border-card-border p-3">
            <StatementRows summary={summary} />
          </div>
        </section>
      </div>
    </Modal>

    {/* Print layout — portaled to <body> so no modal ancestor clips it */}
    {open &&
      createPortal(
        <div className="deal-summary-print-area hidden print:block text-black">
          <div className="mb-3 flex items-baseline justify-between border-b border-black/20 pb-2">
            <div>
              <div className="text-lg font-bold">สรุปงานขาย</div>
              <div className="text-xs">{customerName}</div>
            </div>
            <div className="text-right text-xs">
              <div>{dealNumber ? `DL ${dealNumber}` : ""}</div>
              <div>พิมพ์ {new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}</div>
            </div>
          </div>
          <SummaryPrintTables
            ledgerDocs={ledgerDocs}
            receipts={receipts}
            summary={summary}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
      {children}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-cool-25 px-3 py-4 text-center text-xs text-gray-400">{children}</div>;
}

function StatementRows({ summary }: { summary: DealFinancialSummary }) {
  const vatRatePct =
    summary.subtotalBeforeVat > 0
      ? Math.round((summary.vatAmount / summary.subtotalBeforeVat) * 100)
      : null;
  const rows: { label: string; value: number; prefix?: string; tone?: string; strong?: boolean }[] = [
    { label: "ยอดรวม (รวม VAT)", value: summary.grossAmount },
    ...(summary.vatAmount > 0
      ? [
          { label: "ยอดก่อน VAT", value: summary.subtotalBeforeVat, tone: "muted" },
          { label: `VAT ${vatRatePct}%`, value: summary.vatAmount, tone: "muted" },
        ]
      : []),
    ...(summary.expectedWhtAmount > 0
      ? [{ label: "หัก ณ ที่จ่ายตามเอกสาร", value: summary.expectedWhtAmount, prefix: "−", tone: "amber" }]
      : []),
    { label: "ยอดสุทธิตามเอกสาร", value: summary.netPayable, strong: true },
    ...(summary.debitTotal > 0
      ? [
          { label: "ใบเพิ่มหนี้ (รวม VAT)", value: summary.debitTotal, prefix: "+", tone: "amber" },
          ...(summary.debitWht > 0
             ? [{ label: "WHT ที่เกี่ยวข้องกับใบเพิ่มหนี้", value: summary.debitWht, prefix: "−", tone: "" }]
            : []),
        ]
      : []),
    ...(summary.creditTotal > 0
      ? [
          { label: "ใบลดหนี้ (รวม VAT)", value: summary.creditTotal, prefix: "−", tone: "red" },
          ...(summary.creditWht > 0
             ? [{ label: "WHT ที่เกี่ยวข้องกับใบลดหนี้", value: summary.creditWht, prefix: "+", tone: "" }]
            : []),
        ]
      : []),
    ...(summary.creditTotal > 0 || summary.debitTotal > 0
       ? [{ label: "ยอดคงเหลือหลังปรับปรุง", value: Math.max(0, summary.afterAdjustment), strong: true }]
      : []),
    { label: "รับแล้ว", value: summary.amountReceived },
    ...(summary.hasCollectionDoc
      ? [
          summary.outstanding > 0
            ? { label: "ค้างรับ", value: summary.outstanding, tone: "red", strong: true }
            : { label: "ค้างรับ", value: 0 },
        ]
      : [{ label: "ยังไม่มีเอกสารเรียกเก็บเงิน", value: 0 }]),
    ...(summary.customerCredit > 0
       ? [{ label: "เครดิตเงินสดคงเหลือ", value: summary.customerCredit, tone: "blue", strong: true }]
      : []),
  ];
  return (
    <div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 py-1">
          <span className={`text-xs ${row.strong ? "font-medium text-gray-600" : "text-gray-500"}`}>
            {row.label}
          </span>
          <span
            className={`shrink-0 tabular-nums ${
              row.tone === "red"
                ? "text-red-700"
                : row.tone === "green"
                  ? "text-green-700"
                  : row.tone === "amber"
                    ? "text-amber-700"
                    : row.tone === "blue"
                      ? "text-blue-700"
                      : row.tone === "muted"
                        ? "text-gray-400"
                        : "text-ink-900"
            } ${row.strong ? "text-sm font-semibold" : "text-[13px] font-medium"}`}
          >
            {row.prefix}฿{formatCurrency(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SummaryPrintTables({
  ledgerDocs,
  receipts,
  summary,
}: {
  ledgerDocs: Document[];
  receipts: Document[];
  summary: DealFinancialSummary;
}) {
  return (
    <div className="space-y-4 text-[11px]">
      <div>
        <div className="mb-1 font-bold">รายการเอกสารทั้งหมด</div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black/30 text-left">
              <th className="py-1 pr-2">เลขที่</th>
              <th className="py-1 pr-2">ประเภท</th>
              <th className="py-1 pr-2">วันที่</th>
              <th className="py-1 pr-2 text-right">ยอดรวม</th>
              <th className="py-1 pr-2 text-right">VAT</th>
              <th className="py-1 pr-2 text-right">WHT</th>
              <th className="py-1 pr-2 text-right">สุทธิ</th>
              <th className="py-1 text-right">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {ledgerDocs.map((doc) => (
              <tr key={doc.id} className="border-b border-black/10">
                <td className="py-1 pr-2">{doc.doc_number || "—"}</td>
                <td className="py-1 pr-2">{documentTypeLabel(doc.doc_type, doc.vat_registered).thai}</td>
                <td className="py-1 pr-2">{formatBuddhistDate(doc.issue_date)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatCurrency(doc.total_amount || 0)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{doc.vat_amount ? formatCurrency(doc.vat_amount) : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{doc.wht_amount ? formatCurrency(doc.wht_amount) : "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatCurrency(doc.net_payable || 0)}</td>
                <td className="py-1 text-right">{STATUS_LABELS[doc.status] || doc.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {receipts.length > 0 && (
        <div>
          <div className="mb-1 font-bold">การรับชำระ</div>
          <table className="w-full border-collapse">
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="border-b border-black/10">
                  <td className="py-1 pr-2">{receipt.doc_number}</td>
                  <td className="py-1 pr-2">
                    {receipt.payment_method
                      ? PAYMENT_METHOD_LABELS[receipt.payment_method] || receipt.payment_method
                      : "—"}
                  </td>
                  <td className="py-1 pr-2">
                    {receipt.paid_at
                      ? new Date(receipt.paid_at).toLocaleDateString("th-TH", { dateStyle: "medium" })
                      : "—"}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    ฿{formatCurrency(receipt.amount_received || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="mb-1 font-bold">สรุปยอด</div>
        <StatementRows summary={summary} />
      </div>
    </div>
  );
}
