import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, FileText, Printer } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { useDocDate } from "../YearEraProvider";
import { formatCurrency } from "../../lib/format";
import { getDocumentAmount } from "../../lib/documentAmount";
import { documentTypeLabel } from "../../lib/docLabels";
import { isDocumentOverdue } from "../../lib/dealStatus";
import { PAYMENT_METHOD_LABELS } from "../../constants";
import { getDnVarianceParts, getSourceVarianceLabel, hasDnVariance } from "../../lib/dnVariance";
import type { Document } from "../../types";
import type { BorrowedDoc, DocWithMeta } from "./types";

export interface DealDocumentHistoryProps {
  items: Array<DocWithMeta | BorrowedDoc>;
  voidedDocs: DocWithMeta[];
  docsWithMeta: DocWithMeta[];
  activeDocId?: string;
  onOpenPreview: (doc: Document) => void;
}

export function DealDocumentHistory({
  items,
  voidedDocs,
  docsWithMeta,
  activeDocId,
  onOpenPreview,
}: DealDocumentHistoryProps) {
  const navigate = useNavigate();
  const docDate = useDocDate();
  const [showVoided, setShowVoided] = useState(false);

  const sourceDocById = useMemo(
    () =>
      new Map(
        items
          .filter(
            (d) => d.document.doc_type === "delivery_note" || d.document.doc_type === "quotation",
          )
          .map(
            (d) =>
              [
                d.document.id,
                {
                  number: d.document.doc_number || d.document.id.slice(0, 8),
                  kind: (d.document.doc_type === "quotation" ? "quotation" : "delivery_note") as
                    "quotation" | "delivery_note",
                },
              ] as const,
          ),
      ),
    [items],
  );

  const replacementBySourceId = useMemo(() => {
    const map = new Map<string, Document>();
    for (const item of docsWithMeta) {
      const sourceId = item.document.copied_from_id;
      if (sourceId && item.document.status !== "voided") {
        map.set(sourceId, item.document);
      }
    }
    return map;
  }, [docsWithMeta]);

  return (
    <div>
      <div className="px-1 mb-2 text-label font-semibold text-ink-500">ประวัติเอกสาร</div>
      {items.length === 0 ? (
        <Card className="border-[0.5px]">
          <EmptyState
            title="ยังไม่มีเอกสาร"
            description="กดปุ่มด้านบนเพื่อเริ่มต้นขั้นตอนของงานขายนี้"
          />
        </Card>
      ) : (
        <div className="space-y-0">
          {items.map((item, index) => {
            const doc = item.document;
            const isBorrowed = "sourceDealId" in item;
            const borrowed = isBorrowed ? (item as BorrowedDoc) : null;
            const copiedFromDoc = doc.copied_from_id
              ? docsWithMeta.find((source) => source.document.id === doc.copied_from_id)?.document
              : null;
            const convertedFromDoc =
              doc.doc_type === "receipt" && doc.converted_from_id
                ? docsWithMeta.find((source) => source.document.id === doc.converted_from_id)
                    ?.document
                : null;
            const isCurrent = !isBorrowed && activeDocId === doc.id;
            const overdue = isDocumentOverdue(doc);
            const isDoneStage = item.stage === "done" && !isCurrent;
            const isFinancialDocument = doc.doc_type === "invoice";
            if (isBorrowed && borrowed) {
              return (
                <div key={doc.id} className={`flex gap-3 ${isDoneStage ? "opacity-80" : ""}`}>
                  <div className="w-7 flex flex-col items-center shrink-0">
                    <div
                      className={[
                        "mt-1 rounded-full",
                        "w-2.5 h-2.5",
                        doc.status === "draft" ? "bg-line" : "",
                        doc.status === "paid" ||
                        doc.status === "generated" ||
                        doc.status === "issued"
                          ? "bg-paid-text"
                          : "",
                        doc.status === "converted" ? "bg-ink-200" : "",
                        overdue ? "bg-danger" : "",
                      ].join(" ")}
                    />
                    {index < items.length - 1 && (
                      <div className="mt-1 w-px flex-1 bg-card-border" />
                    )}
                  </div>
                  <Card
                    className="mb-2 flex-1 bg-paper-field"
                    onClick={() => navigate(`/documents/${doc.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-label font-semibold text-ink-900">
                          {documentTypeLabel(doc.doc_type, doc.vat_registered).thai}
                        </div>
                        <div className="mt-0.5 text-label text-ink-500">
                          {doc.doc_number || "ยังไม่มีเลขเอกสาร"}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/deals/${borrowed.sourceDealId}`);
                          }}
                          className="mt-1 inline-flex rounded-full border border-primary-border bg-primary-soft px-2 py-0.5 text-label font-medium text-primary-deep hover:bg-primary-soft"
                          title="เปิดงานขายต้นทางของเอกสารนี้"
                        >
                          จากงานขาย {borrowed.sourceDealNumber || "(ไม่มีเลขงานขาย)"}
                        </button>
                        <div className="mt-1 text-label text-ink-400">
                          {docDate.date(doc.issue_date)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="text-right">
                          <div className="text-label text-ink-400">ยอดรวม</div>
                          <div className="text-body font-semibold text-ink-900">
                            ฿{formatCurrency(getDocumentAmount(doc))}
                          </div>
                        </div>
                        <Badge status={overdue ? "overdue" : doc.status} />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenPreview(doc);
                          }}
                          className="rounded-control p-1.5 text-ink-400 hover:bg-ink-50 hover:text-primary transition-colors"
                          title="พรีวิวเอกสาร"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            }
            return (
              <div key={doc.id} className={`flex gap-3 ${isDoneStage ? "opacity-80" : ""}`}>
                <div className="w-7 flex flex-col items-center shrink-0">
                  <div
                    className={[
                      "mt-1 rounded-full",
                      isCurrent ? "w-3 h-3 bg-primary ring-4 ring-primary/20" : "w-2.5 h-2.5",
                      doc.status === "draft" ? "bg-line" : "",
                      doc.status === "paid" || doc.status === "generated" || doc.status === "issued"
                        ? "bg-paid-text"
                        : "",
                      doc.status === "partially_paid" ? "bg-warning" : "",
                      doc.status === "converted" ? "bg-ink-200" : "",
                      overdue ? "bg-danger" : "",
                      (doc.status === "sent" || doc.status === "in_billing") &&
                      !overdue &&
                      !isCurrent
                        ? "bg-primary"
                        : "",
                    ].join(" ")}
                  />
                  {index < items.length - 1 && <div className="mt-1 w-px flex-1 bg-card-border" />}
                </div>
                <Card
                  className={`mb-2 flex-1 ${isCurrent ? "border-primary bg-primary-soft/30" : ""} ${isDoneStage ? "bg-paper-field" : ""}`}
                  onClick={() => navigate(`/documents/${doc.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className={`text-label font-semibold ${isCurrent ? "text-primary" : "text-ink-900"}`}
                      >
                        {documentTypeLabel(doc.doc_type, doc.vat_registered).thai}
                      </div>
                      <div
                        className={`mt-0.5 text-label ${doc.status === "voided" ? "line-through" : "text-ink-500"}`}
                      >
                        {doc.doc_number || "ยังไม่มีเลขเอกสาร"}
                        {convertedFromDoc && (
                          <span className="text-ink-400">
                            {" "}
                            • จาก {convertedFromDoc.doc_number || ""}
                          </span>
                        )}
                      </div>
                      {copiedFromDoc && (
                        <div className="mt-1 inline-flex rounded-full border border-primary-border bg-primary-soft px-2 py-0.5 text-label font-medium text-primary-deep">
                          ออกแทน {copiedFromDoc.doc_number || "เอกสารเดิม"}
                        </div>
                      )}
                      {doc.doc_type === "delivery_note" &&
                      doc.status === "draft" &&
                      doc.is_blank_form ? (
                        <div className="mt-1 inline-flex rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-label font-medium text-warning-text">
                          ฟอร์มเปล่า
                        </div>
                      ) : null}
                      {isFinancialDocument
                        ? (() => {
                            const varianceLines = (item.line_items || [])
                              .filter(
                                (li) =>
                                  li.source_document_id &&
                                  hasDnVariance({
                                    deliveredQty: li.source_delivered_qty,
                                    billedQty: Number(li.quantity) || 0,
                                    unit: li.unit || "ชิ้น",
                                    dnUnitPrice: li.source_unit_price,
                                    unitPrice: Number(li.unit_price) || 0,
                                  }),
                              )
                              .map((li) => ({
                                name: li.item_name,
                                parts: getDnVarianceParts({
                                  deliveredQty: li.source_delivered_qty,
                                  billedQty: Number(li.quantity) || 0,
                                  unit: li.unit || "ชิ้น",
                                  dnUnitPrice: li.source_unit_price,
                                  unitPrice: Number(li.unit_price) || 0,
                                  dnDocNumber: sourceDocById.get(li.source_document_id || "")
                                    ?.number,
                                  sourceKind: sourceDocById.get(li.source_document_id || "")?.kind,
                                }),
                                kind:
                                  sourceDocById.get(li.source_document_id || "")?.kind ??
                                  "delivery_note",
                              }));
                            if (varianceLines.length === 0) return null;
                            const uniqueKinds = [...new Set(varianceLines.map((vl) => vl.kind))];
                            const badgeLabel =
                              uniqueKinds.length === 1
                                ? getSourceVarianceLabel(uniqueKinds[0])
                                : "ส่วนต่างจากเอกสารต้นฉบับ";
                            return (
                              <div className="mt-1">
                                <span className="inline-flex rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-label font-medium text-warning-text">
                                  {badgeLabel}
                                </span>
                                <ul className="mt-1 space-y-0.5">
                                  {varianceLines.map((vl, vi) => (
                                    <li
                                      key={vi}
                                      className="text-label leading-snug text-warning-text"
                                    >
                                      <span className="font-medium">{vl.name}</span> —{" "}
                                      {vl.parts.join(" | ")}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })()
                        : null}
                      <div className="mt-1 text-label text-ink-400">
                        {docDate.date(doc.issue_date)}
                        {doc.due_date ? (
                          <>
                            {" • ครบ "}
                            <span className={overdue ? "text-danger-text" : ""}>
                              {docDate.date(doc.due_date)}
                            </span>
                          </>
                        ) : null}
                      </div>
                      {isFinancialDocument && (
                        <div className="mt-1 flex flex-wrap gap-x-2 text-label leading-relaxed text-ink-400">
                          <span>ก่อน VAT ฿{formatCurrency(doc.subtotal)}</span>
                          {doc.vat_registered && <span>VAT ฿{formatCurrency(doc.vat_amount)}</span>}
                          {doc.wht_amount > 0 && (
                            <span className="text-warning-text">
                              หัก ณ ที่จ่าย -฿{formatCurrency(doc.wht_amount)}
                            </span>
                          )}
                        </div>
                      )}
                      {(doc.status === "paid" ||
                        doc.status === "partially_paid" ||
                        doc.status === "generated" ||
                        doc.status === "issued") && (
                        <div className="mt-1 text-label leading-relaxed">
                          {doc.doc_type === "receipt" ? (
                            <>
                              {doc.wht_amount > 0 && (
                                <div className="text-warning-text">
                                  <span className="font-medium">หัก ณ ที่จ่าย</span> ฿
                                  {doc.wht_amount.toLocaleString()}
                                </div>
                              )}
                              {doc.payment_method && (
                                <div
                                  className={
                                    doc.wht_amount > 0 ? "text-ink-400" : "text-success-text"
                                  }
                                >
                                  {PAYMENT_METHOD_LABELS[doc.payment_method]}
                                </div>
                              )}
                            </>
                          ) : doc.status === "partially_paid" ? (
                            <>
                              <div className="text-success-text">
                                <span className="font-medium">เก็บแล้ว</span> ฿
                                {(doc.amount_received || 0).toLocaleString()}
                              </div>
                              <div className="text-warning-text">
                                <span className="font-medium">คงเหลือ</span> ฿
                                {Math.max(
                                  0,
                                  (doc.net_payable || 0) - (doc.amount_received || 0),
                                ).toLocaleString()}{" "}
                                (
                                {Math.round(
                                  ((doc.amount_received || 0) / (doc.net_payable || 1)) * 100,
                                )}
                                %)
                              </div>
                              <div className="text-ink-400">
                                {doc.payment_method
                                  ? PAYMENT_METHOD_LABELS[doc.payment_method]
                                  : ""}
                                {!isFinancialDocument && doc.payment_method && doc.wht_amount > 0
                                  ? " · "
                                  : ""}
                                {!isFinancialDocument && doc.wht_amount > 0 ? (
                                  <>หัก ณ ที่จ่าย ฿{formatCurrency(doc.wht_amount)}</>
                                ) : (
                                  ""
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-success-text">
                              {doc.paid_at ? docDate.date(doc.paid_at) : ""}
                              {doc.payment_method
                                ? ` · ${PAYMENT_METHOD_LABELS[doc.payment_method]}`
                                : ""}
                              {!isFinancialDocument && doc.wht_amount > 0 ? (
                                <> · หัก ณ ที่จ่าย ฿{formatCurrency(doc.wht_amount)}</>
                              ) : (
                                ""
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="text-right">
                        {(isFinancialDocument ||
                          doc.doc_type === "billing_note" ||
                          doc.doc_type === "receipt") && (
                          <div className="text-label text-ink-400">
                            ก่อน VAT ฿{formatCurrency(doc.subtotal)}
                          </div>
                        )}
                        <div className="text-label text-ink-400">
                          {isFinancialDocument && doc.wht_amount > 0 ? "รวม" : "ยอดรวม"}
                        </div>
                        <div className="text-body font-semibold text-ink-900">
                          ฿{formatCurrency(getDocumentAmount(doc))}
                        </div>
                        {isFinancialDocument && doc.wht_amount > 0 && (
                          <div className="mt-0.5 text-label font-medium text-ink-500">
                            สุทธิ ฿{formatCurrency(doc.net_payable)}
                          </div>
                        )}
                      </div>
                      <Badge status={overdue ? "overdue" : doc.status} />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenPreview(doc);
                        }}
                        className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-ink-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:h-8 md:w-8"
                        title="พิมพ์ / PDF"
                        aria-label="พิมพ์ / PDF"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}

          {voidedDocs.length > 0 && (
            <button
              className="mt-1 inline-flex items-center gap-1 text-label text-ink-500 hover:text-ink-700"
              onClick={() => setShowVoided((prev) => !prev)}
            >
              {showVoided ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              แสดงเอกสารที่ยกเลิก ({voidedDocs.length})
            </button>
          )}

          {showVoided &&
            voidedDocs.map((item) => {
              const doc = item.document;
              const replacementDoc = replacementBySourceId.get(doc.id);
              return (
                <div key={doc.id} className="flex gap-3 opacity-50">
                  <div className="w-7 flex flex-col items-center shrink-0">
                    <div className="mt-1 w-2.5 h-2.5 rounded-full bg-line" />
                  </div>
                  <Card className="mb-2 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-label font-semibold text-ink-700">
                          {documentTypeLabel(doc.doc_type, doc.vat_registered).thai}
                        </div>
                        <div className="mt-0.5 text-label text-ink-500 line-through">
                          {doc.doc_number || "ยังไม่มีเลขเอกสาร"}
                        </div>
                        {replacementDoc && (
                          <div className="mt-1 inline-flex rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-label font-medium text-warning-text">
                            ออกใหม่เป็น {replacementDoc.doc_number || "ฉบับใหม่"}
                          </div>
                        )}
                        <div className="mt-1 text-label text-ink-400">
                          {docDate.date(doc.issue_date)}
                        </div>
                        {doc.voided_reason && (
                          <div className="mt-0.5 text-label text-ink-400 italic">
                            เหตุผล: {doc.voided_reason}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="text-body font-semibold text-ink-800">
                          ฿{formatCurrency(getDocumentAmount(doc))}
                        </div>
                        <Badge status="voided" />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenPreview(doc);
                          }}
                          className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-paper-field hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:h-8 md:w-8"
                          title="พิมพ์ / PDF"
                          aria-label="พิมพ์ / PDF"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
