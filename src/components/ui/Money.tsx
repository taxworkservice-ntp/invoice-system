import { formatCurrency } from "../../lib/format";

interface MoneyProps {
  value: number | null | undefined;
  /** Leading currency marker; pass "" to render the bare number. */
  prefix?: string;
  className?: string;
}

/**
 * Renders one money amount with consistent spacing and tabular figures so
 * columns of numbers line up. Use everywhere instead of ad-hoc `฿ {x}`.
 */
export function Money({ value, prefix = "฿", className = "" }: MoneyProps) {
  return (
    <span className={`tabular-nums ${className}`.trim()}>
      {prefix}
      {formatCurrency(value ?? 0)}
    </span>
  );
}
