# QA Findings — Invoice Workflow

> Status: **TRIAGED — confirmed findings separated from backlog candidates**
> Scope: end-to-end invoice workflow (quotation → invoice → billing → receipt), side flows (delivery note, credit note, tax-invoice-receipt, void + recreate), and the limits/edges of the flow.
> Stack: React + Vite + Supabase + Vercel + R2 (per `invoice-system-master-prompt.md`).

---

## Executive Triage

### Fix next

| Priority | Finding | Why |
|---|---|---|
| P1 | F-002 Atomic status + stock transitions | Manual send paths now use safer ordering + compensation, but full coverage still needs a transaction/RPC for create/convert flows. |
| P2 | F-003 Document number uniqueness | Direct inserts can bypass RPC sequencing. Add a DB uniqueness guard after checking existing data. |
| P3 | F-004 Pagination / large lists | Current list hooks fetch all rows. This will hurt real customers once documents/items grow. |

### Fixed in app code

| Finding | Resolution |
|---|---|
| F-001 Stock warning visibility | Document detail now shows the same low-stock toast warnings as deal/document list send actions instead of logging only to console. |
| F-002 Manual send transition mitigation | Manual send/issue actions now run stock side effects before status update and restore stock if the status update fails after stock movement creation. |
| F-011 Delivery note action gating | Deal detail no longer offers delivery-note creation after the deal is complete; it only appears for open sent quotation/invoice delivery workflows. |

### Keep as hardening / V1 limitations

| Finding | Recommendation |
|---|---|
| F-005 Negative stock DB constraint | Keep as hardening unless direct DB writes become part of normal operations. |
| F-006 Cron auth | Add a Vercel cron header/shared-secret check before production hardening. |
| F-007 WHT type asymmetry | Clean during tax/settings refactor; not user-blocking today. |
| F-008 Tax naming clarity | Rename only when touching tax code to avoid churn. |
| F-009 Receipt line-item snapshot | Product decision: immutable receipts are better, but it changes data model/workflow expectations. |
| F-010 `reset_yearly` naming | Rename or document when doing numbering settings cleanup. |

---

## 0. Test Strategy

| Layer | Tooling | Notes |
|---|---|---|
| L1 Unit | Vitest (not yet installed) | Pure functions: `tax.ts`, `stock.ts` formatters, `docLabels.ts` |
| L2 DB / RPC | Node + `pg` against Supabase | `generate_doc_number`, `mark_overdue_billing_notes`, RLS, default-sequences trigger |
| L3 E2E | Playwright (not yet installed) | Full browser flow against Vercel deploy |
| L4 Limits / negative | Playwright + manual | Push the system to its boundaries |
| L5 Visual PDF | Playwright snapshot | Thai font, modern template, share/download |

> **Open decision:** confirm test stack additions (vitest, @playwright/test) before coding.

---

## 1. Personas

| ID | Email | Profile | Purpose |
|---|---|---|---|
| P1 | client-a@test.local | New client, full profile | Happy path |
| P2 | client-b@test.local | 20 items, mix product/service, carton units, varied stock | Stock + carton math |
| P3 | client-c@test.local | `vat_registered=true`, tax_id set | VAT-positive flow |
| P4 | client-d@test.local | `vat_registered=false` | Non-VAT flow |
| P5 | client-e@test.local | Independent tenant | RLS / multi-tenant isolation |
| ADM | admin@test.local | role=admin | Admin actions |

> **Open decision:** expand from `test user.md` (admin@test.local, client@test.local) to P1–P5.

---

## 2. Happy-Path Scripts (L4)

