# 2026-10-30 — Deal workflow: canonical model + professional UI pass

## Scope

One derived deal workflow, shared lifecycle/status/next-step components, the deal
detail page wired to them, and a consolidation pass on the page's duplicated
actions. No database, schema, document-state-machine, money or print changes.

## Rollback checkpoint

- Tag: `checkpoint/pre-deal-workflow-2026-10-30` → `e2cb623`.
- Full rollback:
  `git reset --hard checkpoint/pre-deal-workflow-2026-10-30`
  then remove the new files listed below.

## Canonical workflow

- `src/lib/dealWorkflow.ts` (new) owns `deriveDealStage()`:
  `stageLabel`, `stageHint`, `queue`, `phase`, `skipped`, `isManual`, plus
  `getDealLifecycleSteps()` and the five phase labels/order.
- Home (`src/app/(client)/home.tsx`) now consumes it; the local `getStageInfo`
  and its helpers were deleted. Labels/queues are shared between Home and the
  deal page.
- Five phases: ใบเสนอราคา → ส่งของ → ออกบิล → เก็บเงิน → เสร็จ.
- A manual stage still overrides only the Home-facing label/queue; the lifecycle
  phase stays factual. The existing DB trigger audit of `manual_stage` is
  unchanged.
- Not yet modelled: the combined-billing branch (`billedIn` /
  `billingSourceDeals`). The deal page still shows its existing "billed in deal
  DL-xxxx" reference, but the lifecycle does not yet render a branch state.

## Components

- `src/components/deal/DealLifecycle.tsx` — accessible five-step rail,
  `done/current/skipped/todo`, `aria-current`, 44px mobile targets, token colours,
  click-to-document. On mobile it becomes a 5-column grid; desktop keeps the
  connector rail.
- `src/components/deal/DealStatusPill.tsx` — one `rounded-full` status pill for
  phase/overdue/manual.
- `src/components/deal/DealStageMenu.tsx` — the manual override moved from a
  native `<select>` into a `⋯` menu with "อัตโนมัติ", permission gating, outside
  click and Escape.
- `src/components/deal/NextStepPanel.tsx` — one card grammar for both a single
  next step and a two-option choice. `NextStepChoice.tsx` is now a re-export.
- `src/lib/dealStatus.ts` — removed the now-dead `getStatusPill`.

## Deal page

- Header: one status pill + `⋯`; no inline manual-stage select.
- Workflow card: `DealLifecycle` + one `NextStepPanel`; the duplicated
  `actionHint`/`actionHelper` boxes are gone (the due-date/document context line
  remains).
- Removed the repeated delivery-note list (history already lists every document).
- "จัดการเอกสารล่าสุด" now names the active document, drops the duplicate print
  entry, and groups the Dev doc-number override + dev delete under "เครื่องมือ Dev".
- Per-document print in history is now an icon button; the header keeps the single
  primary print entry.
- Raw red/amber/green/blue/emerald utilities in the workflow, alerts, history
  badges and management card were mapped to `danger/warning/success/primary`
  tokens. Home queue dots were tokenised too (no more `violet`/`emerald` dots).
- Terminology: deal-page/Home UI now says "งานขาย"; the two Home table headers
  were changed from "เลขที่ดีล" to "เลขที่งานขาย".
- Page size: 3,524 → 3,413 lines. Header/history/management extraction is still
  pending.

## Verification

- `npx tsc -b --force` — clean.
- `npm run lint` — 0 errors, 86 pre-existing warnings; design/form/year checks pass.
- `npm run build` — passed.
- `npx vitest run tests/unit --exclude tests/unit/pdfWarm.test.ts` — 286 passed.
  `pdfWarm.test.ts` is a pre-existing failure (expects no `layoutVersion`, code
  sends `3`).
- `npx playwright test e2e/deal-flow-journey.spec.ts --project=journeys` — 14/14.
- `npx playwright test e2e/next-step-choice.spec.ts --project=journeys` — 4/4
  (including a new single-action card case).
- Visual QA at 1280 and 390 on quotation / sent-invoice / sent-delivery deals.
  Visual baselines were NOT refreshed: the shared test workspace currently holds
  accumulated QA deals, so a recapture would bake data drift into the PNGs.
  Recapture on a clean workspace with
  `--project=visual --project=visual-wide --grep "visual: (home|deals)" --update-snapshots`.

## Pending

- Combined-billing lifecycle branch state.
- Extract `DealHeader`, `DealDocumentHistory` and `DealManagementCard` to cut the
  remaining monolith.
- Tablist keyboard/`aria-controls` and any remaining minor a11y polish.
- Add the deal detail page to the visual suite (currently only the deals list is
  captured).
- No print-layout checks rerun; print code was not touched.
- No migrations were added.
