# E2E Test Plan — Pre-Launch Regression Suite

_Last updated: 2026-08-25. Status: ALL 7 SPECS GREEN ×2 consecutive full-suite runs
(16/16 tests). Feature freeze can be lifted per section 9._

## 1. Why this exists

The app accumulated UI-level bugs that vitest integration tests (API-level) cannot catch:
async-prefill races, dialogs lost during refactors, route gaps, selector drift.
This Playwright suite simulates real user journeys through the running app.

Rule going forward (feature freeze): no new features until the golden journeys in section 5
pass twice consecutively. Every future bug of the "click did nothing" class must become
a test here.

## 2. How to run

- npx playwright test                                          # all (setup + journeys)
- npx playwright test --project=journeys e2e/<file>.spec.ts    # one spec
- npx playwright show-trace test-results/<dir>/trace.zip       # debug a failure

- Dev server auto-starts on :5173 (webServer in playwright.config.ts, reuseExistingServer).
- Failure artifacts: test-results/*/test-failed-1.png (screenshot-on-failure is ON —
  READ THE PNG, it shows the actual page state) + trace.zip.
- npm run e2e script exists.

## 3. Environment and data safety

- Test workspace: testcompany-vitest@gmail.com / test1234 (same isolated user as vitest
  integration tests — NEVER point at real/demo accounts).
- Auth: e2e/auth.setup.ts signs in via supabase-js, injects session into localStorage key
  sb-<ref>-auth-token, saves e2e/.auth/state.json (gitignored).
- API setup/cleanup: e2e/helpers/env.ts exports api() (signed-in anon, ASYNC) and admin()
  (service role, cascade cleanup).
- Isolation: each spec creates its own customer + deal in beforeAll and calls
  deleteDealCascade(dealId) in afterAll.
- Env vars: .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) + supabase_key.md (service role).

Gotchas learned already:
- api() is async — always (await api()).from(...). e2e/helpers/data.ts wraps it; use its helpers.
- The app's Supabase client reads the injected session on page load (works).

## 4. Files

- playwright.config.ts                # workers=1 serial; screenshot+trace on failure; webServer
- e2e/auth.setup.ts                   # session -> storageState
- e2e/helpers/env.ts                  # api()/admin() clients, creds, BASE_URL, uid()
- e2e/helpers/data.ts                 # createCustomer/Deal/Document/LineItems, deleteDealCascade, today
- e2e/deal-quotation.spec.ts          # 1 QT form -> send            (green)
- e2e/invoice-from-quotation.spec.ts  # 2 convert QT -> invoice -> sent (green; form saves invoice as status=sent directly)
- e2e/delivery-partial.spec.ts        # 3 partial DN 4/10 -> second DN completes (green; draft DNs must be sent to count)
- e2e/invoice-from-dn.spec.ts         # 4 ref/detail modes + over-billing clamp (green; UI clamps qty, no error toast path)
- e2e/billing-note.spec.ts            # 5 BN create draft -> send (green; window.confirm on send is auto-accepted)
- e2e/receipt-draft.spec.ts           # 6 draft receipt save -> edit -> confirm (green; seeds a bank account fixture)
- e2e/credit-note.spec.ts             # 7 CN issue -> credit badge -> void and reissue (green)

## 5. Golden journeys (definition of done = all green x2 consecutive runs)

1. QT: new deal form -> customer picker (search, click row) -> click button
   "เพิ่มสินค้าหรือบริการ" -> fill line -> "ตรวจสอบและบันทึก" -> deal page shows
   "รอส่งใบเสนอราคา" -> send -> "รอลูกค้าตอบ"
2. INV from QT: step headers 1-5 render -> "สร้างใบแจ้งหนี้" -> "รอวางบิล" ->
   send -> "ใบแจ้งหนี้ส่งแล้ว"
3. DN partial: qty 4/10 -> save -> "ส่งแล้ว 4 / 10" -> second DN prefilled 6 ->
   "ส่งครบแล้ว"
4. INV from DN: ref mode (default) shows one summary row per DN and NO detail
   inputs; toggle "โหมดอ้างอิง" off -> editable grid; qty 99 -> save blocked
   with "มากกว่ายอดคงเหลือ"
5. BN: "สร้างใบวางบิล" from deal (invoice pre-checked) -> "บันทึกร่าง" -> send
   -> "ใบวางบิลส่งแล้ว"
6. Draft receipt: "ข้ามใบวางบิล แล้วบันทึกรับเงิน" -> "บันทึกใบเสร็จ (ร่าง)" ->
   deal shows "รอยืนยันการรับเงิน" -> "แก้ไขฉบับร่าง" reopens modal titled
   "แก้ไขใบเสร็จร่าง" -> "บันทึกการแก้ไข" -> confirm -> deal done
7. CN: "ออกใบลดหนี้" from paid deal -> issue -> "เครดิตคงเหลือ" badge on deal ->
   CN detail -> "ยกเลิกและออกฉบับใหม่" + correction reason -> fresh draft CN

## 6. RESOLVED DEBUGGING NOTES (2026-08-25, kept as conventions)

Spec 1 was blocked by issues that recur across specs — the fixes below are now
applied everywhere and are the house rules for new specs:

1. **Env loading**: helpers/env.ts reads .env, .env.local, .env.development
   (Vercel-pulled files) and falls back to supabase_key.md for the service key.
   Missing VITE_SUPABASE_URL fails fast with a clear message.
2. **Confirm modal on save**: "ตรวจสอบและบันทึก" opens a "ยืนยันการบันทึก"
   Modal (div.fixed.inset-0, no role=dialog) — click its exact "บันทึก".
   Scope modals by heading filter, NOT `.last()` (toasts/bars are also .fixed).
3. **URL waits**: wait for /deals/<uuid> or /documents/<uuid> regexes.
   Loose /\/deals\// matches /deals/new and captures garbage ids.
4. **Home vs deal labels**: "รอส่งใบเสนอราคา", "ใบแจ้งหนี้ส่งแล้ว",
   "ใบวางบิลส่งแล้ว", "รอยืนยันการรับเงิน" are home-pipeline hints only.
   Deal page equivalents: pill "ร่าง"/"รอวางบิล"/"รอชำระ"/"ชำระแล้ว" +
   main-action button (see getStatusPill / mainAction in deals/[id].tsx).
5. **window.confirm**: sending invoice/billing_note/tax_invoice_receipt from
   the deal page calls window.confirm — register page.once("dialog") accept.
6. **Unawaited queries**: `(await api()).from(...).single()` without await
   destructures a thenable -> undefined. Always `await (await api()).from(...)`.
7. **Form load race**: document forms bail silently while deal data is still
   loading (e.g. CreditNoteForm handleSave returns if customer/items not set).
   Gate issue/save clicks on a loaded-state signal such as the FormActionBar
   context label "{customer} · [1-9]\d* รายการ" (count must be nonzero).
8. **Draft DNs don't count as delivered**: after "สร้างใบส่งของฉบับร่าง",
   send via "บันทึกว่าส่งของแล้ว" before asserting "ส่งแล้ว N / M".
9. **Over-billing**: the DN-invoice grid clamps qty to remaining (input max +
   onChange clamp); assert the clamp (toHaveValue), not an error toast.
10. **Bank account fixture**: transfer payments need a bank_accounts row;
    receipt-draft.spec seeds one and asserts the disabled placeholder
    ("ยังไม่มีบัญชีธนาคาร") disappears (guards the default-select race).

## 7. Selector conventions

- Prefer getByRole("button", { name }) and getByPlaceholder (Thai labels stable).
- Ambiguous names appearing twice (page + dialog): scope with
  page.locator('[role="dialog"], .fixed').last().getByRole(...)
- data-testid only as last resort.
- After Supabase writes, assert resulting UI state (stage labels, badges),
  not network idle.

## 8. Regression guards encoded by these tests

Each spec guards a real bug found manually before the suite existed. If a
spec fails, suspect a regression of the original bug first:

- receipt-draft: payment modal default bank account race (list still loading
  -> null state that looks selected); confirm dialog must exist (was deleted
  during a refactor); แก้ไขฉบับร่าง must reopen the modal (edit route has no
  receipt branch and used to bounce back to the deal page).
- credit-note: issued CN must be voidable with reason + reissue preserving
  converted_from_id; stock return reverses on void.
- invoice-from-dn: ref-mode summary rows must not leak into item previews;
  over-credit/over-billing guards must block.

## 9. After all specs are green

1. DONE 2026-08-25 — full suite passed twice consecutively (16/16 both runs).
2. Next: merge backup/print-pre-refactor -> main.
3. Then proceed to closed beta (2-5 real users, feedback triage) per the
   pre-launch process discussed 2026-08-25.

Optional hardening backlog found during debugging (not launch-blocking):
- CreditNoteForm.handleSave silently no-ops when customer/items are still
  loading; consider a toast or disabled-with-reason state for clarity.
- The over-credit error message in CreditNoteForm contains a stray "cho"
  typo ("จำนวนที่จะออกบิล cho ...").