### HP-1 — Quotation → Invoice → Billing → Collect
- Create customer A; items A1 product (100 ฿, stock 50), A2 service (200 ฿), A3 product (carton 24 ชิ้น/ลัง, 48 ฿, stock 240).
- New deal → quotation → fill 3 lines → Save. Expect `QT-YYYY-MM-001`, `status=draft`.
- Mark as sent. No stock movement (R8).
- Convert → invoice. New invoice `status=sent`, `converted_from_id` set, 3 `auto_out` stock movements. Quotation `status=converted`.
- "วางบิล" → BN autosave draft. Add invoice, due today+7, save. Invoice `status=in_billing`, `billing_note_invoices` row.
- Manually invoke `mark_overdue_billing_notes()` after setting due_date=past. BN `status=overdue`.
- Reset due_date=today. "รับเงินแล้ว" → pay modal (bank_transfer, full amount, no WHT cert).
- BN `status=paid`, invoice `status=paid` (cascaded), new `receipt` row `status=generated`, `doc_number` from `receipt` sequence.
- Open receipt PDF. Line items backfilled (or invoice checklist), payment info shown.

### HP-2 — Tax Invoice + Receipt (one-step)
- `deals/new?type=tax_invoice_receipt` → 1 product line → Save.
- Expect `status=issued`, `doc_number` from `tax_invoice_receipt` sequence, `payment_method/amount_received/paid_at` set, `auto_out` fired at save.
- PDF label: "ใบกำกับภาษี/ใบเสร็จรับเงิน" (two lines).

### HP-3 — Invoice (non-VAT) + Delivery Note as stock source
- P4 with `stock_deduct_trigger='delivery_note'`, `vat_registered=false`.
- Quotation → invoice. No stock movement.
- Side action "บันทึกการส่งของ" → DN. DN `status=sent` → `auto_out` for products.
- Void DN. `return_in` linked via `parent_movement_id`, idempotent on re-void.

### HP-4 — Credit note after paid invoice
- From HP-1 receipt. Deal detail → "ออกใบลดหนี้". CreditNoteForm lists only `paid|generated` sources. Tax fields snapshotted. `converted_from_id` set. Save → `status=issued`.

### HP-5 — Multi-tenant isolation
- As P5, run `useDocuments()` and any client-scoped query → empty. Try insert with `user_id=P1.userId` → RLS reject. Try read by id → empty.

---

## 3. Negative / Edge Cases (L5)

### Numbering (NX)
- **NX-1** Concurrent save race: 2 tabs same `doc_type` save within 50 ms → 1 success, 1 RPC error.
- **NX-2** Month boundary: 23:59 vs 00:01 next day → distinct buckets, each `001`.
- **NX-3** `reset_yearly` toggle mid-year: 5 docs `true` → toggle `false` → 2 more → suffixes 6, 7.
- **NX-4** Backdate: `issue_date=2024-12-15` in 2026 → `…-2024-12-001`.
- **NX-5** `repair_doc_numbers()`: after corrupting sequence, run from `sql/repair_doc_numbers.sql`, no duplicates, no `copied_from_id` collisions.
- **NX-6** Two clients with same prefix → independent `001`s.

### Tax / VAT / WHT (TX)
- **TX-1** Discount > line amount → clamp to `lineTotal` (`tax.ts:7`).
- **TX-2** Doc discount + line discount precedence (line first, then doc on `subtotalBeforeDiscount`).
- **TX-3** VAT round-trip: 1,000,000 lines × 0.001 ฿ × 7% → no off-by-one across many lines.
- **TX-4** WHT on product vs service lines (no `item_type` filter on WHT).
- **TX-5** Profile `vat_registered` flip after issue → old PDF still shows VAT (snapshot wins).
- **TX-6** WHT 100% / 0 VAT → no negative, PDF correct.
- **TX-7** Backdated receipt requires `backdated_reason`; `paid_at=toLocalMiddayIso`; audit columns populated.
- **TX-8** Tax label matrix (per `docLabels.ts`):

| doc_type | vat_registered | Expected label |
|---|---|---|
| invoice | true | ใบกำกับภาษี / Tax Invoice |
| invoice | false | ใบแจ้งหนี้ / Invoice |
| tax_invoice_receipt | * | ใบกำกับภาษี/ใบเสร็จรับเงิน (two lines) |
| quotation, billing_note, receipt, delivery_note, credit_note | * | fixed labels |

