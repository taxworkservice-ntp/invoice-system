// Table style tokens — old (warm stone) kept as reference, new (clean blue) active.
// To revert, swap TABLE = TABLE_OLD in the re-export at bottom.

/** Old warm-stone table tokens (backup) */
export const TABLE_OLD = {
  table: "w-full text-[13px]",
  theadTr: "bg-page-bg border-b border-card-border text-left text-[11px] uppercase tracking-wide text-ink-300",
  thSortable: "!text-ink-300 !text-[11px] !font-semibold !tracking-wide !uppercase",
  thStatic: "px-3 py-2 font-semibold",
  thStaticRight: "px-3 py-2 font-semibold text-right",
  tbodyTr: "border-b border-line-faint last:border-0 hover:bg-paper-field cursor-pointer transition-colors",
  tdDimmed: "px-3 py-2 text-ink-300",
  tdRegular: "px-3 py-2 text-ink-700",
  tdPrimary: "px-3 py-2 text-ink-900 font-medium",
} as const;

/** New clean-blue table tokens (active) */
export const TABLE = {
  table: "w-full text-[11px]",
  theadTr: "border-b border-cool-100 bg-cool-50",
  thSortable: "!text-cool-900 !text-[11px] !font-semibold",
  thStatic: "px-3 py-2 text-[11px] font-semibold text-cool-900",
  thStaticRight: "px-3 py-2 text-[11px] font-semibold text-cool-900 text-right",
  tbodyTr: "border-b border-cool-100 hover:bg-cool-25 cursor-pointer transition-colors",
  tdDimmed: "px-3 py-2 text-cool-400",
  tdRegular: "px-3 py-2 text-cool-500",
  tdPrimary: "px-3 py-2 text-cool-900 font-medium",
  /** Tfoot row style */
  tfootTr: "border-t-[1.5px] border-cool-300 bg-cool-25 font-semibold text-cool-900",
  /** Status pill badge */
  statusPill: "text-[10px] px-1.5 py-0.5 rounded font-medium",
  /** Table wrapper card */
  cardWrapper: "border-[0.5px] shadow-sm overflow-x-auto",
} as const;
