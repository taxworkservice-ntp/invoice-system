import type { ReactNode } from "react";
import { Eye, EyeOff, PenLine } from "lucide-react";
import { Card } from "../ui/Card";

/**
 * Consolidated document-output options section.
 * One card, stacked toggle rows — the single predictable place for
 * "options that affect this document" (print layout, line presentation, etc.).
 */
export function DocumentOptionsCard({
  number,
  title = "ตัวเลือกเอกสาร",
  description = "ตัวเลือกเหล่านี้มีผลต่อเอกสาร PDF เท่านั้น",
  children,
}: {
  /** When set, renders as a numbered form step instead of a plain card. */
  number?: number;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2.5">
        {typeof number === "number" ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-label font-semibold text-primary">
            {number}
          </span>
        ) : null}
        <h3 className="text-body font-medium text-ink-900">{title}</h3>
      </div>
      {description ? (
        <p className="mb-3 text-label text-ink-400">{description}</p>
      ) : null}
      <div className="divide-y divide-card-border">
        {children}
      </div>
    </Card>
  );
}

export function DocumentOptionRow({
  label,
  badge,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  badge?: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 py-3 first:pt-0 last:pb-0 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <div className="relative inline-flex shrink-0 items-center pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <span
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${ checked ? "bg-primary" : "bg-line" }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${ checked ? "translate-x-4" : "" }`}
          />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-body font-medium text-ink-800">{label}</span>
        {badge ? (
          <span className="ml-2 text-label text-ink-400">{badge}</span>
        ) : null}
        {description ? (
          <p className="mt-0.5 text-label leading-5 text-ink-500">{description}</p>
        ) : null}
      </div>
    </label>
  );
}

/**
 * Required single-choice row (e.g. the delivery-note amount-display mode).
 * Renders as a neutral segmented control — never hides or disables an option,
 * so every choice stays visible.
 */
export function DocumentOptionSegmented<T extends string>({
  label,
  required = false,
  value,
  options,
  description,
  error,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: T | null;
  options: Array<{ value: T; label: string }>;
  description?: string;
  error?: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="text-body font-medium text-ink-800">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </div>
      <div className="mt-2 inline-flex flex-wrap items-center rounded-control border border-line bg-ink-50 p-0.5">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`rounded-[6px] px-2.5 py-1 text-label font-medium transition-colors ${
                active
                  ? "border border-line-strong bg-white text-ink-900"
                  : "border border-transparent text-ink-500 hover:text-ink-700"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {description ? <p className="mt-1.5 text-label leading-5 text-ink-500">{description}</p> : null}
      {error ? <p className="mt-1 text-label text-danger-text">{error}</p> : null}
    </div>
  );
}

/** Delivery-note print mode — how much money the PDF shows. */
export type DnAmountDisplay = "full" | "hidden" | "blank";

type DnAmountDisplayCopy = {
  title: string;
  description: string;
  footnote: string;
  badge?: string;
};

/**
 * Single source of truth for the delivery-note amount-display labels.
 * The PDF/template logic is untouched — this only describes it.
 */
export const DN_AMOUNT_DISPLAY_COPY: Record<DnAmountDisplay, DnAmountDisplayCopy> = {
  full: {
    title: "แสดงจำนวนเงิน",
    description: "PDF แสดงราคาต่อหน่วย ส่วนลด และยอดรวมตามปกติ",
    footnote: "ผู้รับจะเห็นราคาและยอดรวมทั้งหมด",
  },
  hidden: {
    title: "ซ่อนจำนวนเงิน",
    description: "PDF แสดงเฉพาะชื่อสินค้า จำนวน และหน่วย",
    footnote: "ซ่อนราคา ส่วนลด และยอดรวม — ยอดในระบบยังอยู่ครบไว้ออกบิลต่อ",
    badge: "แนะนำ",
  },
  blank: {
    title: "ฟอร์มเปล่า — เขียนมือหน้างาน",
    description: "PDF เว้นช่องจำนวนและราคาให้กรอกด้วยมือ",
    footnote: "ตัวเลขในระบบยังอยู่ครบสำหรับออกบิลภายหลัง",
  },
};

const DN_AMOUNT_DISPLAY_ORDER: DnAmountDisplay[] = ["full", "hidden", "blank"];

function DnAmountDisplayIcon({ value }: { value: DnAmountDisplay }) {
  const className = "h-4 w-4 shrink-0";
  if (value === "full") return <Eye className={className} />;
  if (value === "hidden") return <EyeOff className={className} />;
  return <PenLine className={className} />;
}

/**
 * Required single-choice radio-cards for the delivery-note amount-display
 * mode. Every option stays visible with its consequence up front, so the
 * choice never reads as a bare label. Real radios in a fieldset — keyboard
 * and screen-reader correct.
 */
export function DnAmountDisplayPicker({
  value,
  onChange,
  showError = false,
  name = "dn-amount-display",
}: {
  value: DnAmountDisplay | null;
  onChange: (value: DnAmountDisplay) => void;
  /** True once a save was attempted with nothing chosen — turns the hint red. */
  showError?: boolean;
  name?: string;
}) {
  const missing = value == null;
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <fieldset>
        <legend className="sr-only">การแสดงจำนวนเงินใน PDF (บังคับเลือก 1 แบบ)</legend>
        <div className="space-y-2">
          {DN_AMOUNT_DISPLAY_ORDER.map((optionValue) => {
            const copy = DN_AMOUNT_DISPLAY_COPY[optionValue];
            const active = value === optionValue;
            return (
              <label
                key={optionValue}
                className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors ${
                  active
                    ? "border-primary bg-primary-soft/50"
                    : "border-card-border bg-white hover:border-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  checked={active}
                  onChange={() => onChange(optionValue)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className={`mt-0.5 ${active ? "text-primary-deep" : "text-ink-400"}`}>
                  <DnAmountDisplayIcon value={optionValue} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-body font-medium text-ink-900">{copy.title}</span>
                    {copy.badge ? (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-label font-medium text-primary-deep">
                        {copy.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-label leading-5 text-ink-600">
                    {copy.description}
                  </span>
                  <span className="mt-0.5 block text-label leading-5 text-ink-400">
                    {copy.footnote}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {missing ? (
        <p className={`mt-2 text-label leading-5 ${showError ? "font-medium text-danger-text" : "text-ink-400"}`} role={showError ? "alert" : undefined}>
          กรุณาเลือก 1 แบบก่อนบันทึก — มีผลกับ PDF เท่านั้น
        </p>
      ) : (
        <p className="mt-2 text-label leading-5 text-ink-400">
          ยอดในระบบยังบันทึกเต็มไว้ใช้ออกใบแจ้งหนี้ต่อได้ ไม่ว่าคุณจะเลือกแบบไหน
        </p>
      )}
    </div>
  );
}
