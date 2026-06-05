# Customer Page — Standalone Build Prompt

> Self-contained prompt for building the Customer List and Customer Detail pages.
> Read the Master Build Prompt for system-wide context (auth, schema, design tokens).
> This covers: customer list, customer detail, inline editing, and deal history per customer.

---

## What This Section Is

The customer section is where clients manage all their customers in one place. Customers
can be created inline from the document form, but this section is where they come to
edit customer info, find a specific customer, or review the full history of deals with
that customer. It is a supporting section — not the primary daily workflow.

---

## Routes

```
/customers                    ← customer list
/customers/:customerId        ← customer detail + edit + deal history
```

No separate edit route. Editing happens inline on the detail page.

---

## Where Customers Come From

Customers are created in two places:

1. **Inline from document form** — user types a new name in the customer selector
   and taps "+ เพิ่ม [name] เป็นลูกค้าใหม่". Creates a minimal customer record
   (name only). User fills in full details later from this customer page.

2. **From customer list** — user taps "+ เพิ่ม" on the customer list page.
   Opens full add customer form with all fields.

Both paths create a record in the customers table.

---

## Section 1 — Customer List (/customers)

### Data Required

```typescript
const customers = await supabase
  .from('customers')
  .select(`
    *,
    deals(count)
  `)
  .eq('user_id', currentUserId)
  .eq('is_active', true)
  .order('name', { ascending: true })
```

### Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  SEARCH BAR                 │
├─────────────────────────────┤
│  CUSTOMER LIST              │
│  customer card              │
│  customer card              │
│  customer card              │
└─────────────────────────────┘
```

### Top Bar

```
ลูกค้า                        [+ เพิ่ม]
```

- Title: 15px, weight 600, #1A1A18
- "+ เพิ่ม" button: bg #378ADD, white, 8px radius, 13px, weight 500
- Tap → opens Add Customer bottom sheet (see below)

### Search Bar

Full-width input below top bar.
bg #F7F6F3, border 0.5px #E8E6DF, 8px radius, padding 10px 14px.
Placeholder: "ค้นหาชื่อลูกค้า หรือเลขผู้เสียภาษี..."
Filters list in real time (debounced 200ms).
Searches: name, tax_id fields.

### Customer Card

White card, 0.5px border #E8E6DF, 10px radius, padding 14px 16px.
Full width. Tappable → navigate to /customers/:customerId.

```
[Customer name]                    [N deals →]
[Tax ID if exists]
[Phone if exists]
```

**Customer name:** 14px, weight 600, #1A1A18

**Tax ID:** 12px, #888780
- Format: "เลขผู้เสียภาษี: xxx-xxx-xxxxx"
- Hidden if not set — do not show empty label

**Phone:** 12px, #888780
- Hidden if not set

**Deal count:** right-aligned, 12px, #378ADD
- "N deals →" where N = total deals (active + completed)
- If 0 deals: "ยังไม่มี deal" in #AAAAAA

**Incomplete profile warning:**
If customer has no tax_id AND no address set — show small amber pill:
"⚠ ข้อมูลไม่ครบ" — 10px, bg #FAEEDA, text #633806
This reminds client to complete the customer profile so PDFs print correctly.

### Empty State

If no customers at all:
```
[centered — simple person icon illustration]
ยังไม่มีลูกค้า
ลูกค้าจะปรากฏที่นี่เมื่อคุณสร้าง deal แรก
หรือเพิ่มลูกค้าได้เลย

