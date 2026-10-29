import { Fragment, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, FileStack, Info, ListTree } from "lucide-react";
import { AmountRow } from "../ui/AmountRow";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Money } from "../ui/Money";
import { formatCurrency } from "../../lib/format";
import type {
  InvoicePreview,
  InvoicePreviewRow,
  InvoicePresentationMode,
} from "../../lib/invoiceFromSources";

export interface InvoiceConfirmWarning {
  tone: "warning" | "info";
  title: string;
  description?: string;
}

export interface InvoiceConfirmSummary {
  customerName: string;
  issueDateLabel: string;
  docNumberLabel: string;
  sourceCount: number;
  itemCount: number;
  poNumber?: string | null;
  taskName?: string | null;
  note?: string | null;
  appendix?: boolean;
}

export interface InvoiceConfirmTotals {
  subtotal: number;
  vat: number;
  vatRate: number;
  wht: number;
  whtRate: number;
  total: number;
  net: number;
}

interface InvoiceCreateConfirmModalProps {
  open: boolean;
  sourceLabel: string;
  mode: InvoicePresentationMode;
  onModeChange: (mode: InvoicePresentationMode) => void;
  summary: InvoiceConfirmSummary;
  detailPreview: InvoicePreview;
  referencePreview: InvoicePreview;
  totals: InvoiceConfirmTotals;
  warnings: InvoiceConfirmWarning[];
  variance?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description: string;
  };
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function qtyLabel(value: number): string {
  return Number(Number(value).toFixed(3)).toLocaleString("th-TH", {
    maximumFractionDigits: 3,
  });
}

function Field({
  label,
  value,
  title,
  className = "",
}: {
  label: string;
  value: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-label text-ink-400">{label}</div>
      <div className="truncate text-body font-medium text-ink-800" title={title}>
        {value}
      </div>
    </div>
  );
}

