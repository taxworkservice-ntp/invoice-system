# 2026-09-17 — One content container owned by AppShell

## Rollback

- Backup branch: `backup/container-before` + tag `backup-container-before`
  (points at `d4adfee`, the table-only work).
- Rollback: `git reset --hard backup-container-before`.
- No Supabase migration pending.

## Problem

`DESIGN-SYSTEM.md` §6 prescribed a single `max-w-page` (1536) for data pages and
`max-w-4xl` for forms, but the code did neither:

- `/home` only was `max-w-screen-2xl` (via a `wide` boolean); the other 25
  `AppShell` pages were `max-w-7xl`.
- Breadcrumbs hardcoded `max-w-7xl` regardless of `wide` (latent misalignment).
- Admin hand-rolls its own shell; `(admin)/clients/new.tsx` had a `max-w-4xl`
  header above a `max-w-2xl` body.
- `contentWidth.form` was a dead token; `max-w-page` was never used.

A fixed 1536 cap also can't serve modern monitors: with the 256px sidebar a
1920 desktop has only ~1664px of content area, so the cap wastes space.

## New policy (DESIGN-SYSTEM.md §6)

The shell owns width; pages never set their own.

| Token        | Width              | Applies to                                               |
| ------------ | ------------------ | -------------------------------------------------------- |
| `max-w-page` | fluid, capped 2048 | data pages (default)                                     |
| `max-w-form` | 896, fixed         | settings + simple create/edit forms                      |
| `max-w-row`  | 1280               | fixed-count rows inside a page (KPI strips, filter bars) |

Data pages are fluid, so the 2048 cap only engages on ultrawide/4K (with the
sidebar it needs a ~2368px viewport to bind). Rows whose item count can grow get
a `3xl:` (1792px) column step instead of a cap; tables always fill.

## What changed

- `src/design/tokens.ts`: `contentWidth = { page: 2048px, form: 896px,
row: 1280px }`, new `screens = { "3xl": 1792px }`, `ContentProfile` type and
  `contentClass` map. `tailwind.config.ts` exposes `max-w-page/form/row` and
  `extend.screens`.
- `AppShell.tsx` / `TopBar.tsx`: `wide?: boolean` → `width?: "data" | "form"`
  (default `data`). One `containerClass` is applied to the top bar, breadcrumbs
  and `<main>`, so they can no longer disagree. Removed the two `wide` call
  sites in `home.tsx`.
- Form profile applied to 10 pages (18 `AppShell` sites): `settings/*` (8),
  `catalog/new.tsx`, `catalog/edit.tsx`. Document editors (`deals/new`,
  `documents/edit`, `documents/edit-utility`) intentionally stay at data width
  because of their line-item tables.
- Row caps (`max-w-row`): `SummaryRow`, `reports` KPI skeleton, `documents`
  filter bar, `wht` stat cards, `payroll` summary cards. Reflow at `3xl`:
  `download-center` preset grid (7 items).
  - Deliberately untouched: `payroll` modal info grid (inside `Modal size=xl`)
    and the payroll print block (print layer).
- `(admin)/clients/new.tsx`: body `max-w-2xl` → `max-w-4xl` to match its header
  and the rest of the admin surface.
- `scripts/check-design-system.mjs`: two new rules — `retired page container`
  (`max-w-screen-2xl` / `max-w-7xl`) and `per-page container width`
  (`max-w-page` / `max-w-form` outside `src/design/tokens.ts` and
  `src/components/layout/`). Both verified to fire (probe file → 2 violations,
  while `max-w-row` correctly stays allowed).
- `playwright.config.ts` + `e2e/visual.spec.ts` + `package.json`: new
  `visual-wide` project at 1920×1080 covering `/home`, `/documents`, `/wht`
  (the pages where the container/row caps bind). 1280 baselines cannot see a
  width change at all, which is why this project exists.

## Verification

- `npx tsc -b`: clean. **Note:** `tsc --noEmit` is a NO-OP in this repo —
  `tsconfig.json` is solution-style (`"files": []`), so it exits 0 without
  checking anything. Always use `tsc -b` (or `npm run build`).
- `npm run build`: passes; confirmed the generated CSS contains
  `.max-w-page{max-width:2048px}`, `.max-w-form{max-width:896px}`,
  `.max-w-row{max-width:1280px}` and the
  `@media(min-width:1792px){.3xl\:grid-cols-4{...}}` step.
- `npm run lint`: 0 errors, 102 warnings (all pre-existing; the 3 warnings in
  changed files are untouched `profile`-unused / exhaustive-deps).
  `lint:design`: passed.
- NOT run: `test:ui-snapshots`. No Playwright browsers in this environment, so
  the `visual-wide` baselines are **not generated yet** — run
  `npm run test:ui-snapshots:update` locally to create
  `*-visual-wide-win32.png`. The `settings-documents` 1280 baseline WILL churn
  (1280 → 896 form width); other 1280 baselines should not move.
- Manual pass still required at 1366 / 1920 / 2560 / 3440 — the change is
  invisible to the 1280 baselines by construction.

## Follow-ups

- Formatting: the first pass reformatted whole files (editor tooling), which made
  the changeset inconsistent. It was redone with CRLF-aware codemods so every
  changed line is intentional. Verified: **no changed `src/**` file differs in
  prettier conformance from HEAD** — the clean ones (`catalog/new.tsx`,
  `home.tsx`, `wht/index.tsx`, `tokens.ts`) stayed clean, and the already-dirty
  ones stayed dirty. A repo-wide `npm run format` is still worth a separate,
  formatting-only commit; do not mix it into semantic changes.
- Admin still hand-rolls its shell (`(admin)/clients*.tsx`) rather than sharing
  an `AdminShell`. Its widths are now internally consistent; adopting the shared
  container would be the next step.
- `payroll/index.tsx` has four grids; only the 4-card summary row was capped.
  The remaining three (a `<details>` text stat block, a modal info grid, a print
  block) were reviewed and intentionally left uncapped.