### Stock (ST)
- **ST-1** Negative stock sale → clamp to 0, `StockWarning[]` returned; **verify whether the warning is surfaced to the user on the document detail page** (explore agent flagged it is only logged, not shown — UX bug to confirm).
- **ST-2** Void then re-void → `restoreStockOnVoid` idempotent via `parent_movement_id`.
- **ST-3** Void a `converted` quotation → no stock change (stock deducted on the new invoice, not the quotation).
- **ST-4** Carton math precision: `qty_per_carton=24`, sell 7 cartons (=168 base), then 0.001 cartons → `stock_count` matches `cartonsToBase`.
- **ST-5** Manual correction rollback: insert manual_in 100, Revert → `return_in` with `parent_movement_id` linking original.
- **ST-6** Service item in a saved invoice → no `stock_movement`.
- **ST-7** Mixed product+service lines → only products move stock.
- **ST-8** Stock-deduct-trigger flip → existing invoice flow not retroactively affected.
- **ST-9** DB-level race: two `auto_out` inserts → client clamp is the only safeguard (no DB constraint).

### Lifecycle / status (LS)
- **LS-1** Only `draft` is deletable; sent/paid/voided have no delete affordance.
- **LS-2** Edit-after-save: `/documents/:id/edit` only for `billing_note` and `credit_note` (others redirect).
- **LS-3** "คัดลอก" sequence: paid invoice → new draft with `copied_from_id` and **fresh** `doc_number`. Verify new doc has original's line items + tax snapshot, no `payment_*`.
- **LS-4** Converted quotation: no edit, `converted_from_id` of new invoice correct.
- **LS-5** Void+Recreate on a BN with a voided invoice → yellow warning banner (`isVoidedLinked`).
- **LS-6** Overdue idempotency: call `mark_overdue_billing_notes()` twice → 0 rows on second call.
- **LS-7** Overdue → Paid skip: never returns to `overdue`.
- **LS-8** Void a receipt → no stock effect (no `auto_out` on receipt).
- **LS-9** Void a credit note → no stock effect.
- **LS-10** `payDate > today` → blocked or defaulted to today.
- **LS-11** Void+Recreate mid-failure: line items insert fails after doc insert → draft with no lines; check retry/UX.
- **LS-12** Stock deduction only on `draft→sent`: no `auto_out` on initial draft save.

### Billing note (BN)
- **BN-1** Cross-BN locking: invoice A in BN-1 → BN-2 shows A as already taken.
- **BN-2** Remove invoice from BN → A `status=revert to sent`, `billing_note_invoices` row deleted.
- **BN-3** Autosave flushes on blur/navigate.
- **BN-4** BN without customer → blocked.
- **BN-5** Empty BN (no invoices) → validation fail.
- **BN-6** BN with WHT cert → flows into auto-receipt.

### Payment / receipt (PM)
- **PM-1** `amount_received <= 0` → button disabled.
- **PM-2** Partial pay → confirm whether allowed.
- **PM-3** Cash vs bank_transfer vs cheque → label on receipt PDF, CSV, financial report.
- **PM-4** "รับเงินแล้ว" on voided BN → no Pay button.

### PDF / print (PD)
- **PD-1** Long customer name, long descriptions, 50+ lines → no overflow.
- **PD-2** Missing `tax_id` for VAT doc → red placeholder.
- **PD-3** Missing logo/sig/stamp → graceful fallback.
- **PD-4** Bulk ZIP: 20 mixed docs → ZIP valid, names use `DOC_TYPE_SHORT`.
- **PD-5** ต้นฉบับ+สำเนา → 2 pages, "สำเนา" watermark, identical content.
- **PD-6** Mobile share: `navigator.share` available → share sheet; otherwise download.
- **PD-7** CORS-tainted canvas: block `/api/storage/image-proxy` → capture fails gracefully.
- **PD-8** BN PDF renders invoice reference table, not line items table.

