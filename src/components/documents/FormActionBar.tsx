import { Button } from "../ui/Button";

export interface FormActionButton {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * Sticky bottom action bar — the single save/commit pattern for document
 * forms. Shows context + running total on the left, actions on the right.
 */
export function FormActionBar({
  contextLabel,
  totalLabel = "ยอดสุทธิ",
  total,
  primary,
  secondary,
}: {
  contextLabel?: string;
  totalLabel?: string;
  total?: number;
  primary?: FormActionButton;
  secondary?: FormActionButton;
}) {
  return (
    <div className="sticky bottom-3 z-10 rounded-xl border border-card-border bg-page-bg/95 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {contextLabel ? (
            <div className="truncate text-xs text-gray-500">{contextLabel}</div>
          ) : null}
          {typeof total === "number" ? (
            <div className="mt-0.5 text-base font-semibold tabular-nums text-ink-900">
              {totalLabel} ฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {secondary ? (
            <Button
              variant="secondary"
              onClick={secondary.onClick}
              loading={secondary.loading}
              disabled={secondary.disabled}
            >
              {secondary.label}
            </Button>
          ) : null}
          {primary ? (
            <Button
              onClick={primary.onClick}
              loading={primary.loading}
              disabled={primary.disabled}
            >
              {primary.label}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
