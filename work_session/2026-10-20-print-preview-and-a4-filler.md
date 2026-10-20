# 2026-10-20 — Print preview: error surface, A4 overflow, printing, and the filler fix

## What changed

### Local dev without the server secrets

Vercel stores the server secrets as "sensitive", so `vercel env pull` cannot
download them — the local checkout had no way to upload or download a document.
Two switches now make local mode work end to end:

- `DEV_STORAGE_DIR=.local-storage` → the storage backend writes to disk
  (`server/handlers/_lib/r2.js`): R2 when the credentials are set, disk when
  they are not.
- No `SUPABASE_SERVICE_ROLE_KEY` → the API builds its Supabase client from the
  caller's own session (anon key + their JWT, `server/handlers/_lib/supabase.js`),
  so every query is bounded by RLS. The caller's token reaches the helper
  through a request context (`server/handlers/_lib/context.js`).

The Supabase admin API (member / workspace management) still needs the real
service-role key. `npm run check:env` reports the active mode.

### The document preview page (`/documents/:id/print`)

- **A crashed sheet is visible.** The error boundary renders null, so a broken
  document used to be an empty area (and a blank page in the PDF). The preview
  now shows an error card with the message; the export path logs it, so the
  PDF render log explains the blank page.
- **A page that overflows A4 is announced.** The preview measures each sheet
  and warns which pages are taller than A4 — the PDF clips them, so the user
  hears about it before downloading a truncated document.
- **"พิมพ์" prints without downloading.** The button opens the server-rendered
  PDF in a tab and prints it, so the paper equals the downloaded file on every
  platform. Ctrl+P prints the live preview through the `@media print` rules,
  which now pin fixed 210×297mm page boxes (one document page = one physical
  page, clipped exactly like the PDF).
- The hardcoded hex colours on the page are design tokens now.

### Classic V2 blank filler rows are measured, not modelled

The filler rows pad the items table so the totals row and the signature band
sit at the bottom. The height model only knows a row capacity, and it never
charged the blocks that really render on the page (the full page header, the
totals/terms/payment row, the signature band) — so the filler spent phantom
space and the sheet grew past A4. The exported PDF then clipped the bottom of
the signature band: 4 of the 60 most recent documents (2-page invoices with DN
groups) had a last page of 304–306mm.

The page now measures its own free space — the gap the `margin-top: auto` pin
opens, bounded by the A4 content box — and renders exactly the rows that fit.
The count is a fixed point, so the page settles after one re-render. The
regression came from 21d7de6, which made the filler fill the model's budget
instead of the page's.

### The preview toolbar

The preview shows the whole document — the original and the copy, in the
order and paging the toolbar controls — and the toolbar offers the three ways to
get it: both copies in one file (the primary action), one copy, or two files.
"พิมพ์" prints the same combined document the preview shows. The copy type is
named in exactly one place (the two small buttons); the old "ประเภท" toggle
and the "บันทึกเป็น PDF" button are gone.

### The preview toolbar (earlier draft)

The copy type (ต้นฉบับ/สำเนา) is two compact buttons in the action row —
each half the width of the download button — instead of a segmented toggle, and the
primary tint moved to "2 ฉบับ รวมไฟล์เดียว". The print button is gone: printing is
the browser's own (Ctrl+P), which the `@media print` rules keep on the same A4 page
boxes as the PDF.

## Bugs fixed

1. The dead `refCollapse` chain (server flag → URL param → cache suffix →
   template prop → `dn_summary` batch → the DN summary table) is gone; the
   mode is decided when the document is created.
2. The pixel baselines could not run on Windows at all (the bundled
   `@sparticuz/chromium` is Linux-only) and, with system Chrome, every fixture
   "failed" on rasterisation noise. The scripts now find the local browser
   themselves and the baselines are per platform.
3. **Classic V2: the column rules can run through the merged band rows.**
   The DN group heading and the project heading are merged cells, so the column
   rules (the cell borders) stop at them. The new workspace setting
   `classic_v2_column_rules_continuous` turns them into normal rows: the heading
   text moves into the description column and wraps there, and the numeric cells
   stay empty but ruled. The print height model charges the narrower width in
   that mode (`dnGroupNarrow` / `narrowColumn`), so the paginator and the filler
   agree.
4. **The PDF cache did not know about layout changes.** The cache key was
   `pdfs/{user}/{document}/{variant}.pdf` — nothing in it said which layout
   produced the file, so a document downloaded before a layout change kept
   serving the old render (with the old page breaks) while the preview showed
   the new one. The client now sends `PRINT_LAYOUT_VERSION`
   (`src/constants/index.ts`) with every PDF request and the server puts it in
   the key, so a layout change invalidates the
   cached renders instead of serving them. Bump the constant whenever the
   print output changes. The key also carries a fingerprint of the workspace's
   print settings (the server computes it from the client profile), so a
   settings change — a font scale, the table lines, the new column-rules option
   — invalidates that workspace's cached renders too. Before this, a settings
   change left the old PDFs in place and the download kept showing the old
   layout.

## Tests

- `scripts/print-layout-fill-check.mjs` — new variant `dn short rows last`
  reproduces the overflow (a classic V2 invoice whose last page is short on
  rows but tall on fixed blocks). It failed before the fix and passes now.
- `scripts/print-layout-fixture.tsx` — new `dn-short` document variant.
- `scripts/print-layout-chromium.mjs` — shared launcher for the four
  print-layout scripts.

## Verification

