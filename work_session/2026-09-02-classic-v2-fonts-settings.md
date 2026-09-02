# Classic V2 Fonts, Settings Overhaul & Pagination Engine — Session Record

_Session date: 2026-09-02. All work committed and pushed to `main` through `823f9d9` + this round's final commit. Migrations applied to production Supabase (project `fbhoqcpqqtbiorzbuqcl`)._

## What shipped this session (chronological by theme)

### 1. Classic V2 font system — full pt-based architecture
- **Workspace global preset** (`client_profiles.classic_v2_font_scale`): pt-only ladder — 6 / 7.5 / 9 / 10.5 / 12 / 13pt (even ~20% steps; pt-only labels replaced ใหญ่/ใหญ่มาก/ใหญ่ที่สุด naming)
- **Per-section workspace overrides** (`classic_v2_section_font_scales` jsonb): 6 slots — ส่วนหัว / ตารางรายการ×3 (ชื่อสินค้า·ตัวเลข·หัวตาราง) / ยอดรวม / ลายเซ็น — each inherits the global
- **Per-document-type overrides** (`classic_v2_type_font_scales` jsonb): doc_type → { global + 6 sections }, edited via type tabs in Settings; type → workspace → global fallback
- **Per-document override** (`documents.print_font_scale`): was UI'd on the deal form, later REMOVED per user (adjust in Settings only) — resolution chain kept for data already saved; document → type → workspace → ปกติ
- **Custom exact pt** (6–13.5 clamp) stored as `pt:<n>` strings; parsed at every resolution layer
- **CSS plumbing**: `--classic-font-scale` + `--classic-fs-{header,items,num,thead,totals,footer}` vars; ~60 declarations remapped; classic V1 renders identically (scale 1 default)
- Commits: 382d3d7 → 6d809bd → 77001a4 → 823f9d9 lineage

### 2. Settings professional overhaul — ALL settings pages
- Shared UI: `SectionCard` (+description prop), new `SettingRow` (two-column label/control), `Switch`, `FontPreviewChip` (live "กAa" at real size)
- documents.tsx: font panel consolidated into one tabbed surface (ค่าเริ่มต้น + 8 type tabs) with specimen block "ตัวอย่างขนาดจริง"; per-section rows full-width with ตารางรายการ group indented
- All 8 settings pages: SectionCards, SettingRow rows, Switches, sticky save bars (documents, company, tax, numbering, stock, payroll) with dirty indicator + ยกเลิกการแก้ไข (hydration extracted)
- numbering label fix: รีเซ็ตทุกเดือน → รีเซ็ตทุกปี (field is reset_yearly)

### 3. Pagination engine overhaul (classic V2)
- **Wrap-estimate recalibration**: measured real font widths via fixture (75 chars/line at 7.5pt in the 87mm column; width grows linearly with scale) — NAME_CHARS_PER_LINE 28→63, classicNoAmounts 48→100 (85% of measured). Root-caused the "only 13 lines/page" symptom: the old ÷scale model over-counted Thai wrapping ~2× at enlarged fonts
- **Density caps**: classic_v2 line items — single 19 / first-multi **28** / continuation **34** / last **24** (measured fixed blocks); summary — 12 / 26 / 32 / 22. Multi-page first pages carry only header+info (totals live on the last page) and pack via a two-pass fill
- **Sequential distribution**: if the remaining rows after page 1 all fit the finalized page → all go there (40 items → first(24)+last(16)); otherwise continuation pages fill in order to capacity, final page takes the tail with totals/signatures — no thin orphan pages (INV-2026-09-009: 13/2/11 → 20/6)
- **Sparse-tail merge**: post-placement pass folds a thin trailing continuation batch into the last page within budget/cap (loop handles repeated merges); enforced by `assertNoMergeableTail` invariant in tests
- **Budget reserve options**: `extraReserveMm` (first/last only — e.g. cheque strip 11mm) + `continuationFullHeader` (34→28 rows + header/thead reserves)

### 4. Signature band per document type (classic V2)
- `SIG_LABELS` map replaces `isDeliveryNote ? … : …`: per-type Box1/Box2 wording — invoice (ได้รับสินค้า/บริการถูกต้องแล้ว), billing note (ได้รับใบวางบิลถูกต้อง), quotation (ยืนยันคำสั่งซื้อ / ผู้เสนอราคา), credit/debit note (acknowledge/approve), receipt + tax_invoice_receipt keep PAYMENT RECEIVED, delivery note unchanged. Box 3 (company + signature/stamp) universal
- **Segmented date fills**: `[DD] / [MM] / [YYYY]` replace the plain dotted date line in all 3 boxes

