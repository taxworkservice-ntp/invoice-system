# Deal page speed — Session Record

_Session date: 2026-09-11. Focus: deal detail page (`/deals/:id`) load
performance. Earlier in the session: home page two-phase load, recency-first
active sort, cached Intl formatters (see git diff)._

## ⚠️ PENDING MIGRATION (manual — Supabase SQL editor)

- **`sql/20260911_get_deal_detail.sql`** — new `public.get_deal_detail(uuid)`
  RPC: single-round-trip deal-detail fetch (deal + customer + client dev
  fields + full documents/line-items/billing-links + activities + borrowed
  history + borrowed deal numbers), `SECURITY DEFINER` + explicit
  `is_client_workspace_member` check, grants to `authenticated` only.
- Safe to deploy app first: frontend tries `supabase.rpc("get_deal_detail")`
  and falls back to the legacy multi-query path on any failure (logs
  `[get_deal_detail RPC fallback]` to console). Until applied, the page
  behaves as Phase 1 below.

## Phase 1 — frontend-only (live without migration)

`src/app/(client)/deals/[id].tsx`:
- Removed unused `useBankAccounts` (a full `bank_accounts` fetch rode along
  with every deal open; PaymentModal loads its own data).
- Customer list now lazy: fetched on first picker open
  (`openCustomerPicker`/`addPickerCustomer`, narrow columns), cached per
  visit; pencil button disabled while loading.
- Narrow selects: deals (9 cols, was `*`), `client_profiles`
  (`user_id, dev_mode_enabled, dev_effective_date` — all this page uses),
  single customer (`id, name, phone, tax_id, address`), activities (8 cols),
  borrowed docs/lines (display-only cols incl. `vat_registered`,
  `issue_date`, `due_date` for borrowed cards). Own documents/line-items
  stay full-row (deal-scoped; needed by void-copy + variance paths).
- Two-phase paint: waves 1–3 (deal → profile/customer/docs/activities →
  lines/billing-links) paint immediately; borrowed history enriches after
  with stale-request guards (`dealRequestId`).
- `invoice_delivery_notes` count uses `select("invoice_id", head:true)`.

## Phase 2 — RPC (`get_deal_detail` + fallback)

- Shared `assembleDocsWithMeta` / `assembleBorrowedDocs` derivation used by
  both RPC and legacy paths — money/stage logic untouched, still TypeScript.
- `fetchDealData(silent)` — silent mode skips the skeleton (for SWR
  revalidation). Legacy completion invalidates the RPC cache entry.

## Phase 3 — cache + render

- New `src/lib/dealDetailCache.ts`: 60s TTL, 25-entry SWR cache + in-flight
  dedupe; `preloadDealDetail` on home table/grid row hover.
- Deal page mount: fresh-enough entry paints instantly, then silent
  revalidation. `Card` accepts `onMouseEnter`.
- Hoisted `sourceDocById` map out of per-invoice-row render.

## Verification

- `npx tsc -b` clean, `vite build` ok, `vitest run tests/integration`
  13 files / 53 tests pass.
- SQL reviewed manually (no local Postgres): shapes mirror the legacy
  queries; column names cross-checked against app usage. **Must be
  smoke-tested after applying**: open a billing-run deal (borrowed cards),
  a deal with DN variance badges, change-customer picker.
