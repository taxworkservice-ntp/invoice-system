import { useDevMode } from "../../hooks/useDevMode";

export function DevBadge() {
  const { isDevMode, devEffectiveDate } = useDevMode();
  if (!isDevMode) return null;
  return (
    <span
      className="ml-2 inline-flex items-center rounded-full bg-warning-soft px-2 py-0.5 text-label font-semibold text-warning-text border border-warning-border"
      title={devEffectiveDate ? `DEV date: ${devEffectiveDate}` : "DEV mode"}
    >
      {devEffectiveDate ? `DEV ${devEffectiveDate}` : "DEV"}
    </span>
  );
}
