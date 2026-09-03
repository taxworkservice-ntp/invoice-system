# Classic V2 Font Sub-Slots + Line-Image Fixes + In-Form Catalog Create — Session Record

_Session date: 2026-09-03. Builds on the 2026-09-02 font-system session. **No pending migrations** — both `sql/20260903_files_line_images_purpose.sql` and `sql/20260903_fix_create_deal_document_image_url.sql` were applied to production Supabase (`fbhoqcpqqtbiorzbuqcl`) via Management API and verified. The font sub-slots need no migration (additive jsonb keys in existing columns)._

## What shipped

### Feature: create catalog items from the deal form (รายการสินค้าและบริการ)
Full ItemForm in a modal — one source of truth with /catalog/new (SKU, type,
carton unit, ตั้งค่างานบริการ, สต๊อกเริ่มต้น). The 3-field inline quick-create
in the picker stays untouched (available to all members).

- `ItemForm.tsx` — optional `onCreated?: (item: Item) => void` fired with the
  fresh row after insert + stock/preset setup (create mode only); hosts apply
  it without waiting for a refetch. Existing `onSave`/`onCancel` unchanged →
  /catalog/new + /catalog/:id/edit untouched.
- `ItemCreateModal.tsx` (new) — `<Modal size="xl" title="สร้างสินค้า/บริการใหม่">`
  wrapping `<ItemForm item={null}>`; unmounts when closed → fresh state per open.
- `CatalogItemPickerModal.tsx` — optional `onFullCreate` prop renders a
  "สร้างแบบเต็ม (SKU, หน่วยรอง, ตั้งค่างาน)…" link beside เพิ่มรายการใหม่.
- `CatalogAutocomplete.tsx` — optional `onFullCreate` pass-through; closes its
  dropdown + picker first so modals never stack (Modal.tsx is z-50 DOM-order).
- `deals/new.tsx` — `itemCreateModal { open, targetLineId }` state +
  `handleFullCreateItem`: refetchItems() (also re-derives service job-detail
  setup via the jobDetailServiceItems effect) then
  - picker path: `applyCatalogItemToLine(targetLineId, created)`
  - section path ("+ สร้าง" button in the step-3 header): applies to the last
    still-empty line, else appends a new pre-filled line
- Permissions: both entry points render only for `canManageCatalog`; inline
  quick-create intentionally ungated (per product decision).
- Verified: tsc ✓, production build ✓; manual QA pending in the running app.

### Fix: create_deal_document 400 — "column image_url of relation documents does not exist"
`sql/20260902_quotation_line_images.sql` had put `image_url` in the RPC's
DOCUMENTS insert whitelist (the column only exists on document_line_items) —
every deal→document creation via the RPC failed. The migration had been
applied to production in that broken shape on 2026-09-02.

- `sql/20260903_fix_create_deal_document_image_url.sql` — ✅ applied via
  Management API: re-creates the RPC with image_url only in the LINE-ITEMS
  insert (keeps print_font_scale / customer_po_number / task_name), plus
  hardening: `base_quantity` falls back to `quantity` and `discount_amount`
  to 0 when omitted (both were bare casts → NOT NULL violations on lean
  payloads; the real client always sent them).
- The repo's `20260902_quotation_line_images.sql` corrected the same way so a
  fresh replay can't reintroduce the bug.
- Verified live via Management API query: prosrc references image_url only in
  the line-items section; transactional smoke tests (rolled back, burned a few
  quotation sequence numbers) — full payload ✓ and lean payload ✓ both return
  deal_id/document_id.

### Fix: "+ เพิ่มรูปตัวอย่าง" 400 Invalid storage key (Round 7 line images were never server-allowlisted)
The quotation per-line photo upload (shipped 2026-09-02) POSTs
`line-images/{userId}/{uuid}.{ext}` to `/api/storage/upload-file`, but three
layers still only knew the 6 original purposes → 400 "Invalid storage key"
before auth, and the print/preview proxy would have 403'd at render:

- `server/handlers/_lib/auth.js` — `getStoragePurpose` allowlist += `line-images`
- `server/handlers/storage/[action].js` — `MAX_BYTES_BY_PURPOSE` += `line-images: 10MB`;
  `handleImageProxy` serves `line-images` (unauthenticated `<img>` path, keys
  unguessable — same model as branding assets)
- `sql/20260903_files_line_images_purpose.sql` — ✅ applied via Management API
  (verified via pg_constraint): `files.purpose` CHECK now includes `line-images`.
  Upload was failing (500) after the R2 put without this.
- `src/types/index.ts` StoragePurpose + `storageApi.ts inferPurpose` += `line-images`

Sanity-checked `validateStorageKey` via tsx (valid / traversal / bogus cases);
tsc + build clean.

**Note on the console noise in the report:** the Supabase
`auth/v1/token?grant_type=refresh_token` 400 "Invalid Refresh Token" is a
separate stale-browser-session issue (refresh token revoked — consistent with
the token rotation pending item in the 2026-09-02 record). It recovers by
signing out/in; the upload 400 itself was the server bug above. A client-side
auto-signout on `AuthApiError` could be added later if users keep hitting it.

