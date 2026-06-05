# Home Dashboard — Standalone Build Prompt

> Self-contained prompt for building the Home Dashboard page.
> Read the Master Build Prompt for system-wide context (auth, schema, tax logic, design tokens).
> This prompt covers everything specific to the Home Dashboard only.

---

## What This Page Is

The home dashboard is the first screen users see after login. It is the daily command
center — a quick health check of the business followed by a list of all active deals
sorted by most recent activity. Users should be able to understand the state of their
entire business and take action on any deal without navigating anywhere else.

---

## Route

```
/home  (default route after login)
```

---

## Data Required

Fetch the following when the page loads:

```typescript
// 1. All deals for current user with their latest document
const deals = await supabase
  .from('deals')
  .select(`
    *,
    customers(id, name),
    documents(
      id, doc_type, doc_number, status,
      total_amount, net_payable, due_date,
      created_at, updated_at
    )
  `)
  .eq('user_id', currentUserId)
  .eq('is_active', true)
  .order('updated_at', { ascending: false })

// 2. Summary calculations (derive from deals data — no extra query needed)
// - Total unpaid: sum net_payable of all sent/overdue billing notes
// - Total received this month: sum net_payable of billing notes paid this calendar month
// - Total overdue: sum net_payable of all overdue billing notes
```

All summary numbers are derived from the deals data already fetched.
Do not make separate queries for summary numbers.

---

## Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │  Fixed, white
├─────────────────────────────┤
│  SUMMARY ROW                │  3 metric cards
├─────────────────────────────┤
│  NEEDS ACTION section       │  Active deals
│  deal card                  │
│  deal card                  │
│  deal card                  │
├─────────────────────────────┤
│  RECENTLY DONE section      │  Last 5 completed deals
│  deal card (done)           │
│  deal card (done)           │
├─────────────────────────────┤
│  BOTTOM NAV                 │  Fixed
└─────────────────────────────┘
```

Top bar and bottom nav are fixed. Everything between scrolls.

---

## Top Bar

```
สวัสดี, คุณ[ชื่อ] 👋          [+ สร้างใหม่]
วันนี้มี N รายการรอดำเนินการ
```

**Left side:**
- Greeting — 15px, weight 500, #1A1A18
  - "สวัสดี, คุณ[first name]" — pull first name from client_profiles.company_name_th
  - If company name not yet set: "สวัสดี 👋"
- Subtitle — 12px, #888780
  - "วันนี้มี N รายการรอดำเนินการ" where N = count of deals needing action
  - "ทุกรายการเรียบร้อย ✓" in green #27500A if N = 0

**Right side:**
- "+ สร้างใหม่" button — bg #378ADD, white text, 8px radius, 13px, weight 500
- Tap → opens New Deal bottom sheet (see below)

---

## Summary Row

Three equal-width metric cards in a horizontal row.
Cards: white, 0.5px border #E8E6DF, 10px radius, padding 12px 14px.

**Card 1 — ยังไม่ชำระ**
- Value: sum of net_payable from all billing notes with status 'sent' or 'overdue'
- Value color: #1A1A18
- Label: "ยังไม่ชำระ" — 11px, #888780

**Card 2 — รับแล้วเดือนนี้**
- Value: sum of net_payable from billing notes with status 'paid' where paid_at is in current calendar month
- Value color: #1A1A18
- Label: "รับแล้วเดือนนี้" — 11px, #888780

**Card 3 — เกินกำหนด**
- Value: sum of net_payable from billing notes with status 'overdue'
- Value color: #C0392B (red) if value > 0, else #1A1A18
- Label: "เกินกำหนด" — 11px, #888780

**Amount formatting:**
- Always prefix with ฿ and space: "฿ 45,000"
- Use Thai number formatting with comma separator
- If value is 0: show "฿ 0" not blank
- Font size: 18px, weight 500

**Tap behavior:**
- Card 1 tap → navigates to Documents page filtered by status=unpaid
- Card 2 tap → navigates to Documents page filtered by paid this month
- Card 3 tap → navigates to Documents page filtered by status=overdue

---

## Deal Cards

Used in both sections. Same component, slightly different appearance for done deals.

### Active Deal Card

White card, 0.5px border #E8E6DF, 12px radius, padding 14px 16px.
Full width. Tappable — navigates to /deals/:dealId.

**Layout:**

```
[Customer name]                    [฿ Amount]
[Item summary]                     [Status badge]
[Next action label →]
```

**Customer name** — 14px, weight 600, #1A1A18

**Item summary** — 12px, #888780, one line, truncated
- Auto-generated from line items of most recent non-voided document
- Format: "ชื่อสินค้า × qty" or "ชื่อสินค้า × qty และอีก N รายการ"

**Amount** — 14px, weight 600, #1A1A18, right-aligned
- Show net_payable of most recent billing note if exists
- Otherwise net_payable of most recent invoice
- Otherwise net_payable of quotation

**Status badge** — right-aligned below amount (same badge colors as deal page)

**Next action label** — 12px, #378ADD, weight 500, bottom left
- Shows the plain-language next step
- Always ends with →
- Examples:
  - "ลูกค้าตกลงแล้ว? →"
  - "ส่งใบแจ้งหนี้แล้ว? →"
  - "วางบิลเพื่อเก็บเงิน →"
  - "รับเงินแล้ว? →"
- If overdue: label turns red #C0392B and shows "⚠ เกินกำหนด — รับเงินแล้ว? →"

**Next action label by deal state:**

| Deal state | Label |
|---|---|
| Quotation draft | "ส่งใบเสนอราคาแล้ว? →" |
| Quotation sent | "ลูกค้าตกลงแล้ว? →" |
| Invoice draft | "ส่งใบแจ้งหนี้แล้ว? →" |
| Invoice sent | "วางบิลเพื่อเก็บเงิน →" |
| Billing note draft | "ส่งใบวางบิลแล้ว? →" |
| Billing note sent | "รับเงินแล้ว? →" |
| Billing note overdue | "⚠ เกินกำหนด — รับเงินแล้ว? →" |

**Overdue card border:**
If deal has an overdue billing note — card left border: 3px solid #C0392B.
This makes overdue deals scannable instantly in a long list.

### Done Deal Card

Same layout but simplified. No next action label.
Reduced visual weight — border #F0EEE8, bg #FAFAF8.
Amount in #888780 (muted). Status badge shows "ชำระแล้ว" green.

---

## Needs Action Section

Section header: "รายการที่ต้องดำเนินการ" — 12px, weight 600, #888780, uppercase, letter-spacing 0.05em

Shows all deals where status is NOT done (not fully paid).
Sorted by: overdue first, then by updated_at descending.

**Overdue deals always float to top** regardless of sort preference.
Within overdue group: sorted by due_date ascending (most overdue first).
Within non-overdue group: sorted by updated_at descending.

If no active deals:
```
[centered illustration — simple document icon]
ยังไม่มีรายการ
กด "+ สร้างใหม่" เพื่อเริ่มต้น
```

---

## Recently Done Section

Section header: "เสร็จสิ้นล่าสุด" — same style as above

Shows last 5 deals where billing note status = 'paid'.
Sorted by paid_at descending.

Separated from active section by a 0.5px horizontal divider #E8E6DF.

If no completed deals yet: hide this section entirely — do not show empty state.

---

## New Deal Bottom Sheet

Triggered by "+ สร้างใหม่" button in top bar.

Bottom sheet slides up from bottom. White, 16px radius top corners.
Drag handle at top center (gray pill, 4px × 32px, #E8E6DF).

**Header:** "คุณต้องการทำอะไร?" — 16px, weight 600, #1A1A18. Padding 20px.

**Three option rows** — each full-width, tappable:

```
┌─────────────────────────────────────┐
│  📋  ส่งใบเสนอราคาก่อน              │
│      เหมาะเมื่อยังไม่ได้ตกลงราคา    │
├─────────────────────────────────────┤
│  🧾  ออกใบแจ้งหนี้เลย               │
│      ตกลงราคาแล้ว พร้อมเก็บเงิน     │
├─────────────────────────────────────┤
│  💰  รับเงินแล้ว ต้องการออกใบเสร็จ  │
│      เก็บเงินแล้ว ต้องการเอกสาร     │
└─────────────────────────────────────┘
```

Each row: padding 16px, border-bottom 0.5px #E8E6DF, bg white on default, #F7F6F3 on tap.
Icon: 24px emoji left side.
Title: 14px, weight 600, #1A1A18.
Subtitle: 12px, #888780, margin-top 2px.
Chevron → right side, #CCCCCC.

**On tap:**
- Option 1 → navigate to /documents/new?type=quotation
- Option 2 → navigate to /documents/new?type=invoice
- Option 3 → navigate to /documents/new?type=billing_note

**Cancel row** at bottom:
"ยกเลิก" — 14px, #888780, centered, padding 16px. Dismisses sheet.

---

## Bottom Navigation

Fixed at bottom. White, border-top 0.5px #E8E6DF.
Four equal tabs:

| Tab | Icon | Label | Route |
|---|---|---|---|
| Home | 🏠 | หน้าหลัก | /home |
| Documents | 📄 | เอกสาร | /documents |
| Catalog | 📦 | สินค้า | /catalog |
| Settings | ⚙️ | ตั้งค่า | /settings |

Active tab: icon and label in #378ADD.
Inactive: #888780.
Font: 10px, centered below icon.
Icon size: 22px.
Tab padding: 10px 4px.

Use actual icon library (e.g. lucide-react) — not emoji — for nav icons.

---

## Pull to Refresh

Support pull-to-refresh gesture on mobile.
On release: re-fetch all deals data and recalculate summary numbers.
Show subtle loading spinner at top during refresh.

---

## Loading State

On initial load, show skeleton placeholders:

**Summary row:** 3 skeleton cards — gray #F1EFE8 rounded rectangles, height 56px.

**Deal cards:** 3 skeleton cards — gray #F1EFE8, height 80px, 12px radius.
Show immediately, no delay.

No animation — static skeletons keep it simple.

---

## Empty State (brand new client, no deals yet)

If no deals exist at all, replace both sections with a centered welcome state:

```
[large document illustration — simple, line-art style]

