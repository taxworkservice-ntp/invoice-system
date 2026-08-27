import type { PayrollLineItem } from "../../types";

export type RecurringDirection = "addition" | "deduction";

export interface RecurringTemplate {
  id: string;
  employee_id: string;
  direction: RecurringDirection;
  label: string;
  amount: number;
  active: boolean;
  sort_order: number;
}

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Merge active recurring templates into a payroll line item clone.
 * - Templates append as additions/deductions in sort_order.
 * - A template whose label already exists (case-insensitive) in that direction
 *   is skipped, preventing double-counting of manually entered rows.
 * - Source object is never mutated; caller decides when to persist the merged copy
 *   (template rows become ordinary stored values on save — snapshot semantics).
 */
export function applyRecurringTemplates(
  source: Pick<PayrollLineItem, "additions" | "deductions">,
  templates: RecurringTemplate[],
): Pick<PayrollLineItem, "additions" | "deductions"> {
  const active = templates
    .filter((t) => t.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

  const additions = [...source.additions];
  const deductions = [...source.deductions];

  for (const t of active) {
    if (t.direction === "addition") {
      if (additions.some((a) => sameLabel(a.label, t.label))) continue;
      additions.push({ label: t.label, amount: Number(t.amount) || 0 });
    } else {
      if (deductions.some((d) => sameLabel(d.label, t.label))) continue;
      deductions.push({ label: t.label, amount: Number(t.amount) || 0 });
    }
  }

  return { additions, deductions };
}

export function countTemplateAdds(source: Pick<PayrollLineItem, "additions" | "deductions">, templates: RecurringTemplate[]): number {
  const base = templates.filter((t) => t.active && !sameLabelExists(source, t)).length;
  return base;
}

function sameLabelExists(source: Pick<PayrollLineItem, "additions" | "deductions">, t: RecurringTemplate): boolean {
  const list = t.direction === "addition" ? source.additions : source.deductions;
  return list.some((x) => sameLabel(x.label, t.label));
}