### Settings (SE)
- **SE-1** Renumber PREFIX → old `INV-…` unchanged, new docs use new prefix.
- **SE-2** WHT default change → existing docs unaffected.
- **SE-3** All amounts exactly 2 dp in CSV + reports.
- **SE-4** Soft-deleted customer filtered out of picker.

### Admin / multi-tenant (AD)
- **AD-1** `POST /api/admin/clients/create` → auth user + profile + client_profiles + 7 default sequences.
- **AD-2** `reset-workspace` → customers/items/deals `is_active=false`, sequences zeroed, documents untouched.
- **AD-3** `reset-all` → full wipe + reseed with `reset_yearly=false`, prefix `TAX` for TIR.
- **AD-4** `delete` → hard delete cascades, login impossible.
- **AD-5** Ban / unban → login state matches.
- **AD-6** Admin UPDATE on client data → RLS reject.

### Performance (PF)
- **PF-1** 5,000 docs → list page load time (no pagination, baseline).
- **PF-2** 5,000 docs → home summary aggregation time.
- **PF-3** 100 docs in bulk ZIP → time + memory.
- **PF-4** 10,000 items in catalog autocomplete → 2-char search latency.
- **PF-5** 100,000 stock movements on one item → item-detail render time.

### Auth / RLS / API (AU)
- **AU-1** P5 reads P1's documents via raw query → empty.
- **AU-2** Image-proxy CORS open (`*`) confirmed.
- **AU-3** Storage presign TTL: upload 5 min, download 1 h.
- **AU-4** Logo access cross-tenant → 403.
- **AU-5** `/api/cron/overdue` unauth → confirm by design.
- **AU-6** Thai text encoding: `Content-Type: application/json; charset=utf-8` on client + server.

---

## 4. Limits of the Flow (L5)

These are the thresholds to push until something breaks.

| Limit | What to push | Expected break |
|---|---|---|
| Sequence length | 1,000 docs in same `(user, doc_type, year, month)` | Visual NNN width; no DB cap |
| Line item count | 500 lines on one invoice | UI scroll, PDF pagination, save latency on insert loop |
| Negative stock | sale > stock | Clamped to 0; warning surfaced? (ST-1) |
| Discount overdrive | 100% on 0-unit line | `clampAmount` → 0; verify no NaN |
| Cross-tenant blast | P5 creates doc with `user_id=P1.userId` | RLS reject; `service_role` not exposed client-side |
| Backdate drift | `issue_date` = 5 years ago | Bucket still works; verify no future-`paid_at` glitch |
| Image proxy outage | Block `image-proxy` during PDF render | html2canvas blank — graceful degradation TBD |
| Race on send | 5 invoice drafts click "send" simultaneously | `auto_out` insert order and `balance_after` correctness |
| Network failure mid-save | Kill network during `generate_doc_number` | Sequence row locked, insert may have happened, `last_sequence` incremented — manual probe |
| Doc number uniqueness | 1,000 inserts in 1 s via direct SQL | `FOR UPDATE` lock prevents collisions; **verify no UNIQUE on `doc_number`** |
| RLS recursion | Set `is_admin=true` on a client user | Admin SELECT uses `is_admin()` from `profiles.role` — verify no escalation |

---

## 5. Findings Log

> Findings discovered during testing. Add new entries at the top of the list. Use IDs `F-<seq>` and severity **S1** (blocks workflow), **S2** (incorrect behaviour), **S3** (UX issue), **S4** (observation / nice-to-have).