### 5. Billing-note cheque-details strip
- "วันที่รับเช็ค / CHEQUE RECEIVED DATE" slim hand-fill strip (label + full-width dotted line, 11mm) between totals and signature band; always shown on BN prints (classic V2); reserved via `extraReserveMm = 11` on first/last budgets
- (Earlier 4-field version replaced by the slim single-field per user)

### 6. Full-page header option
- `client_profiles.classic_v2_full_page_header` (boolean, default false): repeats the full header + customer info band on continuation/last pages instead of the compact strip
- Pagination: continuation capacity 34 → 28 rows + [header, thead] reserves when on
- Settings switch in เทมเพลตเอกสาร card; verified end-to-end (11 pages, full header on every sheet, no overflow)

### 7. Fixes along the way
- Local dev PDF export: platform-aware Chromium launch (sparticuz args only for its Linux binary) + dev render origin (pdf.js handler pointed headless Chrome at the API server instead of Vite)
- Prod 401 "Invalid session": PDF export used raw getSession() with stale tokens — now uses `apiFetchBlob` (refresh + 401 retry)
- PDF hairlines: 0.35px borders → 0.5px (sub-pt lines vanish in PDF viewers)
- Header when company name hidden: logo keeps its chosen size (was forced to 18mm) and company meta moves up beside the logo (V2-scoped; respects ตำแหน่งโลโก้ ด้านบน)
- Logo ↔ company-info gap 5mm → 3mm (V2)
- Items table all-black fonts (V2); per-section + per-type font chains; logo gap

## Migrations applied to Supabase (all verified via information_schema)
- 20260901_classic_v2_font_scale.sql → client_profiles.classic_v2_font_scale
- 20260902_classic_v2_section_font_scales.sql → classic_v2_section_font_scales jsonb
- 20260903_document_print_font_scale.sql → documents.print_font_scale + create_deal_document RPC extended
- 20260904_classic_v2_type_font_scales.sql → classic_v2_type_font_scales jsonb
- 20260905_classic_v2_full_page_header.sql → client_profiles.classic_v2_full_page_header
- 20260901 earlier batch also included classic_v2_font_scale (see sql/ files; all applied)

## Mock data seeded (test workspace)
- `scripts/seed-mock-pagination-deal.mjs` — deal "Mock pagination — DN 7/14/26/37/50 → INV · 5 INV (7/114/26/37/50) → BN" (deal 965e245a):
  - 5 DNs (7/14/26/37/50 items) → INV-2026-09-006 (134 items, source refs) — status sent
  - 5 invoices (7/114/26/37/50 items) → BN-2026-09-004 — statuses in_billing, BN sent
  - 502 line items; doc sequences bumped (DN→14, INV→11, BN→4)
- Verified: INV-006 → 9–11 pages depending on header option; BN-004 → 1 page with cheque strip; numbering continuous

## Verification status
- tsc ✓, production build ✓, `tsx tests/print-layout/pagination.many.check.ts` ✓ (ladder ×6, per-mode budgets, no-mergeable-tail invariant, coverage/continuity, pt parsing/clamps, mixed-scale cases)
- E2E renders: fixture + real print page with minted session (INV-006/007/008/009, BN-004) — numbering continuity 1..20/21..26 confirmed, sequential distributions confirmed, full-header mode confirmed, no sheet overflow
- Playwright print-layout regression suite NOT run this session — **baselines are stale** (generated on a different machine; pre-existing drift confirmed earlier)

## Pending / resume points
- [ ] Regenerate print-layout baselines on this machine: `CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:print-layout:update` (adds classic_v2 variants: original/copy/many/xlarge/xxlarge)
- [ ] Rotate the Supabase access tokens pasted in chat (sbp_cb8a… and sbp_ea1c…) — Dashboard → Account → Access Tokens
- [ ] Classic V1 could adopt the same density caps/wrap calibration if desired (scope kept V2-only this session)
- [ ] Invoice (VAT) prints as ใบกำกับภาษี — signature wording for that variant uses the goods/services set; a standalone "ใบกำกับภาษี (credit term)" doc type doesn't exist yet
- [ ] Kill the temp vite dev server on :5199 if still running (started for fixture verification)

## Key files touched (summary)
- src/lib/pagination.ts, printRowHeight.ts, print.ts, src/constants/index.ts, src/index.css
- src/components/print/PrintDocumentClassicV2.tsx, PrintContinuationHeader (untouched), ui/{SectionCard,SettingRow,Switch,FontPreviewChip}
- src/app/(client)/settings/*.tsx (all 8 pages), src/app/(client)/documents/print.tsx, src/app/(client)/deals/new.tsx
- server/handlers/_lib/chromium.js, documents/[id]/pdf.js, wht/generate.js, src/lib/api.ts
- scripts/print-layout-{regression,fixture}.*, tests/print-layout/pagination.many.check.ts, scripts/seed-mock-pagination-deal.mjs
