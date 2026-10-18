import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Card } from "../ui/Card";

/** Inline numbered heading — for cards whose structure can't use full FormStep. */
export function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-label font-semibold text-primary">
        {number}
      </span>
      <h3 className="text-body font-medium text-ink-900">{title}</h3>
    </div>
  );
}

/** Slim section progress — done → you are here → up next, readable at a glance. */
export interface FormProgressStep {
  label: string;
  state: "done" | "current" | "waiting" | "todo";
  /** Anchor id the node scrolls to when clicked. */
  targetId?: string;
}

/**
 * One-page-wizard rail: ordered nodes joined by connectors, all sections stay
 * visible and editable — the rail teaches order, never locks. done counts only
 * in wizard order; waiting = choice stored but blocked by an earlier step.
 */
export function FormProgress({
  steps,
  onSelect,
  className = "",
}: {
  steps: FormProgressStep[];
  onSelect?: (targetId: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-start ${className}`} role="list" aria-label="ความคืบหน้า">
      {steps.map((step, index) => {
        const clickable = step.targetId != null && onSelect != null;
        const targetId = step.targetId;
        const content = (
          <>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label font-semibold leading-none ${
                step.state === "done"
                  ? "border border-success-border bg-paid-bg text-paid-text"
                  : step.state === "current"
                    ? "bg-primary text-white"
                    : step.state === "waiting"
                      ? "border border-dashed border-line-strong bg-white text-paid-text"
                      : "border border-card-border bg-white text-ink-400"
              }`}
            >
              {step.state === "done" || step.state === "waiting" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={`mt-1 block text-center text-label leading-4 ${
                step.state === "done"
                  ? "font-medium text-paid-text"
                  : step.state === "current"
                    ? "font-semibold text-primary-deep"
                    : step.state === "waiting"
                      ? "text-ink-500"
                      : "text-ink-400"
              }`}
            >
              {step.label}
              {step.state === "waiting" ? (
                <span className="block font-normal">รอขั้นตอนก่อนหน้า</span>
              ) : null}
            </span>
          </>
        );
        return (
          <Fragment key={step.label}>
            {index > 0 ? (
              <span
                aria-hidden
                className={`mx-1 mt-3 h-0.5 flex-1 rounded-full ${
                  steps[index - 1].state === "done" ? "bg-success" : "bg-line-soft"
                }`}
              />
            ) : null}
            <div role="listitem" className="flex min-w-0 shrink-0 flex-col items-center">
              {clickable && targetId != null ? (
                <button
                  type="button"
                  onClick={() => onSelect(targetId)}
                  className="flex min-w-0 flex-col items-center rounded-control px-1 py-0.5 transition-colors hover:bg-paper-soft"
                  title={`ไป${step.label}`}
                >
                  {content}
                </button>
              ) : (
                <span className="flex min-w-0 flex-col items-center px-1 py-0.5">{content}</span>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Standard numbered step section for document forms.
 * Every form declares its steps with this component so the flow reads
 * identically across invoice, receipt, DN, billing note and credit note.
 *
 * Pass `status` to show a live completion pill ("ครบแล้ว" / "ยังไม่ครบ")
 * next to the title — the step-by-step cue. The step never locks; the pill
 * and the save hint guide instead of blocking.
 */
/** Step flow state — done counts only in wizard order (own valid + all previous done).
 *  waiting = valid on its own but blocked by an earlier step; the stored choice
 *  is real, it just doesn't count toward progress yet. */
export type StepStatus = "done" | "waiting" | "todo";

export function FormStep({
  number,
  title,
  description,
  right,
  children,
  id,
  status,
  active,
}: {
  number: number;
  title: string;
  description?: string;
  /** Optional slot in the header's right side (counter pills, actions). */
  right?: ReactNode;
  /** Anchor id for guided-save scrolling. */
  id?: string;
  /** Live completion state — pill only, never disables the step. */
  status?: StepStatus;
  /** The step the guide currently points at — solid number badge. */
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Card id={id} tone={status === "done" ? "success" : undefined}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label font-semibold leading-none ${
              status === "done"
                ? "border border-success-border bg-paid-bg text-paid-text"
                : status === "waiting"
                  ? "border border-dashed border-line-strong bg-white text-paid-text"
                  : active
                    ? "bg-primary text-white"
                    : "bg-primary/10 text-primary"
            }`}
          >
            {status === "done" || status === "waiting" ? <Check className="h-3.5 w-3.5" /> : number}
          </span>
          <h3
            className={`text-body ${status === "done" || active ? "font-semibold" : "font-medium"} text-ink-900`}
          >
            {title}
          </h3>
          {status === "done" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-paid-bg px-2 py-0.5 text-label font-medium text-paid-text">
              <Check className="h-3 w-3" />
              ครบแล้ว
            </span>
          ) : status === "waiting" ? (
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-label font-medium text-ink-500">
              รอขั้นตอนก่อนหน้า
            </span>
          ) : status === "todo" ? (
            <span className="rounded-full bg-pending-bg px-2 py-0.5 text-label font-medium text-pending-text">
              ยังไม่ครบ
            </span>
          ) : null}
        </div>
        {right}
      </div>
      {description ? (
        <p className="-mt-1.5 mb-3 text-label leading-5 text-ink-500">{description}</p>
      ) : null}
      {children}
    </Card>
  );
}

/**
 * Report which of the given section ids currently owns the viewport.
 * Drives the desktop step rail — reflow-safe, no pixel measuring.
 */
export function useScrollSpy(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const list = key.split("|").filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    const elements = list
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element != null);
    if (elements.length === 0) return;
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [key]);
  return activeId;
}

/**
 * Vertical one-page-wizard rail (desktop): same steps and states as
 * FormProgress, sticky beside the sections. Clicking a node scrolls to it;
 * the in-view section gets a ring regardless of state. Mobile keeps the
 * horizontal strip — the rail hides below `lg`.
 */
export function FormStepRail({
  steps,
  onSelect,
  activeId,
  className = "",
}: {
  steps: FormProgressStep[];
  onSelect?: (targetId: string) => void;
  /** Section id currently in view (scrollspy) — navigation cue only. */
  activeId?: string | null;
  className?: string;
}) {
  return (
    <nav aria-label="ขั้นตอน" className={`hidden lg:block ${className}`}>
      {/* Clears the sticky app header (h-14 + hairline) with room to spare. */}
      <ol className="sticky top-20 flex flex-col">
        {steps.map((step, index) => {
          const inView = step.targetId != null && step.targetId === activeId;
          return (
            <li key={step.label} className="flex min-w-0 gap-2.5">
              <span aria-hidden className="flex w-6 shrink-0 flex-col items-center">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label font-semibold leading-none ${
                    step.state === "done"
                      ? "border border-success-border bg-paid-bg text-paid-text"
                      : step.state === "current"
                        ? "bg-primary text-white"
                        : step.state === "waiting"
                          ? "border border-dashed border-line-strong bg-white text-paid-text"
                          : "border border-card-border bg-white text-ink-400"
                  } ${inView ? "ring-2 ring-primary/25" : ""}`}
                >
                  {step.state === "done" || step.state === "waiting" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                {index < steps.length - 1 ? (
                  <span
                    className={`w-0.5 flex-1 rounded-full ${
                      step.state === "done" ? "bg-success" : "bg-line-soft"
                    }`}
                  />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-col items-start gap-1 pb-6 pt-0.5">
                {step.targetId != null && onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(step.targetId!)}
                    className={`min-w-0 rounded-control px-1 py-0.5 text-left text-label leading-4 transition-colors hover:bg-paper-soft ${
                      inView
                        ? "font-semibold text-primary-deep"
                        : step.state === "done"
                          ? "font-medium text-paid-text"
                          : step.state === "current"
                            ? "font-semibold text-primary-deep"
                            : step.state === "waiting"
                              ? "text-ink-500"
                              : "text-ink-400"
                    }`}
                    title={`ไป${step.label}`}
                  >
                    {step.label}
                    {step.state === "waiting" ? (
                      <span className="block font-normal">รอขั้นตอนก่อนหน้า</span>
                    ) : null}
                  </button>
                ) : (
                  <span
                    className={`min-w-0 px-1 py-0.5 text-label leading-4 ${
                      inView
                        ? "font-semibold text-primary-deep"
                        : step.state === "done"
                          ? "font-medium text-paid-text"
                          : step.state === "current"
                            ? "font-semibold text-primary-deep"
                            : step.state === "waiting"
                              ? "text-ink-500"
                              : "text-ink-400"
                    }`}
                  >
                    {step.label}
                    {step.state === "waiting" ? (
                      <span className="block font-normal">รอขั้นตอนก่อนหน้า</span>
                    ) : null}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
