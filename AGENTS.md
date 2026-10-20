# AGENTS.md — Agent Working Rules

## Communication

- **Always respond in English** in chat, explanations, and commit messages.
- Thai appears only inside user-facing strings (printed-document labels, UI text)
  and code where the app itself is customer-facing.

## Project

- Invoice management system for small Thai businesses.
  React (Vite) + TypeScript + Tailwind frontend · Supabase backend · Vercel hosting ·
  client-side PDF generation (jsPDF / HTML capture).
- Full specification: `invoice-system-master-prompt.md` (read before working on
  templates, fonts, pagination, or settings).
- Design system: `DESIGN-SYSTEM.md` (read before touching any UI). Tokens live in
  `src/design/tokens.ts`; Tailwind imports them. Never hardcode px sizes or hex
  colours — use a token.
- Session handoffs: `work_session/` (latest file = most recent state).

## Workspace & tooling

- Test workspace: `testcompany@gmail.com` (`test1234`). The client-side
  Supabase values live in `.env.local` (`VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY`) — they are public by design and inlined into the
  browser bundle.
- Local API (`/api/*`): the app proxies to a separate dev server — run
  `npm run dev:api` (port 8787) alongside `npm run dev`.
- **Local mode (no server secrets).** Vercel stores the server secrets as
  "sensitive", so `vercel env pull` cannot download them. `.env.local`
  therefore sets `DEV_STORAGE_DIR=.local-storage`, and the API runs without a
  service-role key:
  - storage → files on disk under `.local-storage/` (not the R2 bucket);
  - supabase → the caller's own session (anon key + their JWT), so every query
    is bounded by RLS.
    Uploads, the logo/image proxy, the PDF cache and PDF export all work this
    way; PDF export renders the **local** app through local Chrome.
    The Supabase admin API (member / workspace management) needs the real
    `SUPABASE_SERVICE_ROLE_KEY` and stays unavailable in local mode.
- With the real secrets set, the server picks R2 and the service-role client
  automatically — no code change. `npm run check:env` reports which mode is
  active; the dev server prints it at startup.
- Mock data: `npm run seed:mock` (interactive generator), `npm run seed:mock:clean`
  (removes `[MOCK]`-tagged data only). All generated deals/docs are tagged `[MOCK]`.
- Print-layout regression: `npm run test:print-layout` /
  `npm run test:print-layout:update` (see scripts/print-layout-regression.mjs).
  **Pixel baselines are per platform** (`tests/print-layout/baselines/<platform>/`)
  because font rasterisation differs between macOS, Windows and Linux — a
  baseline captured on one platform reports thousands of changed pixels on
  another while the layout is identical. A platform without baselines skips the
  pixel comparison with a message; capture them with
  `npm run test:print-layout:update`. The baselines also carry the print layout
  version they were captured with (`baselines/<platform>/layout.json`): a layout
  change makes them stale, and the check then skips with a message instead of
  reporting the change as a pixel failure. The **portable** gate is the geometry
  conformance checks: `npm run test:print-layout:estimate` (model vs rendered
  heights) and `npm run test:print-layout:fill` (a filled page must never grow
  past A4) — both measure millimetres, so they work on every platform.
  All four scripts find the local Chrome/Edge themselves
  (`scripts/print-layout-chromium.mjs`); the bundled `@sparticuz/chromium`
  binary is Linux-only.
- Pagination checks: `npx tsx tests/print-layout/pagination.many.check.ts`.
- Lint: `npm run lint` (ESLint + design-system check) / `npm run lint:design`
  (tokens, neutrals, shadows, type roles). `npm run format` runs Prettier.
- UI snapshots: `npm run test:ui-snapshots` /
  `npm run test:ui-snapshots:update` (Playwright, reuses the e2e auth session).

## Conventions worth knowing