| ID | Date | Severity | Area | Finding | Status |
|---|---|---|---|---|---|
| F-011 | 2026-06-28 | S3 | Deal / Workflow | Deal detail showed `บันทึกการส่งของ` whenever any product item existed, even after receipt generation or issued tax-invoice-receipt. The action is now gated to open delivery workflows only and relabeled `ออกใบส่งของ`. (`src/app/(client)/deals/[id].tsx`) | Fixed |
| F-001 | 2026-06-28 | S3 | Stock / UX | `deductStockOnDocumentSent` returns `StockWarning[]` on negative-stock sale. Document detail previously logged warnings only; it now shows toast warnings consistent with deal and document list send actions. (`src/lib/stock.ts`, `src/app/(client)/documents/[id].tsx`) | Fixed |
| F-002 | 2026-06-28 | S2 | Atomicity | Manual send/issue paths now use `sendDocumentWithSideEffects`, which deducts stock before status update and compensates with stock restore if the status update fails. Remaining risk: create/convert flows and true transactionality still need a Supabase RPC/migration. (`src/lib/documentSend.ts`, `src/lib/stock.ts`, document/deal send actions) | Mitigated |
| F-003 | — | S2 | Numbering | `documents.doc_number` has **no UNIQUE constraint**. Concurrency safety relies entirely on `SELECT … FOR UPDATE` inside `generate_doc_number`. A direct SQL insert bypassing the RPC could create collisions. (`schema.sql:537-593`, `documents` table definition) | Open |
| F-004 | — | S3 | Performance | Document list (`/documents`) and `useDeals` fetch **all** rows with no pagination. With 5,000+ docs the list page will be slow. (`src/app/(client)/documents/index.tsx`, `src/hooks/useDocuments.ts`, `src/hooks/useDeals.ts`) | Open |
| F-005 | — | S4 | DB | No DB-level constraint preventing negative `stock_count`. Client-side `Math.max(0,…)` clamp is the only safeguard; a direct insert of a stock_movement producing negative balance would succeed. (`src/lib/stock.ts`) | Open |
| F-006 | — | S4 | Cron | `/api/cron/overdue` is unauthenticated. Acceptable for Vercel cron, but worth a comment in the repo and a basic allowlist (e.g. Vercel `x-vercel-cron` header check). (`api/cron/overdue.js`, `vercel.json:5-9`) | Open |
| F-007 | — | S4 | Tax | WHT rate stored as `numeric` on `documents.wht_rate` but as text enum `'0'|'1'|'2'|'3'|'5'` on `client_profiles.default_wht_rate`. Asymmetric types risk string-vs-number bugs in comparisons. (`src/components/documents/BillingNoteForm.tsx:325`, `schema.sql` enum definition) | Open |
| F-008 | — | S4 | Tax | `subtotal` after line discount is named `subtotalBeforeDiscount` in the return object but `subtotal` is the post-document-discount value. Easy to confuse when reading `calculateTax` result. (`src/lib/tax.ts:43-81`) | Open |
| F-009 | — | S4 | Receipt | Receipt has no `line_items` stored; PDF backfills them from source at render time. If the source invoice/billing note is later voided or its line items are edited, the receipt PDF will show stale data. (`src/lib/print.ts:75-134`) | Open |
| F-010 | — | S4 | Numbering | `reset_yearly=true` actually resets **per (year, month)**, not per year. The flag name is misleading. (`schema.sql:561-577`, `src/lib/docNumber.ts`) | Open |

---

## 6. Open Questions / Decisions

1. **Test stack:** add `vitest` + `@playwright/test` as devDependencies? (none installed yet)
2. **Staging:** separate Supabase project, or Supabase branch off live `fbhoqcpqqtbiorzbuqcl`? Need credentials for the test runner.
3. **Personas:** keep `test user.md` as-is, or expand to P1–P5?
4. **Scope:** (a) invoice-only path, (b) full document type matrix, (c) focus on negative/limit cases?
5. **Doc list pagination:** capture as known bug (test), or fix as part of this work?
6. **Visual PDF regression:** Playwright snapshot diff, or structural assertions via `pdf-parse`?
7. **CI cadence:** every PR, or nightly only?