`npx tsc -b` · `npm run lint` (0 errors) ·
`npm run test:print-layout:fill` (every filled sheet 297.1mm) ·
`npm run test:print-layout:estimate` · `npm run test:print-layout` (0 changed
pixels, Windows baselines) · 60 real documents: 0 pages over A4, 0 previews
warning · the exported PDF of the previously clipped invoice now ends its
signature band inside the page box · the download of that invoice renders
fresh (2 pages, the band complete) and is cached under the versioned key.

## Tests added for the band rows

- `scripts/print-layout-estimate-check.mjs` — DN variants (the band rows are in no
  variant today), with the merged band and with the band text in the
  description column: the model is compared with the render at both widths.
- `scripts/print-layout-fill-check.mjs` — variants with the option on: the
  filled sheet still has to stay inside A4.
- `scripts/print-layout-regression.mjs` — a DN fixture, so the classic V2 band
  look is locked in the pixel baselines.
- `scripts/print-layout-fixture.tsx` — a `?columnRules=1` switch and a `dn-short`
  document whose DN number is long enough to wrap in the description column.

### The deal page's next-step choice

The two ways forward on a deal (ออกใบวางบิล / รับเงินเลย, and
ออกใบแจ้งหนี้ต่อ / ส่งของก่อน) were two equal white cards behind a หรือ
divider — the hierarchy was invisible, the descriptions described mechanics
instead of outcomes, and neither card showed the numbers the decision needs.

Now both choices are blue, so they read as pressable next to each other (a white
card next to a blue one reads as "not a button"), and the fill intensity
ranks them: the solid blue is the workflow's next step, the soft tint
(`bg-primary-soft` + a blue border — the app's own "selected option" treatment)
is the shortcut that skips a step. Each card states what the customer gets and
what the other path skips. The billing card adds the facts: the count and the
total of the invoices waiting to be paid — the same list the billing-note form
offers.

The sides follow the path, not which action happens to be the next step: the
operational path (delivery / payment) reads first, the paperwork path (invoice /
billing note) second. A pair therefore never moves when the deal's state
changes — after a delivery is recorded the quotation pair keeps ส่งของก่อน on
the left and only the labels change.

### The classic V2 band and the delivery-note order

The band row above a group of items carries two references: the delivery note
and the frozen SO section. They are not the same level — the number cell is the
DN group (the items under it are numbered G.j), so the DN ref heads the row and
the SO line is a reference under it. The SO line was semibold like the heading,
so two headings competed while the genuinely secondary part (the date) was the
quiet one; it is now weight 500 in the muted tone, and the SO-grouped delivery
note (where the SO is the only line) keeps the heading weight.

The delivery notes of an invoice were already ordered by issue date, but
several notes from the same day came back in an arbitrary order (an invoice
showed DN-079, DN-086, DN-085, DN-084, DN-080). The picker now breaks the tie
with the DN number, so a new invoice bills the deliveries in the order the
office made them. The sort is in the picker, not in the renderer: a re-print has
to match what the customer received.

The print-layout fixture's DN now carries an SO section, so the band-with-SO
look is covered by the pixel baselines (it had none).

### The home page's values never wrap

On the home page (which *is* the deals list — `/deals` redirects there) four
value cells wrapped their content: the last-edited date, the gross amount and
the net payable in the deals table, and the customer code under the name in
the receipts table. A value that needs two lines is a value that is hard to
scan — the amounts read as "฿ 5,029,019.26" split over two lines.

They now hold one line (`whitespace-nowrap`), the same treatment the values
already had in the receipts table and on the other list pages. The prose
columns keep the app's `truncate` + `title` treatment.

The cost: the columns that hold a value take their natural width, so the
deals table is ~1400px wide and scrolls horizontally below a ~1600px viewport
(it fit before, by wrapping the values). The receipts table already scrolled
134px, and /reports scrolls 56px, so a horizontal scroll is the app's pattern
for a wide table — but if the amounts being off-screen on a 1440px laptop
matters more than the values being on one line, the prose column
(`max-w-[200px]`) can be trimmed, or the values can go back to wrapping.

## Closing the two loose ends

**The macOS pixel baselines.** They were captured before the filler measurement
changed the page, so they are stale — the macOS check would have reported
tens of thousands of changed pixels that say nothing about the layout. The
baselines now carry the print layout version they were captured with
(`baselines/<platform>/layout.json`): a stale set is reported as stale and
skipped, with the portable geometry checks named, instead of failing as a
pixel diff. `baselines/mac/layout.json` records v1 (the old layout) and
`baselines/win/layout.json` v2 (the current one), so the state is visible
in the repo. Re-capturing on a Mac is one command:
`npm run test:print-layout:update`.

**The orphaned cached renders.** Every layout or settings change leaves the
previous renders in the bucket — never read again, but they take space. Two
answers: the durable one is an expiration rule on the bucket's `pdfs/` prefix
(Cloudflare → R2 → bucket → Settings → Object lifecycle rules, e.g. 30 days),
so the orphans expire by themselves; the immediate one is
`npm run cache:prune -- --orphans` (removes the leftovers of an older
layout) or `--all` (flushes the cache — the next download re-renders). The
tool works on the bucket and on the local disk cache.

## Pending

- `sql/20261020_classic_v2_column_rules.sql` is **applied** (the column exists);
  it was the only outstanding migration.
- The **macOS** pixel baselines are marked stale (layout v1) — re-capture them
  on a Mac with `npm run test:print-layout:update`. Until then the macOS pixel
  check skips with a message; the geometry checks cover every platform.
- The layout version bump invalidates every cached PDF **in production** too:
  the first download of each document re-renders once. The old files stay in
  the bucket as orphans — `npm run cache:prune -- --orphans` removes the ones
  from an older layout, and a bucket expiration rule keeps it from happening
  again.
