import type { DealPhase, DealStepState } from "../../lib/dealWorkflow";
import { getDealLifecycleSteps } from "../../lib/dealWorkflow";
import { Check, Minus } from "lucide-react";

const NODE_CLASS: Record<DealStepState, string> = {
  done: "border border-success-border bg-paid-bg text-paid-text",
  current: "bg-primary text-white ring-4 ring-primary/15",
  skipped: "border border-dashed border-line-strong bg-paper-field text-ink-300",
  todo: "border border-card-border bg-white text-ink-400",
};

const LABEL_CLASS: Record<DealStepState, string> = {
  done: "font-medium text-paid-text",
  current: "font-semibold text-primary-deep",
  skipped: "text-ink-400",
  todo: "text-ink-400",
};

export interface DealLifecycleProps {
  phase: DealPhase;
  skipped?: DealPhase[];
  onSelect?: (phase: DealPhase) => void;
  canSelect?: (phase: DealPhase) => boolean;
  className?: string;
  ariaLabel?: string;
}

export function DealLifecycle({
  phase,
  skipped = [],
  onSelect,
  canSelect,
  className = "",
  ariaLabel = "ขั้นตอนงานขาย",
}: DealLifecycleProps) {
  const steps = getDealLifecycleSteps(phase, skipped);

  return (
    <div className={className}>
      <ol
        aria-label={ariaLabel}
        className="grid grid-cols-5 items-start gap-1 sm:flex sm:min-w-max sm:items-start"
      >
        {steps.map((step, index) => {
          const current = step.state === "current";
          const selectable = onSelect != null && (canSelect ? canSelect(step.phase) : true);
          const node = (
            <>
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label font-semibold leading-none ${NODE_CLASS[step.state]}`}
              >
                {step.state === "done" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : step.state === "skipped" ? (
                  <Minus className="h-3.5 w-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`mt-1 block whitespace-normal text-center text-label leading-4 sm:whitespace-nowrap ${LABEL_CLASS[step.state]}`}
              >
                {step.label}
              </span>
              {step.state === "skipped" ? (
                <span className="mt-0.5 block whitespace-nowrap text-center text-label leading-4 text-ink-300">
                  ข้าม
                </span>
              ) : null}
            </>
          );

          return (
            <li
              key={step.phase}
              className="flex min-w-0 items-start justify-center sm:justify-start"
            >
              {selectable ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(step.phase)}
                  aria-current={current ? "step" : undefined}
                  aria-label={step.state === "skipped" ? `${step.label} (ข้าม)` : step.label}
                  title={`ไป${step.label}`}
                  className="flex min-h-11 flex-col items-center rounded-control px-1 pt-1 transition-colors hover:bg-paper-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:min-h-0"
                >
                  {node}
                </button>
              ) : (
                <div
                  aria-current={current ? "step" : undefined}
                  className="flex flex-col items-center px-1 pt-1"
                >
                  {node}
                </div>
              )}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`mx-2 mt-3 hidden h-0.5 w-8 shrink-0 rounded-full sm:block ${
                    step.state === "done" ? "bg-success" : "bg-line-soft"
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
