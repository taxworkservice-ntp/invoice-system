import { useDevMode } from "../../hooks/useDevMode";

export function DevBadge() {
  const { isDevMode } = useDevMode();
  if (!isDevMode) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 border border-amber-300">
      DEV
    </span>
  );
}
