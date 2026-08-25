# E2E Test Plan — Pre-Launch Regression Suite

_Last updated: 2026-08-25. Status: IN PROGRESS — infrastructure done, spec 1 mid-debug, specs 2-7 written but not yet run._

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
- e2e/deal-quotation.spec.ts          # 1 QT form -> send            <-- CURRENTLY DEBUGGING (section 6)
- e2e/invoice-from-quotation.spec.ts  # 2 convert QT -> invoice -> send (written, untested)
- e2e/delivery-partial.spec.ts        # 3 partial DN 4/10 -> second DN completes (written, untested)
- e2e/invoice-from-dn.spec.ts         # 4 ref/detail modes + over-billing guard (written, untested)
- e2e/billing-note.spec.ts            # 5 BN create -> send (written, untested)
- e2e/receipt-draft.spec.ts           # 6 draft receipt save -> edit -> confirm (written, untested)
- e2e/credit-note.spec.ts             # 7 CN issue -> credit badge -> void and reissue (written, untested)

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

## 6. CURRENT DEBUGGING STATE (start here)

Spec 1 deal-quotation.spec.ts, test "create deal with quotation draft via form".
Progress:
- DONE: customer picker — click "เลือกลูกค้า", fill search placeholder
  "ค้นหาชื่อ รหัส หรือเลขผู้เสียภาษี", click getByText(name).first(); modal
  closes and step 1 shows the customer.
- DONE: line items — form starts with ZERO rows. Click button
  "เพิ่มสินค้าหรือบริการ" first, then fill placeholder
  "พิมพ์ชื่อสินค้าหรือบริการ..." and press Enter.
- CURRENT FAILURE: after clicking "ตรวจสอบและบันทึก", assertion
  getByText('รอส่งใบเสนอราคา') times out on the deal page.

Next steps:
1. Read test-results/deal-quotation-*/test-failed-1.png (screenshot is
   captured). Check: did navigation to /deals/{id} happen? Validation banner?
   Does the stage label differ from "รอส่งใบเสนอราคา"?
2. Possible causes:
   - Save button label is conditional in src/app/(client)/deals/new.tsx
     (~L2471): "ออกเอกสารทันที" / "บันทึกร่าง" / "ตรวจสอบและบันทึก" depending
     on doc type and experience mode. The test owner's isSimpleMode may make
     it "บันทึกร่าง".
   - Verify actual stage label for a draft quotation on /deals/{id} via
     getStageInfo in src/app/(client)/home.tsx.
3. After spec 1 is green, run specs 2-7 one at a time, screenshot-first.

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

1. Run the full suite twice consecutively — must pass both times.
2. Merge backup/print-pre-refactor -> main.
3. Then proceed to closed beta (2-5 real users, feedback triage) per the
   pre-launch process discussed 2026-08-25.
