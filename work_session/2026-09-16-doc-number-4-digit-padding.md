# 2026-09-16 — Document numbers: 3-digit → 4-digit running segment

## What
Document numbers were `{PREFIX}-{YYYY}-{MM}-{NNN}` (e.g. `INV-2026-08-001`).
The running segment is now padded to **4 digits** (`INV-2026-08-0001`).

Why: Postgres `lpad()` **truncates on the right** when the input is longer than
the requested width — `lpad('1000', 3, '0')` → `'100'`. Past the 999th document
of a type in a month, generated numbers collapsed onto earlier values and the
partial unique index `(user_id, doc_type, doc_number) WHERE status IS NOT
DISTINCT FROM 'voided'` rejected the insert, hard-failing numbering. 4 digits
raise the ceiling to 9,999/month (and the same bug returns at 10,000).

All document types share one function (`generate_doc_number`), so this covers
QT / INV / BN / RC / DN / CN / DB. Existing 3-digit numbers were **left as-is**
(decision): the generator parses any width via `substring(doc_number from
'([0-9]+)$')` and takes `MAX` of the numeric suffix, so mixed widths sequence
correctly — no renumbering, no historical churn.

## Files
- `sql/20260916_doc_number_padding_4.sql` (new) — `create or replace function
  generate_doc_number` with `lpad(v_next_seq::text, 4, '0')`. Keeps the bigint /
  >9-digit overflow guard and the voided-doc exclusion from
  `fix_generate_doc_number_overflow.sql`.
- `schema.sql` — baseline function + both `repair_doc_numbers` blocks synced to 4.
- `sql/fix_generate_doc_number_overflow.sql`, `sql/fix_doc_number_skip_voided.sql`,
  `sql/add_dev_numbering_date_and_unique_docs.sql`, `sql/repair_doc_numbers.sql`
  — synced so no matter which copy is applied the result is 4 digits.
- `scripts/lib/mockGenerator.mjs` (`pad3`→`pad4`), `scripts/seed-mock-dn-deals.mjs`,
  `scripts/seed-mock-pagination-deal.mjs` — mock/seed format.
- `tests/integration/generateDocNumber.spec.ts`, `scripts/test-admin-reset.mjs`
  — expected strings updated (`...-0001`, `...-0006`).

## Applied
**PENDING — must be applied manually.** No DB URL / Management API token was
available in this environment, so `sql/20260916_doc_number_padding_4.sql` has
**not** been run against `taxwork invoice's Project` (`fbhoqcpqqtbiorzbuqcl`).
Apply via the Supabase SQL editor or `POST /v1/projects/{ref}/database/query`,
then run `npm run test:integration` (the `generateDocNumber` spec will fail with
3-digit output until the function is live).

No local Postgres/Docker was available, so the migration was verified only by
diffing against the proven `fix_generate_doc_number_overflow.sql` body (padding
is the sole logical change) plus `npx tsc -b`.

## Same session, unrelated
Classic print templates (`PrintDocumentClassic.tsx`,
`PrintDocumentClassicV2.tsx`): moved `เลขที่ / NO.` above `วันที่ / DATE` in the
document-info panel. Modern already had doc number first. Print-layout baselines
under `tests/print-layout/baselines/` still need `npm run test:print-layout:update`
(Chromium failed to launch here: `spawn ENOEXEC`).