### 5 new font-size sub-slots (Settings > รูปแบบเอกสาร > ขนาดตัวอักษร คลาสสิก V2)
Refinements of the existing 6-slot system — each inherits its parent slot → global when
unset, so existing workspaces render pixel-identically:

| Key | Parent | Label | Prints (pt at ปกติ) |
|---|---|---|---|
| `header_company` | header | ชื่อบริษัท/ที่อยู่ | company TH 17 / EN 14 / address 8.5 |
| `header_title` | header | ชื่อเอกสาร/ตราสำเนา | doc title 15/11, copy badge 10/8 |
| `header_info` | header | กล่องข้อมูล/ลูกค้า | info band + meta table 8/7.6/5.4 |
| `totals_net` | totals | ยอดรวมสุดท้าย | grand/net rows 8.8/9, payment-status badge 8.5/6.5 |
| `payment` | totals | ข้อมูลการชำระเงิน | PAYMENT section in the terms column (new `print-classic-terms-section--payment` modifier) |

- Resolution chain walks sub → parent within each scope: type.sub → type.parent →
  workspace.sub → workspace.parent → global (`getClassicV2EffectiveSectionScaleMult`).
  Custom exact pt (`pt:<n>`, clamp 6–13.5) works on every slot.
- CSS: `--classic-fs-company/title/info` default to `--classic-fs-header`,
  `--classic-fs-net/payment` to `--classic-fs-totals` (defaults in the
  `.print-theme-classic` block) — classic V1 never sets the new vars and is unaffected.
- Settings UI: sub-rows render indented under ส่วนหัว and ยอดรวม/เงื่อนไข (same pattern
  as ตารางรายการ); inherit options state the parent's live effective size
  ("ตามส่วนหัว (9pt)"); ตัวอย่างขนาดจริง specimen block extended to 11 rows.
  Works in ค่าเริ่มต้น + all 8 type tabs automatically.

### Pagination safety (block maxima)
- `normalizeFontScales` (src/lib/pagination.ts) fills sub-slots with parent fallbacks and
  computes `headerBlock = max(header, company/title/info)` and
  `totalsBlock = max(totals, net/payment)`; reserve maps rekeyed to blocks
  (`headerBlock: 51, thead: 5, totalsBlock: 48, footer: 21`). An enlarged sub-slot alone
  still shrinks page budgets — no overflow from e.g. 12pt กล่องข้อมูล with ปกติ header.
- print.tsx passes all 11 slot scales into the paginator via `ClassicV2FontScales`.

## Key files
- src/constants/index.ts — `ClassicV2SectionFontKey` (11 keys), `CLASSIC_V2_SUB_SLOT_PARENT`,
  `CLASSIC_V2_SECTION_SUB_ROWS`, `CLASSIC_V2_SECTION_PARENT_LABELS`,
  `CLASSIC_V2_DEFAULT_SECTION_SCALES`, chain-walking resolution fns
- src/index.css — 5 new default vars + ~20 declaration remaps + payment section modifier
- src/components/print/PrintDocumentClassicV2.tsx — 5 new mults resolved + vars set
- src/app/(client)/documents/print.tsx — sub-slots into budget scales
- src/lib/pagination.ts — `ClassicV2FontScales` extended, block maxima, reserve rekey
- src/app/(client)/settings/documents.tsx — indented sub-rows, sub-inherit labels, specimens
- tests/print-layout/pagination.many.check.ts — section 6c: block-max reserves, parent
  fallback == parent-driven budgets, uniform sub-slots == scalar, resolution-chain cases

## Verification
- tsc ✓, production build ✓, `npx tsx tests/print-layout/pagination.many.check.ts` ✓
  (incl. new 6c sub-slot assertions)
- No migration pending; jsonb additive — no data changes
- Playwright print-layout regression NOT run (baselines stale from before this session —
  see 2026-09-02 record); defaults/parent-only configs must render identically

## Pending / resume points
- [ ] Manual QA: in-form catalog create — picker path (auto-select into that
  line), section "+ สร้าง" path (last-empty-line / append), product with carton
  unit, service with ตั้งค่างานบริการ, duplicate-SKU inline error, member
  without canManageCatalog sees no entry points
- [ ] Re-test in the quotation editor: create deal → quotation (RPC), line-image
  upload → thumbnail → print render (all server blockers fixed + smoke-tested)
- [ ] **Rotate the Management API token pasted in chat (sbp_2c13a0…)** —
  Dashboard → Account → Access Tokens (same drill as the 2026-09-02 sbp_ tokens)
- [ ] Regenerate print-layout baselines on this machine when convenient
- [ ] Optional: auto-sign-out on Supabase AuthApiError (stale refresh-token UX)
- [ ] Optional: per-section line-height or letter-spacing refinements (not requested)
