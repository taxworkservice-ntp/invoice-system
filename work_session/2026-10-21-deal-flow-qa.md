# 2026-10-21 — The deal-flow QA: three fixes, a frozen-invoice blocker, and the click-through journey

## What changed

### 1. The next step for an invoice stranded behind a draft billing note

`895ee1d` — Saving a billing note as a draft flips its invoices to
`in_billing` and locks them to that note. The deal page matched no branch
for that status, so it showed **no next step at all** on 3 live deals
(10 invoices). It now offers the note itself — "ส่งใบวางบิลให้ลูกค้า" —
guarded by the same permission gate the note's own draft action uses.

Verified additive: over 185 deals with documents, 184 next steps are
byte-identical; only the stranded ones gained the action.

### 2. Adjustment notes are issued, and debit notes are staged

`d4913ae` — The send path wrote `status = "sent"` for every document type,
but an adjustment note may only be `draft`/`issued`. A credit note sent
from the deal page therefore failed to save, and the deal page offered a
credit note as "ส่งใบวางบิลให้ลูกค้า". Credit/debit notes are now issued as
`issued`, and a debit note counts as done (the home page already read it
that way). The money is unaffected — `receivable.ts` treats `sent` and
`issued` alike.

### 3. The delivery-note button preselects every delivery note

`3acb48c` — The button said "ออกใบแจ้งหนี้จากใบส่งของ **N ใบ**" but handed
over only the **first** note, so the invoice it created billed one note of
the many it counted. The deal page now passes every billable note
(`dnIds=…`, comma separated) and the form preselects them all. The single
`dnId` still works, so a deal with one billable note behaves exactly as
before.

## The blocker the journey found

**An invoice made from a quotation could not change its status at all.**

`trg_guard_invoice_per_quotation` (from
`sql/20260822_relax_quotation_invoice_uniqueness.sql`) stops a _new_ invoice
from a fully-billed quotation — but it was written as a trigger on
`before insert or update of status`, so it also rejected every later status
change of an existing invoice:

| transition                                | result                                           |
| ----------------------------------------- | ------------------------------------------------ |
| sent → in_billing (behind a billing note) | rejected: "ใบเสนอราคานี้ถูกออกใบแจ้งหนี้ครบแล้ว" |
| sent → paid / partially_paid / overdue    | rejected, same message                           |

The invoice-from-quotation flow always converts its source quotation, so
**every** invoice made that way was frozen: the billing note could not be
saved (the officer saw a generic "บันทึกใบวางบิลไม่สำเร็จ" and the link row
was left behind) and the payment could not be recorded (the receipt
confirmation syncs the invoice in the same transaction, so it rolled back).

In the live workspace 2 invoices are affected (`INV-2569-10-0012`,
`INV-2026-10-0003` — both `sent`, both with a `converted` quotation); the
13 invoices that did reach `in_billing` were all made from delivery notes.

`aa757f5` — `sql/20261021_quotation_invoice_status_guard.sql` narrows the
guard to the creation of an invoice (or one re-pointed at another
quotation). An existing invoice moves through the flow freely.

> **PENDING: apply `sql/20261021_quotation_invoice_status_guard.sql`**
> (Supabase SQL editor). Until it is applied the quotation chain cannot
> work, and the journey skips it with that reason. Nothing else needs a
> migration, and no data surgery is needed — the two stuck invoices heal
> through the UI once the guard is fixed.

## The click-through journey

`6e4da21` — `e2e/deal-flow-journey.spec.ts` walks the flow through the UI
and asserts the database after every step: delivery note → invoice →
billing note → receipt → paid. It checks the statuses, the links (and
their `released_at`), the amounts, the receipt's allocation and the deal's
own state.

The three fixes are asserted there, so they cannot come back unnoticed:

- the invoice stranded behind a draft billing note still gets its next step
  (and the invoice itself is _not_ offered);
- an adjustment note lands as `issued` and the deal reads done;
- the bulk delivery-note button preselects every billable note.

The spec reads and writes through the signed-in workspace client (the anon
key + the user's own JWT), so it runs wherever the test account exists —
it does **not** need `supabase_key.md`. It cleans up exactly its own rows.
The quotation chain is gated by a probe: it skips with the reason above
until the migration is applied.

## Verification

- `npx tsc -b --force` — clean.
- `npm run lint` — 0 errors (89 pre-existing warnings), the design-system,
  form-routing and year-era checks pass.
- `npm run test:print-layout:estimate` / `:fill` — pass (the print layout
  is untouched).
- `npx playwright test e2e/deal-flow-journey.spec.ts` — 9 pass, 5 skipped
  (the quotation chain).
- The whole `journeys` project: 39 pass; the 16 failures are all
  `ENOENT supabase_key.md` — the specs that need the service-role key, which
  this machine does not have.

## Next

1. Apply `sql/20261021_quotation_invoice_status_guard.sql` (SQL editor).
2. Run `npx playwright test e2e/deal-flow-journey.spec.ts` where
   `supabase_key.md` exists — the whole journey, quotation chain included.
3. Ship gate: the commits are on `taxworkservice-ntp/remote-work-Invoice`
   (5 ahead of `origin/main`) → push the branch, check the Vercel preview
   (read-only), then merge to `main`.
4. The stranded invoices in the live workspace heal through the UI once the
   fix ships (the officer sends the note); a revert simply hides the action
   again.