ยินดีต้อนรับ!
เริ่มต้นด้วยการสร้าง deal แรกของคุณ

[+ สร้าง deal แรก]  ← blue button, same as top bar button
```

Button tap → same New Deal bottom sheet.

---

## Error State

If data fetch fails:
```
[centered]
โหลดข้อมูลไม่สำเร็จ
[ลองใหม่]  ← blue text button
```

Tap "ลองใหม่" → retry fetch.

---

## Performance Notes

- Fetch deals with documents in a single query using Supabase select with nested relations
- Do not fetch line items on home screen — item summary is stored in deals.title or derived from first document's line items already in the fetch
- Limit recently done section to 5 records using .limit(5) on the query filter
- Summary numbers are calculated client-side from already-fetched data — no extra DB calls

---

## Component Breakdown

| Component | Props |
|---|---|
| `HomeTopBar` | userName, actionCount, onNewDeal |
| `SummaryRow` | unpaidTotal, receivedThisMonth, overdueTotal, onCardTap |
| `SummaryCard` | label, value, isAlert, onTap |
| `DealCard` | deal, customer, latestDocument, onTap |
| `DoneDealCard` | deal, customer, paidAt, amount, onTap |
| `NeedsActionSection` | deals, onDealTap |
| `RecentlyDoneSection` | deals, onDealTap |
| `NewDealSheet` | isOpen, onSelect, onDismiss |
| `BottomNav` | activeTab, onTabChange |

---

## What This Page Does NOT Do

- Does not show document details — tapping a deal navigates to deal page
- Does not filter or search deals — that is the Documents page
- Does not show stock levels — that is the Catalog page
- Does not handle settings — that is the Settings page
- Does not perform any document actions directly — all actions happen on the deal page
