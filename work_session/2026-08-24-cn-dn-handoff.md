# Credit Note / Debit Note Implementation — Handoff Notes

_Paused (session 2): 2026-08-24. Typecheck ✅ · vitest 20/20 ✅ · nothing committed yet._

## Done (in working tree, uncommitted)

### Credit notes — now financially real
1. **Stage consistency** — draft CN = `"collect"` in `src/hooks/useDeals.ts:getStage` (was `done`, contradicted deal page). Issued CN = done.
2. **`receivedThisMonth` bug fix** — `.neq("doc_type","credit_note")` added to the paid-month query (`useDeals.ts`) so a CN can never inflate cash-in.
3. **Stock returns** — new in `src/lib/stock.ts`:
   - `returnStockOnCreditNoteIssued(docId, userId)` — product lines → stock up + `return_in` movement (idempotent)
   - `reverseStockOnCreditNoteVoid(docId, userId)` — reverses via `auto_out` + `parent_movement_id`
   - Wired: issue path calls return (CreditNoteForm.handleSave when status=issued); void path has explicit `credit_note` branch in `documentVoid.ts`.
4. **Over-credit guard** — `CreditNoteForm` loads cumulative active credits per source invoice (`converted_from_id`), blocks saving when total > invoice total; UI hint shows "วงเงินคงเหลือที่ลดได้".
5. **Deal page financials** (`deals/[id].tsx` financialSummary) — creditTotal subtracted from outstanding; "ยอดลดหนี้" row appears when credits exist; excess over balance shows **"เครดิตคงเหลือ ฿X"** badge (customer credit).
6. **Home dashboard** (`home.tsx`) — `getDealCreditAmount()`; outstandingAmount is credit-adjusted; `customerCredit` field on DashboardDeal.
7. **Customers page** (`customers/[id].tsx`) — `getDealOutstanding` subtracts active CN totals.
8. **Reports** (`useReports.ts`) — CNs included as **negative adjustments**:
   - revenue/VAT reduced by CNs issued in the period (issue_date based), floored at 0
   - MoM delta uses adjusted revenue
   - AR aging + per-customer AR allocate each customer's credits oldest-due-first (`adjustedArAmount` map)

## Remaining (resume here)

### Phase 1 leftovers
- [ ] Issue actions still write `status:"issued"` directly (documents list, detail) — consider routing through a shared helper

### Phase 2 — Debit note — CODE COMPLETE (runtime blocked on migration only)
Done:
- ✅ Migration file `sql/20260824_credit_note_guards_and_debit_note.sql` (**NOT yet applied**)
- ✅ `debit_note` in DocumentType + all constants/colors/prefixes (DB, amber)
- ✅ Print ref labels + adjustment totals framing (ยอดลด/ยอดเพิ่ม) in all templates
- ✅ `CreditNoteForm` generalized via `docType` prop ("credit_note" | "debit_note"): labels, doc_type, numbering prefix, note placeholder, over-credit guard CN-only, stock return CN-only
- ✅ Routes: new.tsx type=debit_note; edit.tsx branch; canEditDocument includes debit_note
- ✅ Entry points: document detail sent-invoice block (ออกใบลดหนี้/ออกใบเพิ่มหนี้ pair with guidance); deal page done-state pair; documents-list draft menu issue/edit/delete
- ✅ Settings: documents visibility list + numbering DOC_TYPES include debit_note (missing row handled gracefully until seeded)
- ✅ Financials mirrored for DB everywhere: deal financialSummary (ยอดเพิ่มหนี้ row, outstanding math), home getDealNetAdjustment, customers getDealOutstanding, useReports revenue/VAT/trend/outstanding (+ net per-customer AR allocation, net debits noted as summary-only)
- ✅ Integration tests `tests/integration/creditNote.spec.ts` (stock return idempotency + void reversal, stage semantics)

Still to do:
- [ ] **Apply migration** `sql/20260824_credit_note_guards_and_debit_note.sql` manually in Supabase SQL editor, statements ONE AT A TIME (ALTER TYPE can't run in a transaction). Debit-note creation will fail at runtime until this is applied.
- [ ] Optional polish: backdate audit fields on CN/DB issue (receipts have backdated_* columns)
