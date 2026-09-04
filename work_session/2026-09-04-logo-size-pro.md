# Logo Size Pro (typo-logo friendly) — Session Record

_Session date: 2026-09-04. **Pending migration** — `sql/20260905_logo_size_pro.sql`
is new in the repo and NOT yet applied (Supabase migrations are applied manually
via SQL editor or Management API): sets `client_profiles.logo_size` default to
`'square'`, backfills legacy `'full'` → `'rectangle'`, adds
`client_profiles_logo_size_check` for the 5 presets. `schema.sql:241` comment
updated to match._

## What shipped

### Presets by use-case + mm (was shape + px)
- `src/constants/index.ts:86-109` — `LOGO_SIZE_OPTIONS` now 5 entries with
  `mm` + `desc`: เล็ก 48 (~13มม.), มาตรฐาน 64 (~17มม., default), กลาง 96
  (~25มม.), ใหญ่ 128 (~34มม.), แบนเนอร์ 200 (~53มม.). Old stored values
  (`square`/`rectangle`/`large`) keep identical px → existing docs render the
  same width. New `LOGO_DEFAULT_SIZE = "square"` + `getLogoPx()` handles legacy
  `"full"` → 128 and null/unknown → 64.

### Height-guarded shared logo (typo/wordmark safe)
- New `src/components/print/DocLogo.tsx` — single component used by all 3
  templates; width from preset, height guarded by CSS.
- `PrintHeader.tsx` (modern), `PrintDocumentClassic.tsx`,
  `PrintDocumentClassicV2.tsx` — local `getLogoPx` copies removed, `<img>`
  replaced with `<DocLogo banner={show_company_name===false} modern?>`.
- `src/index.css` — normal header: `max-width:55mm / max-height:15mm /
  object-fit:contain` for classic + modern (was 30mm/no-height-cap in classic,
  uncapped in modern). Banner (name hidden): `81mm / 22mm` everywhere (V1 was
  81×18, V2 was uncapped). Wide typo logos now bind on height, square marks on
  width — header never pushed tall.

### Settings UX (`settings/documents.tsx:487-530`)
- Options show `label (mm) — desc` instead of raw px; row description explains
  the auto height guard for horizontal wordmarks.
- Live width specimen bar + `กว้าง X · สูงไม่เกิน 15มม. (แบนเนอร์ 22มม.)` caption.
- Banner hint when `large` + company name on: suggests turning off
  “แสดงชื่อบริษัทในเอกสาร” (typo logo already contains the name).
- Upload hint: transparent PNG ≥1200px with padding for wordmark logos.
- Default state fixed to `LOGO_DEFAULT_SIZE` (was `OPTIONS[0]`, which moved).

### Seeds
- `scripts/seed-testcompany.mjs:157` — legacy `"full"` → `"rectangle"`.

## Verification
- `npx tsc --noEmit` ✓ clean.
- `npx tsx tests/print-layout/pagination.many.check.ts` ✓ all assertions passed.
- `npm run test:print-layout` could NOT run here (Chromium ENOEXEC in sandbox;
  needs Chrome per AGENTS.md) — rerun before release, or
  `npm run test:print-layout:update` if header snapshots intentionally shift
  (55mm cap widens rectangle/large vs old 30mm cap, but height guard keeps them
  balanced).
