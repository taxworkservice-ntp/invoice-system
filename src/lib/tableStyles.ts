/**
 * Table tokens — the single table style for the whole app.
 *
 * Type roles (src/design/tokens.ts): body cells 14px, header labels 12px.
 * Thai headers are NOT uppercased and carry no letter-spacing —  is a
 * no-op for Thai and tracking reads wrong, so headers rely on weight + color.
 *
 * Sticky first column: capped at ~42vw on phones so a long customer / item
 * name can't eat half the viewport; uncapped from `md` up where tables have
 * room. Pair sticky headers with `min-w-[140px] md:min-w-[180px]` (or the
 * 200px variant) and keep cell content in a `min-w-0` + `truncate` wrapper.
 */
export const TABLE = {
  table: "w-full text-body text-ink-700",
  theadTr: "border-b border-line bg-paper-field text-left",
  thSortable: "!text-label !font-semibold !text-ink-500",
  thStatic: "px-3 py-2 text-label font-semibold text-ink-500",
  thStaticRight: "px-3 py-2 text-label font-semibold text-ink-500 text-right",
  tbodyTr:
    "border-b border-line-faint last:border-0 hover:bg-paper-field cursor-pointer transition-colors",
  tdDimmed: "px-3 py-2 text-ink-400",
  tdRegular: "px-3 py-2 text-ink-700",
  tdPrimary: "px-3 py-2 text-ink-900 font-medium",
  tfootTr: "border-t border-line-strong bg-paper-field font-semibold text-ink-900",
  statusPill: "text-label px-2 py-0.5 rounded-full font-medium",
  cardWrapper: "border-[0.5px] border-card-border rounded-card overflow-x-auto bg-white",
  scrollBody: "overflow-x-auto [-webkit-overflow-scrolling:touch]",
  thSticky:
    "sticky left-0 z-20 bg-paper-field border-r border-line max-w-[42vw] md:max-w-none",
  tdSticky:
    "sticky left-0 z-10 bg-white border-r border-line group-hover:bg-paper-field max-w-[42vw] md:max-w-none",
} as const;
