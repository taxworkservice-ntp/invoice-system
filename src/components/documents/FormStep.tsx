import type { ReactNode } from "react";
import { Card } from "../ui/Card";

/** Inline numbered heading — for cards whose structure can't use full FormStep. */
export function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {number}
      </span>
      <h3 className="text-sm font-medium text-ink-900">{title}</h3>
    </div>
  );
}

/**
 * Standard numbered step section for document forms.
 * Every form declares its steps with this component so the flow reads
 * identically across invoice, receipt, DN, billing note and credit note.
 */
export function FormStep({
  number,
  title,
  description,
  right,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  /** Optional slot in the header's right side (counter pills, actions). */
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {number}
          </span>
          <h3 className="text-sm font-medium text-ink-900">{title}</h3>
        </div>
        {right}
      </div>
      {description ? (
        <p className="-mt-1.5 mb-3 text-xs leading-5 text-gray-500">{description}</p>
      ) : null}
      {children}
    </Card>
  );
}