function ModeCard({
  selected,
  onSelect,
  icon,
  title,
  badge,
  description,
  meta,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  badge?: string;
  description: string;
  meta: string;
}) {
  return (
    <label
      className={`group relative flex cursor-pointer flex-col gap-2.5 rounded-card border p-3.5 text-left transition-colors focus-within:ring-2 focus-within:ring-primary/30 ${
        selected
          ? "border-primary bg-primary-soft/40 ring-1 ring-primary"
          : "border-card-border bg-white hover:border-primary/40"
      }`}
    >
      <input
        type="radio"
        name="invoice-presentation-mode"
        checked={selected}
        onChange={onSelect}
        autoFocus={selected}
        className="sr-only"
      />
      <div className="flex items-start justify-between gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-control ${
            selected ? "bg-primary-soft text-primary-deep" : "bg-paper-field text-ink-500"
          }`}
        >
          {icon}
        </span>
        {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-body font-semibold text-ink-900">{title}</span>
          {badge ? (
            <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-label font-medium text-primary-deep">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-label leading-5 text-ink-500">{description}</p>
        <p className="mt-1 text-label font-medium text-ink-600">{meta}</p>
      </div>
    </label>
  );
}

function PreviewRow({ row, mode }: { row: InvoicePreviewRow; mode: InvoicePresentationMode }) {
  const referenceLine = mode === "reference" && !row.isManual;
  return (
    <tr className={row.isManual ? "bg-paper-warm/40" : undefined}>
      <td className="px-2 py-1.5 align-top">
        <div className="min-w-0">
          <div className="truncate font-medium text-ink-800" title={row.name}>
            {row.name}
          </div>
          {row.note ? (
            <div className="truncate text-label text-ink-400" title={row.note}>
              {row.note}
            </div>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right align-top tabular-nums text-ink-600">
        {qtyLabel(row.quantity)}
      </td>
      <td className="hidden px-2 py-1.5 align-top text-ink-500 sm:table-cell">
        {referenceLine ? "—" : row.unit || "—"}
      </td>
      <td className="px-2 py-1.5 text-right align-top tabular-nums text-ink-600">
        {referenceLine ? "—" : formatCurrency(row.unitPrice)}
      </td>
      <td className="hidden px-2 py-1.5 text-right align-top tabular-nums text-ink-500 sm:table-cell">
        {referenceLine ? "—" : row.discountPercent ? `${row.discountPercent}%` : "—"}
      </td>
      <td className="px-2 py-1.5 text-right align-top font-medium tabular-nums text-ink-900">
        <Money value={row.total} />
      </td>
    </tr>
  );
}

function PreviewTable({
  preview,
  mode,
}: {
  preview: InvoicePreview;
  mode: InvoicePresentationMode;
}) {
  return (
    <div className="overflow-hidden rounded-control border border-card-border">
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-label">
          <thead className="sticky top-0 z-10 bg-paper-field text-ink-500">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                รายการ
              </th>
              <th scope="col" className="w-16 px-2 py-1.5 text-right font-medium">
                จำนวน
              </th>
              <th
                scope="col"
                className="hidden w-16 px-2 py-1.5 text-left font-medium sm:table-cell"
              >
                หน่วย
              </th>
              <th scope="col" className="w-24 px-2 py-1.5 text-right font-medium">
                ราคา/หน่วย
              </th>
              <th
                scope="col"
                className="hidden w-16 px-2 py-1.5 text-right font-medium sm:table-cell"
              >
                ส่วนลด
              </th>
              <th scope="col" className="w-24 px-2 py-1.5 text-right font-medium">
                รวม
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-faint">
            {preview.mode === "detail"
              ? preview.groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-paper-soft">
                      <td colSpan={6} className="px-2 py-1.5">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-ink-700">{group.label}</span>
                          {group.meta ? (
                            <span className="text-label text-ink-400">{group.meta}</span>
                          ) : null}
                          <span className="ml-auto text-label text-ink-400">
                            {group.rows.length} รายการ
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <PreviewRow key={row.key} row={row} mode={mode} />
                    ))}
                  </Fragment>
                ))
              : preview.rows.map((row) => <PreviewRow key={row.key} row={row} mode={mode} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function InvoiceCreateConfirmModal({
  open,
  sourceLabel,
  mode,
  onModeChange,
  summary,
  detailPreview,
  referencePreview,
  totals,
  warnings,
  variance,
  saving,
  error,
  onCancel,
  onConfirm,
}: InvoiceCreateConfirmModalProps) {
  const preview = mode === "detail" ? detailPreview : referencePreview;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="ยืนยันสร้างใบแจ้งหนี้"
      size="xl"
      className="max-md:!h-[100dvh] max-md:!max-h-[100dvh] max-md:!rounded-none max-md:!border-0"
    >
      <div className="space-y-4">
        <p className="text-label leading-5 text-ink-500">
          ตรวจสอบรูปแบบและรายการก่อนสร้าง — เลือกโหมดแล้วแก้ภายหลังไม่ได้
        </p>

        {error ? (
          <div className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-soft px-3 py-2 text-label text-danger-text">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">สร้างใบแจ้งหนี้ไม่สำเร็จ</p>
              <p className="mt-0.5 leading-5">{error}</p>
            </div>
          </div>
        ) : null}

        {warnings.map((warning, index) => {
          const Icon = warning.tone === "warning" ? AlertTriangle : Info;
          return (
            <div
              key={`${warning.title}-${index}`}
              className={`flex items-start gap-2 rounded-control border px-3 py-2 text-label ${
                warning.tone === "warning"
                  ? "border-warning-border bg-warning-soft text-warning-text"
                  : "border-primary-border bg-primary-soft text-primary-deep"
              }`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">{warning.title}</p>
                {warning.description ? (
                  <p className="mt-0.5 leading-5">{warning.description}</p>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-control border border-card-border bg-paper-soft p-3 text-body lg:grid-cols-4">
          <Field
            label="ลูกค้า"
            value={summary.customerName}
            title={summary.customerName}
            className="col-span-2 lg:col-span-1"
          />
          <Field label="วันที่ออก" value={summary.issueDateLabel} />
          <Field label="เลขที่ใบแจ้งหนี้" value={summary.docNumberLabel} />
          <Field
            label="ต้นทาง"
            value={`${summary.sourceCount} ${sourceLabel} · ${summary.itemCount} รายการ`}
            className="col-span-2 lg:col-span-1"
          />
          {summary.poNumber ? (
            <Field label="PO" value={summary.poNumber} title={summary.poNumber} />
          ) : null}
          {summary.taskName ? (
            <Field label="งาน / โปรเจกต์" value={summary.taskName} title={summary.taskName} />
          ) : null}
          {summary.appendix ? <Field label="ภาคผนวก" value="แนบมาพร้อมเอกสาร" /> : null}
          {summary.note ? (
            <Field
              label="หมายเหตุ"
              value={summary.note}
              title={summary.note}
              className="col-span-2"
            />
          ) : null}
        </div>

        <section aria-labelledby="invoice-presentation-mode-heading">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-1">
            <h3
              id="invoice-presentation-mode-heading"
              className="text-body font-semibold text-ink-900"
            >
              รูปแบบเอกสาร <span className="text-danger">*</span>
            </h3>
            <span className="text-label text-ink-400">เลือกตอนสร้าง</span>
          </div>
          <div role="radiogroup" aria-label="รูปแบบเอกสาร" className="grid gap-2.5 sm:grid-cols-2">
            <ModeCard
              selected={mode === "detail"}
              onSelect={() => onModeChange("detail")}
              icon={<ListTree className="h-4 w-4" />}
              title="รายละเอียดสินค้า"
              badge="แนะนำ"
              description="PDF แสดงรายการสินค้าแบบละเอียด พร้อมจำนวน ราคา และส่วนลดของทุกรายการ"
              meta={`${detailPreview.rowCount} รายการในเอกสาร`}
            />
            <ModeCard
              selected={mode === "reference"}
              onSelect={() => onModeChange("reference")}
              icon={<FileStack className="h-4 w-4" />}
              title={`อ้างอิง${sourceLabel}`}
              description={`PDF แสดง 1 บรรทัดต่อ${sourceLabel} (เหมือนใบวางบิล)`}
              meta={`${referencePreview.rowCount} บรรทัดในเอกสาร`}
            />
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-label leading-5 text-warning-text">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              โหมดที่เลือกจะถูกบันทึกกับเอกสารนี้และแก้ภายหลังไม่ได้ —
              ต้องยกเลิกและออกเอกสารใหม่หากเลือกผิด
            </span>
          </p>
        </section>

        <section aria-labelledby="invoice-preview-heading">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-1">
            <h3 id="invoice-preview-heading" className="text-body font-semibold text-ink-900">
              ตัวอย่างรายการในเอกสาร
            </h3>
            <span className="text-label text-ink-400">
              {mode === "reference"
                ? `${referencePreview.rowCount} บรรทัด`
                : `${detailPreview.rowCount} รายการ`}
            </span>
          </div>
          <PreviewTable preview={preview} mode={mode} />
          <p className="mt-1.5 text-label leading-5 text-ink-400">
            ตัวอย่างนี้สร้างจากรายการเดียวกับที่จะบันทึกจริง — ตรวจสอบจำนวนและยอดก่อนยืนยัน
          </p>
        </section>

        {mode === "detail" && variance ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-card-border bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={variance.checked}
              onChange={(event) => variance.onChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary/30"
            />
            <span className="min-w-0">
              <span className="text-body font-medium text-ink-800">{variance.label}</span>
              <span className="mt-0.5 block text-label leading-5 text-ink-500">
                {variance.description}
              </span>
            </span>
          </label>
        ) : null}

        <div className="rounded-control border border-card-border bg-paper-soft p-3">
          <div className="space-y-1.5">
            <AmountRow label="รวมก่อนภาษี" value={<Money value={totals.subtotal} />} />
            {totals.vatRate > 0 ? (
              <AmountRow label={`VAT ${totals.vatRate}%`} value={<Money value={totals.vat} />} />
            ) : null}
            <AmountRow label="รวมทั้งสิ้น" value={<Money value={totals.total} />} tone="strong" />
            {totals.wht > 0 ? (
              <AmountRow
                label={`หัก ณ ที่จ่าย ${totals.whtRate}%`}
                value={<Money value={totals.wht} prefix="-฿" />}
                tone="red"
              />
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-line-strong pt-2">
              <span className="text-body font-semibold text-ink-800">ยอดชำระสุทธิ</span>
              <Money value={totals.net} className="text-title font-semibold text-primary-deep" />
            </div>
          </div>
        </div>

        <div
          className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-2 border-t border-card-border bg-white px-5 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="text-label text-ink-400">ยอดชำระสุทธิ</div>
              <Money value={totals.net} className="text-title font-semibold text-primary-deep" />
            </div>
            <div className="flex flex-row gap-2 sm:items-center">
              <span className="hidden text-label text-ink-400 sm:inline">
                ยืนยันแล้วออกเอกสารทันที
              </span>
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={saving}
                className="flex-1 whitespace-nowrap sm:flex-none"
              >
                ย้อนกลับไปแก้ไข
              </Button>
              <Button
                onClick={onConfirm}
                loading={saving}
                className="flex-1 whitespace-nowrap sm:flex-none"
              >
                ยืนยันสร้างใบแจ้งหนี้
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