- **Printing a document** (`/documents/:id/print`): the preview shows the whole
  document — the original and the copy, in the order and paging the toolbar
  controls — and the toolbar offers the three ways to get it: both copies in
  one file ("2 ฉบับ รวมไฟล์เดียว", the primary action), one copy ("ต้นฉบับ" /
  "สำเนา"), or two files (the ZIP). "พิมพ์" prints the same combined document
  the preview shows. Every one of them goes through
  `POST /api/documents/:id/pdf` — the server renders the same page in headless
  Chrome and sends the PDF back. The browser's own print (Ctrl+P)
  uses the `@media print` rules in `src/index.css` (fixed 210×297mm page
  boxes, so a document page is one physical page, clipped exactly like the
  PDF). Keep the two in step: the preview sheet and the export page box must
  stay the same geometry.
- The preview warns when a sheet is taller than A4 (the PDF clips it) and
  shows an error card when a sheet throws while rendering (the error boundary
  renders null, so a crash would otherwise be a blank page).
- **The cached PDF renders expire by themselves.** The cache key carries the print
  signature, so every layout or settings change leaves the previous renders
  behind as orphans. Give the bucket an expiration rule on the `pdfs/` prefix
  (Cloudflare → R2 → bucket → Settings → Object lifecycle rules, e.g. 30 days)
  and the orphans clean themselves up. `npm run cache:prune -- --orphans` removes
  the leftovers of an older layout now; `--all` flushes the cache (the next
  download re-renders the document).
- **The deal page's next step is a choice, not a button.** When the workflow
  offers two ways forward they render as a pair of choice cards
  (`src/components/deal/NextStepChoice.tsx`): both are blue so they read as
  pressable next to each other, and the fill intensity ranks them — the solid
  blue is the workflow's next step, the soft tint (`bg-primary-soft`) is the
  shortcut that skips a step. Each card states what the *customer* gets (and
  what the other path skips). The sides follow the path — the operational path
  (delivery / payment) reads first, the paperwork path (invoice / billing note)
  second — so a pair never moves when the deal's state changes.
- **The PDF cache is keyed by the print signature.** The key is
  `…/{variant}-{signature}.pdf`, where the signature is the layout version
  (the client sends `PRINT_LAYOUT_VERSION` from `src/constants/index.ts`) plus a
  fingerprint of the workspace's print settings (the server computes it from the
  client profile, `server/handlers/_lib/printSignature.js`). Bump the version
  whenever the print output changes; a settings change invalidates the cached
  renders by itself. Without the signature a document keeps serving the render
  from before the change while the preview shows the new one.
- **Classic V2 merged band rows.** The DN group heading and the project
  heading are merged cells, so the column rules stop at them. With
  `classic_v2_column_rules_continuous` (a workspace setting) they become
  normal rows: the heading text moves into the description column and wraps
  there, and the numeric cells stay empty but ruled. The print height model
  charges the narrower width in that mode (`dnGroupNarrow` /
  `narrowColumn`) — the paginator and the filler must agree, or the page
  budget and the rendered rows drift apart.
- **Classic V2 blank filler rows are measured, not modelled.** The filler rows
  pad the items table so the totals row and the signature band sit at the
  bottom of the page. The page measures its own free space (the gap the
  `margin-top: auto` pin opens, bounded by the A4 content box) and renders
  exactly the rows that fit — the height model only knows a row capacity, and
  a budget that ignored the real blocks let the filler push the sheet past A4
  (the PDF then clipped the bottom of the signature band). The count is a fixed
  point, so the page settles after one re-render; `npm run test:print-layout:fill`
  guards it.
- Classic V2 font sizes flow through CSS vars (`--classic-font-scale`,
  `--classic-fs-*`) — never hardcode pt sizes in the classic V2 template.
- Doc numbers come from `doc_number_sequences` — reserve/bump before inserting
  documents, never invent numbers.
- Supabase migrations in `sql/` are applied manually (Supabase SQL editor or
  Management API) — say so in the session record when one is pending.
