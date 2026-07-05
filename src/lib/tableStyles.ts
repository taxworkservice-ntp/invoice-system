// Table style tokens — old (warm stone) kept as reference, new (clean blue) active.
// To revert, swap TABLE = TABLE_OLD in the re-export at bottom.

/** Old warm-stone table tokens (backup) */
export const TABLE_OLD = {
  table: "w-full text-[13px]",
  theadTr: "bg-[#F7F6F3] border-b border-card-border text-left text-[11px] uppercase tracking-wide text-[#888780]",
  thSortable: "!text-[#888780] !text-[11px] !font-semibold !tracking-wide !uppercase",
  thStatic: "px-3 py-2 font-semibold",
  thStaticRight: "px-3 py-2 font-semibold text-right",
  tbodyTr: "border-b border-[#F0EFE9] last:border-0 hover:bg-[#FAFAF7] cursor-pointer transition-colors",
  tdDimmed: "px-3 py-2 text-[#888780]",
  tdRegular: "px-3 py-2 text-[#444441]",
  tdPrimary: "px-3 py-2 text-[#1A1A18] font-medium",
} as const;

/** New clean-blue table tokens (active) */
export const TABLE = {
  table: "w-full text-[11px]",
  theadTr: "border-b border-[#E6EBF2] bg-[#F4F7FB]",
  thSortable: "!text-[#111827] !text-[11px] !font-semibold",
  thStatic: "px-3 py-2 text-[11px] font-semibold text-[#111827]",
  thStaticRight: "px-3 py-2 text-[11px] font-semibold text-[#111827] text-right",
  tbodyTr: "border-b border-[#E6EBF2] hover:bg-[#F8FAFC] cursor-pointer transition-colors",
  tdDimmed: "px-3 py-2 text-[#667085]",
  tdRegular: "px-3 py-2 text-[#475467]",
  tdPrimary: "px-3 py-2 text-[#111827] font-medium",
  /** Tfoot row style */
  tfootTr: "border-t-[1.5px] border-[#C9D5E3] bg-[#F8FAFC] font-semibold text-[#111827]",
  /** Status pill badge */
  statusPill: "text-[10px] px-1.5 py-0.5 rounded font-medium",
  /** Table wrapper card */
  cardWrapper: "border-[0.5px] shadow-sm overflow-x-auto",
} as const;
