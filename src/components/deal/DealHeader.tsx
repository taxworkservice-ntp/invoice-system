import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  FileStack,
  Pencil,
  Phone,
  ScrollText,
} from "lucide-react";
import { useDocDate } from "../YearEraProvider";
import { useToast } from "../../hooks/useToast";
import { formatCurrency } from "../../lib/format";
import { invoicePaymentLabel, invoicePaymentTone } from "../../lib/billingRefs";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DealStatusPill } from "./DealStatusPill";
import { DealStageMenu } from "./DealStageMenu";
import type { DealHeaderModel } from "./types";

export interface DealHeaderProps {
  model: DealHeaderModel;
  stageOverrideBusy: boolean;
  customerPickerLoading: boolean;
  onOpenSummary: () => void;
  onChangeCustomer: () => void;
  onSetManualStage: (value: string | null) => void;
}

export function DealHeader({
  model,
  stageOverrideBusy,
  customerPickerLoading,
  onOpenSummary,
  onChangeCustomer,
  onSetManualStage,
}: DealHeaderProps) {
  const {
    deal,
    customer,
    title,
    itemSummary,
    workflow,
    isOverdue,
    overdueDueDate,
    amount,
    amountLabel,
    billingRefs,
    nonVoidedDocs,
    allDone,
    permissions,
  } = model;
  const navigate = useNavigate();
  const docDate = useDocDate();
  const toast = useToast();

  function handleCopyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("คัดลอกแล้ว");
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {deal.deal_number && (
            <div className="text-label font-medium text-primary tabular-nums">
              {deal.deal_number}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="text-title font-semibold text-ink-900 truncate">
              {customer?.name || title}
            </div>
            {customer && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/customers/${customer.id}`);
                }}
                className="shrink-0 rounded-control p-2.5 text-ink-400 md:p-1 hover:text-primary hover:bg-primary-soft transition-colors"
                title="เปิดหน้าลูกค้า"
                aria-label="เปิดหน้าลูกค้า"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            {customer && (
              <button
                type="button"
                disabled={customerPickerLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  void onChangeCustomer();
                }}
                className="shrink-0 rounded-control p-2.5 text-ink-400 md:p-1 hover:text-primary hover:bg-primary-soft transition-colors disabled:opacity-40"
                title="เปลี่ยนลูกค้าของงานนี้"
                aria-label="เปลี่ยนลูกค้าของงานนี้"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {customer?.phone && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyText(customer.phone!);
                }}
                className="shrink-0 rounded-control p-2.5 text-ink-400 md:p-1 hover:text-ink-600 hover:bg-ink-50"
                title="คัดลอกเบอร์โทร"
              >
                <Phone className="h-3.5 w-3.5" />
              </button>
            )}
            {customer?.tax_id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyText(customer.tax_id!);
                }}
                className="shrink-0 rounded-control p-2.5 text-ink-400 md:p-1 hover:text-ink-600 hover:bg-ink-50"
                title="คัดลอกเลขที่ผู้เสียภาษี"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {itemSummary ? (
            <div className="mt-1 text-label text-ink-500 leading-5">{itemSummary}</div>
          ) : customer?.address ? (
            <div className="mt-1 text-label text-ink-500 leading-5 line-clamp-2">
              {customer.address}
            </div>
          ) : (
            <div className="mt-1 text-label text-ink-400">ยังไม่มีรายการสินค้า</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DealStatusPill
              label={workflow.stageLabel}
              phase={workflow.phase}
              overdue={isOverdue}
              manual={workflow.isManual}
            />
            <DealStageMenu
              value={deal.manual_stage ?? null}
              busy={stageOverrideBusy}
              canEdit={permissions.canCreateEditDocuments && !allDone}
              onChange={onSetManualStage}
            />
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-display font-semibold text-ink-900">฿{formatCurrency(amount)}</div>
          <div className="mt-1 text-label text-ink-500">{amountLabel}</div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 inline-flex items-center gap-1.5"
            onClick={() => onOpenSummary()}
          >
            <ScrollText className="h-3.5 w-3.5" />
            สรุปงานขาย
          </Button>
        </div>
      </div>
      {(billingRefs.billedIn || billingRefs.sourceDeals.length > 0) && (
        <div className="mt-3 space-y-2">
          {billingRefs.billedIn && (
            <button
              type="button"
              onClick={() => navigate(`/deals/${billingRefs.billedIn!.dealId}`)}
              className={`flex w-full items-center justify-between gap-2 rounded-control border px-3 py-2 text-label transition-colors ${invoicePaymentTone(billingRefs.billedIn.invoiceStatus) === "paid" ? "border-success-border bg-success-soft text-success-text hover:bg-success-soft" : "border-warning-border bg-warning-soft text-warning-text hover:bg-warning-soft"}`}
            >
              <span>
                {billingRefs.billedIn.kind === "billing_note"
                  ? "งานนี้ถูกวางบิลในใบวางบิลของ"
                  : "งานนี้ถูกรวมออกบิลเป็นใบแจ้งหนี้ใน"}{" "}
                <span className="font-semibold">
                  {billingRefs.billedIn.dealNumber ||
                    billingRefs.billedIn.invoiceNumber ||
                    "งานขายอื่น"}
                </span>{" "}
                · {invoicePaymentLabel(billingRefs.billedIn.invoiceStatus)}
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}
          {billingRefs.sourceDeals.length > 0 && (
            <div className="flex items-start gap-2 rounded-control border border-primary-border bg-primary-soft px-3 py-2 text-label text-primary-deep">
              <FileStack className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                รวมจาก {billingRefs.sourceDeals.length} งานขาย:{" "}
                {billingRefs.sourceDeals.map((s, i) => (
                  <span key={s.dealId}>
                    {i > 0 && ", "}
                    <button
                      type="button"
                      onClick={() => navigate(`/deals/${s.dealId}`)}
                      className="font-semibold hover:underline"
                    >
                      {s.dealNumber || "(ไม่มีเลขงานขาย)"}
                    </button>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
      {isOverdue && overdueDueDate && (
        <div className="mt-3 flex items-start gap-2 rounded-control border border-danger-border bg-danger-soft px-3 py-2 text-label text-danger-text">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>เอกสารนี้เกินกำหนดชำระแล้ว ตั้งแต่ {docDate.date(overdueDueDate!)}</span>
        </div>
      )}
      {(() => {
        const partialDoc = nonVoidedDocs.find(
          (item) => item.document.status === "partially_paid",
        )?.document;
        if (!partialDoc) return null;
        const remaining = (partialDoc.net_payable || 0) - (partialDoc.amount_received || 0);
        return (
          <div className="mt-3 flex items-start gap-2 rounded-control border border-warning-border bg-warning-soft px-3 py-2 text-label text-warning-text">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">ชำระบางส่วน</span>— รับแล้ว ฿
              {(partialDoc.amount_received || 0).toLocaleString()} จาก ฿
              {(partialDoc.net_payable || 0).toLocaleString()} คงเหลือ ฿
              {Math.max(0, remaining).toLocaleString()}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}