[+ เพิ่มลูกค้า]  ← blue button
```

If search returns no results:
```
ไม่พบ "[search term]"
ลองค้นหาด้วยชื่อหรือเลขผู้เสียภาษี
```

---

## Add Customer Bottom Sheet

Triggered from "+ เพิ่ม" button on customer list.
Bottom sheet slides up. White, 16px radius top corners.
Drag handle at top.

**Header:** "เพิ่มลูกค้าใหม่" — 16px, weight 600, padding 20px

**Fields:**

**ชื่อบริษัท / ชื่อลูกค้า (required):**
- Full-width text input
- Placeholder: "เช่น บริษัท มาลี จำกัด หรือ คุณสมชาย"
- Autofocus on open

**เลขผู้เสียภาษี (optional):**
- Text input, numeric keyboard
- Placeholder: "13 หลัก (ถ้ามี)"
- Hint below: "จำเป็นสำหรับใบกำกับภาษี" — 11px, #888780

**ที่อยู่ (optional):**
- Multiline textarea, 2 rows
- Placeholder: "ที่อยู่สำหรับพิมพ์บนเอกสาร"

**เบอร์โทร (optional):**
- Text input, phone keyboard

**อีเมล (optional):**
- Text input, email keyboard

**ชื่อผู้ติดต่อ (optional):**
- Text input
- Placeholder: "ชื่อคนที่ติดต่อด้วย"

**Action buttons:**
- "บันทึก" — full width, blue, saves customer
- "ยกเลิก" — full width, gray text, dismisses sheet

**On save:**
- Validate name is not empty
- Insert customer record
- Dismiss sheet
- Customer appears in list immediately
- Show toast: "เพิ่มลูกค้าแล้ว ✓"

---

## Section 2 — Customer Detail (/customers/:customerId)

### Data Required

```typescript
// Customer info
const customer = await supabase
  .from('customers')
  .select('*')
  .eq('id', customerId)
  .single()

// All deals for this customer with latest document
const deals = await supabase
  .from('deals')
  .select(`
    *,
    documents(
      id, doc_type, doc_number, status,
      total_amount, net_payable, issue_date,
      updated_at, paid_at
    )
  `)
  .eq('user_id', currentUserId)
  .eq('customer_id', customerId)
  .order('updated_at', { ascending: false })
```

### Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  CUSTOMER INFO CARD         │  name, tax ID, address — editable inline
│  SUMMARY CARD               │  total deals, total value, unpaid amount
│  DEALS SECTION              │  all deals with this customer
└─────────────────────────────┘
```

### Top Bar

```
← ลูกค้า     [Customer name]     [···]
```

**··· menu:**
- "ลบลูกค้า" — deactivate customer (soft delete)
  - Confirmation: "ลบ [name]? ข้อมูล deal และเอกสารทั้งหมดจะยังคงอยู่"
  - On confirm: set is_active = false, navigate back to customer list

---

### Customer Info Card

White card, padding 16px, 10px radius.

**View mode (default):**

```
[Customer name]                    [แก้ไข]
เลขผู้เสียภาษี: xxx-xxx-xxxxx
ที่อยู่: xxx
เบอร์โทร: xxx
อีเมล: xxx
ชื่อผู้ติดต่อ: xxx
```

- Name: 16px, weight 700, #1A1A18
- All other fields: 13px, #444441
- Labels: 11px, #888780
- Empty fields: hidden — do not show empty label rows
- "แก้ไข" button: top right, 12px, #378ADD, tappable

**If any field is missing (tax ID or address):**
Show amber banner inside card:
"⚠ ข้อมูลไม่ครบ — กรอกให้ครบเพื่อให้เอกสาร PDF แสดงถูกต้อง"
11px, bg #FAEEDA, text #633806, 6px radius, padding 8px 10px, below fields.

**Edit mode (tap "แก้ไข"):**

All fields become editable inline — same card, fields transform to inputs.

```
[input: ชื่อ]                      [บันทึก] [ยกเลิก]
[input: เลขผู้เสียภาษี]
[textarea: ที่อยู่]
[input: เบอร์โทร]
[input: อีเมล]
[input: ชื่อผู้ติดต่อ]
```

