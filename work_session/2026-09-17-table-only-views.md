# 2026-09-17 — Table-only views + professional table polish

## Rollback

- Backup branch: `backup/table-only-before` + tag `backup-table-only-before`
- Rollback: `git reset --hard backup-table-only-before` (changes left uncommitted on `main`)
- No Supabase migration pending.

## What changed

- Removed all view switchers (full cleanup, table-only):
  - `/home` (`src/app/(client)/home.tsx`): dropped `homeViewMode` state, `ViewToggle`,
    grid + list/`DealCard` branches. Active section is now one table.
  - `/customers` (`index.tsx`): dropped `customersViewMode`, grid + list branches.
  - `/customers/:id` deal history (`[id].tsx`): dropped
    `customer_deal_history_view` (incl. auto-upgrade effect), mobile card
    duplication + grouped card list. One 3-col table.
  - `/catalog` (`CatalogList.tsx` + `StockReportTable.tsx`): dropped
    `catalogViewMode`, grid/list `ItemCard` branches, `StockRowMobile`
    split. One scrollable table.
  - `/wht` vendors (`wht/index.tsx`): dropped grid branch (was default-off
    anyway). Records tab untouched (already table-only).
- Deleted now-unused components: `ui/ViewToggle.tsx`, `home/DealCard.tsx`,
  `home/DoneDealCard.tsx`, `catalog/ItemCard.tsx`.
- Professional polish (all tables): `TABLE.cardWrapper` + `scrollBody`
  wrappers, customer/name column first + sticky (`thSticky`/`tdSticky` in
  `src/lib/tableStyles.ts`), `SortableTh` kept everywhere, money
  `text-right tabular-nums` (never hidden on mobile), unified two-line
  updated-at format, `title` attrs on truncated cells, `py-3 md:py-2`
  touch targets, `group` row hover covering sticky cells.
- Active/deals-done unification: customer-first column order, deal number
  `ink-900` (done table lost its green-mono outlier), done min-w
  `1100px table-fixed` → `900px` auto layout, items column scrolls instead
  of `hidden sm`.

## Verification

- `tsc --noEmit`: clean. `lint`: 0 errors (remaining warnings pre-existing;
  confirmed `Badge`/`ArrowRight` in `[id].tsx` pre-date this change).
  `lint:design`: passed. Prettier: touched files are prettier-clean.
- NOT run: `test:ui-snapshots` (no Playwright browsers in this env) —
  baselines WILL need `npm run test:ui-snapshots:update` (toggles/cards gone).
  Manual check still needed at 360/390px + desktop: /home, /customers,
  /customers/:id, /catalog, /wht.

## Note: incidental reformat

- The 7 touched source files were prettier-dirty at HEAD (like most of the
  repo — verified `documents/index.tsx`, `reports/index.tsx` are dirty too).
  They are now fully prettier-clean, so the diff includes whole-file
  reformatting (most visible in `wht/index.tsx`: 1357 → 1849 lines from
  line-wrap expansion, no duplication — verified single `WhtPage`).
- Functional changes are as described above; review with whitespace/wrap
  tolerance. Rollback unaffected (backup branch predates everything).

## Follow-ups

- Stale localStorage keys (`homeViewMode`, `customersViewMode`,
  `catalogViewMode`, `customer_deal_history_view`) are abandoned, not
  migrated — harmless.
- `StockRow` keeps red/amber left-border stock signals; `textColor` for the
  stock cell kept as-is.
