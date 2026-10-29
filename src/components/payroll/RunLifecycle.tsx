import { Check } from "lucide-react";
import type { PayrollRun } from "../../types";

const STEPS = ["กรอกข้อมูล", "ตรวจสอบ", "ปิดรอบ", "ภาษี/สลิป"] as const;

/**
 * The run's position in the close process. Completion is never colour-only:
 * each step carries a number or a check, and the current step is labelled.
 */
export function RunLifecycle({ run, ready }: { run: PayrollRun | null; ready: boolean }) {
  if (!run) return null;

  const finalized = run.status === "finalized";
  const current = finalized ? 3 : ready ? 2 : 1;
  const done = finalized ? 3 : ready ? 2 : 1;

  return (
    <ol
      className="flex w-full items-center gap-2 overflow-x-auto sm:gap-1"
      aria-label="ขั้นตอนปิดรอบ"
    >
      {STEPS.map((label, index) => {
        const complete = index < done || (finalized && index <= 3);
        const active = index === current && !finalized;
        return (
          <li key={label} className="flex shrink-0 items-center gap-1.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-label font-semibold ${
                complete
                  ? "bg-success-soft text-success-text"
                  : active
                    ? "bg-primary text-white"
                    : "bg-ink-50 text-ink-400"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {complete ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span
              className={`whitespace-nowrap text-label ${
                active ? "font-semibold text-ink-900" : complete ? "text-ink-600" : "text-ink-400"
              }`}
            >
              {label}
            </span>
            {index < STEPS.length - 1 && (
              <span className="mx-1 hidden h-px w-4 flex-1 bg-line sm:block" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