- "บันทึก": 12px, #378ADD, saves and returns to view mode
- "ยกเลิก": 12px, #888780, discards changes and returns to view mode
- On save: update customers table, show toast "บันทึกแล้ว ✓"
- Validation: name cannot be empty

---

### Summary Card

White card, padding 16px, 10px radius.
Three metrics in a row — same style as home dashboard summary row.

**Deal ทั้งหมด:**
- Value: total count of deals for this customer
- Label: "deal ทั้งหมด"

**มูลค่ารวม:**
- Value: sum of net_payable across all paid billing notes for this customer
- Label: "รับแล้วทั้งหมด"
- Format: "฿ 45,000"

**ค้างชำระ:**
- Value: sum of net_payable of sent/overdue billing notes for this customer
- Label: "ค้างชำระ"
- Value color: #C0392B if > 0, else #1A1A18

---

### Deals Section

**Section label:** "ประวัติ deal" — 11px, uppercase, #888780, weight 600

**Filter tabs:**
- ทั้งหมด (All) — default
- กำลังดำเนินการ (Active)
- เสร็จสิ้น (Done)

**Deal row** — simpler than home dashboard deal card, no next action label:

```
[Deal title / item summary]        [฿ amount]
[Latest doc number · date]         [Status badge]
```

White card, 0.5px border #E8E6DF, 10px radius, padding 12px 14px.
Tappable → navigate to /deals/:dealId.

**Deal title:** 13px, weight 600, #1A1A18
- Use deals.title if set
- Otherwise auto-generate from first document's line items
- Format: "ชื่อสินค้าแรก × qty" or "ชื่อสินค้าแรก และอีก N รายการ"

**Latest doc:** 11px, #888780
- Show most recent non-voided document number + issue date
- Format: "INV-2025-007 · 3 พ.ค. 2568"

**Amount:** 13px, weight 600, #1A1A18, right-aligned
- Show net_payable of most recent billing note if exists
- Otherwise total_amount of most recent invoice or quotation

**Status badge:** same colors and labels as deal page and home dashboard

**Sort:** updated_at descending — most recently active deal first

**Empty state (no deals):**
"ยังไม่มี deal กับลูกค้ารายนี้" — centered, 13px, #888780

---

## Relationship to Document Form Customer Selector

The customer selector in the document form (inline add customer) creates a minimal
customer record with name only. When this happens:

- Customer is created with only name filled in
- All other fields (tax_id, address, phone) are null
- The "⚠ ข้อมูลไม่ครบ" warning will appear on the customer card and detail page
- Client is encouraged to complete the profile from /customers/:customerId

This means the customer page serves as the "complete your customer profiles" nudge
for clients who create customers on the fly during document creation.

---

## Loading State

**Customer list:** 4 skeleton cards, static gray #F1EFE8.
**Customer detail:** skeleton for each card section.

---

## Component Breakdown

| Component | Props |
|---|---|
| `CustomerList` | customers, onCustomerTap, onAdd |
| `CustomerSearch` | value, onChange |
| `CustomerCard` | customer, dealCount, onTap |
| `AddCustomerSheet` | isOpen, initialName, onSave, onDismiss |
| `CustomerDetail` | customerId |
| `CustomerInfoCard` | customer, onSave |
| `CustomerInfoViewMode` | customer, onEdit |
| `CustomerInfoEditMode` | customer, onSave, onCancel |
| `CustomerSummaryCard` | totalDeals, totalReceived, unpaidAmount |
| `CustomerDealsList` | deals, activeFilter, onFilterChange, onDealTap |
| `CustomerDealRow` | deal, latestDocument, onTap |

---

## What This Page Does NOT Do

- Does not create deals directly — navigating to a deal taps through to deal page
- Does not show individual documents — documents are accessed via deal page
- Does not support multiple contacts per customer in v1
- Does not support customer categories or tags in v1
- Does not import customers from CSV or external source in v1
- Does not send messages or emails to customers
- Does not hard delete customers — soft delete only (is_active = false)
