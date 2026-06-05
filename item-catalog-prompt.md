# Item Catalog & Stock — Standalone Build Prompt

> Self-contained prompt for building the Item Catalog and Stock Management pages.
> Read the Master Build Prompt for system-wide context (auth, schema, design tokens).
> This covers: item list, item detail, add/edit item form, stock movement log, manual stock in/out.

---

## What This Section Is

The catalog is where clients manage everything they sell — products and services. Products
have stock tracking with a full movement log. Services have no stock. Clients set up their
catalog once and reuse items when creating documents. Stock counts update automatically
when invoices are confirmed and can be adjusted manually for purchases, losses, or corrections.

---

## Routes

```
/catalog                        ← item list (main catalog page)
/catalog/new                    ← add new item
/catalog/:itemId                ← item detail + stock history
/catalog/:itemId/edit           ← edit item
```

---

## Section 1 — Item List (/catalog)

### Data Required

```typescript
const items = await supabase
  .from('items')
  .select('*')
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
│  TYPE FILTER TABS           │
├─────────────────────────────┤
│  PRODUCTS section           │
│  item card                  │
│  item card                  │
├─────────────────────────────┤
│  SERVICES section           │
│  item card                  │
│  item card                  │
├─────────────────────────────┤
│  BOTTOM NAV                 │
└─────────────────────────────┘
```

### Top Bar

```
สินค้า / บริการ               [+ เพิ่ม]
```

- Title: 15px, weight 600, #1A1A18
- "+ เพิ่ม" button: bg #378ADD, white, 8px radius, 13px, weight 500
- Tap → navigate to /catalog/new

### Search Bar

Full-width search input below top bar.
bg #F7F6F3, border 0.5px #E8E6DF, 8px radius, padding 10px 14px.
Placeholder: "ค้นหาสินค้า หรือบริการ..."
Filters item list in real time (debounced 200ms). Searches name field only.

### Type Filter Tabs

Three tabs below search bar:
- ทั้งหมด (All)
- สินค้า (Products)
- บริการ (Services)

Active tab: underline #378ADD, text #378ADD.
Inactive: text #888780.
Filters list by item_type.

### Item List — Two Sections

When "ทั้งหมด" tab active, items are grouped into two sections with headers:

**Section header style:** "สินค้า" / "บริการ" — 11px, uppercase, #888780, weight 600, padding 8px 0 6px

**If search active or type tab selected:** show flat list, no section headers.

### Item Card

White card, 0.5px border #E8E6DF, 10px radius, padding 14px 16px.
Full width. Tappable → navigate to /catalog/:itemId.

```
[Item name]                        [฿ price / unit]
[Type badge]  [Stock info]         [stock badge]
```

**Item name:** 14px, weight 600, #1A1A18

**Price:** 13px, weight 500, #1A1A18, right-aligned
- Format: "฿ 180 / รีม"
- If carton unit set: show secondary price below "฿ 1,800 / ลัง" in 11px #888780

**Type badge:**
- สินค้า: bg #E6F1FB, text #0C447C, 4px radius, 10px
- บริการ: bg #F1EFE8, text #888780, 4px radius, 10px

**Stock info (products only):**
- "สต็อก: 52 รีม" — 12px, #888780
- If carton unit set: "52 รีม (5.2 ลัง)" — show both
- If stock = 0: "สต็อก: หมดแล้ว" in red #C0392B

**Stock badge (products only):**
- Normal: no badge
- Low (stock ≤ threshold): "⚠ เหลือน้อย" — bg #FAEEDA, text #633806, 4px radius, 10px
- Out: "หมด" — bg #FCEBEB, text #791F1F, 4px radius, 10px

**Services:** never show stock info or stock badge. Show only name, price, and type badge.

### Empty State

If no items at all:
```
[centered — simple box illustration]
ยังไม่มีสินค้าหรือบริการ
เพิ่มรายการแรกเพื่อเริ่มต้น

[+ เพิ่มสินค้า / บริการ]  ← blue button
```

If search returns no results:
```
[centered]
ไม่พบ "[search term]"
ลองค้นหาด้วยคำอื่น
```

---

## Section 2 — Add / Edit Item Form (/catalog/new and /catalog/:itemId/edit)

### Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  TYPE SELECTOR              │
│  BASIC INFO SECTION         │
│  PRICING SECTION            │
│  UNIT SECTION               │  includes carton conversion
│  STOCK SECTION              │  products only
│  ACTION BAR                 │
└─────────────────────────────┘
```

### Top Bar

- New: "← ยกเลิก  เพิ่มสินค้า/บริการ"
- Edit: "← ยกเลิก  แก้ไขสินค้า  [ลบ]"
- "ลบ" (delete/deactivate): shown only in edit mode, tap → confirmation sheet

### Type Selector

Large segmented control at top of form. Two options:

```
[  🛍 สินค้า  |  ⚙ บริการ  ]
```

- bg #F7F6F3, border 0.5px #E8E6DF, 10px radius
- Active option: white bg, #1A1A18, slight shadow
- Inactive: #888780
- Switching type shows/hides stock and unit conversion sections

Default: สินค้า for new items.

### Basic Info Section

White card, padding 16px.

**ชื่อสินค้า / บริการ (required):**
- Full-width text input
- Placeholder: "เช่น กระดาษ A4, ออกแบบโลโก้..."
- 15px, autofocus on new item

**รายละเอียด (optional):**
- Multiline textarea, 2 rows
- Placeholder: "คำอธิบายเพิ่มเติม (ไม่บังคับ)"
- 13px

### Pricing Section

White card, padding 16px.

**ราคาต่อหน่วย (required):**
```
฿  [___________]
```
- Numeric input with ฿ prefix
- Keypad type: decimal
- Placeholder: "0.00"

**If carton unit is set (shown after unit section is filled):**
Show read-only calculated carton price below:
"= ฿ 1,800 ต่อลัง (10 รีม × ฿ 180)" — 12px, #888780
Updates live as unit price or qty_per_carton changes.

### Unit Section

White card, padding 16px.

**Section label:** "หน่วย" — 11px, uppercase, #888780

**หน่วยฐาน (base unit — required):**
```
หน่วยฐาน    [รีม ▾]
```
Dropdown with common units + "กำหนดเอง" (custom):
- ชิ้น, อัน, กล่อง, ลัง, รีม, แผ่น, ชุด, กิโลกรัม, ลิตร, ชั่วโมง, วัน, งาน, โครงการ
- "กำหนดเอง" → shows text input for custom unit

**หน่วยลัง / หน่วยใหญ่ (carton unit — optional, products only):**

```
หน่วยรอง    [เปิดใช้งาน ○]
```

Toggle off by default. When toggled on, reveals:

```
ชื่อหน่วยรอง   [ลัง ▾]        (same dropdown as base unit)
จำนวนต่อหน่วย  [10]           (how many base units per carton)
```

- "จำนวนต่อหน่วย": numeric input, integer only, min 1
- Placeholder: "เช่น 10 รีมต่อลัง"

**Live preview when carton set:**
```
1 ลัง = 10 รีม
ราคาต่อลัง = ฿ 1,800
```
Shown in a light blue info box #E6F1FB, 8px radius, below the carton fields.
Updates live as values change.

**Validation:**
- Base unit required
- If carton toggle on: carton unit name required, qty_per_carton ≥ 1
- Carton unit name must differ from base unit name

### Stock Section (products only — hidden for services)

White card, padding 16px.

**Section label:** "สต็อก" — 11px, uppercase, #888780

**สต็อกเริ่มต้น (new items only):**
```
จำนวนสต็อกเริ่มต้น    [0]   รีม
```
- Numeric input, default 0, min 0
- Unit label shown dynamically from base unit field
- If carton unit set: show "(= 0 ลัง)" hint below, updates live
- This creates the first stock_movement record (manual_in, reason = "สต็อกเริ่มต้น")

**For edit mode:** do not show initial stock field.
Stock adjustments in edit mode are done via stock in/out on item detail page — not here.

**จำนวนแจ้งเตือนสต็อกน้อย (low stock threshold):**
```
แจ้งเตือนเมื่อเหลือ    [5]   รีม
```
- Numeric input, default 5, min 0
- Unit label shown dynamically
- "ระบบจะแสดงเตือนเมื่อสต็อกเหลือน้อยกว่าจำนวนนี้" — 11px, #888780 below input

### Action Bar (fixed bottom)

**New item:**
- Full-width blue button: "บันทึกสินค้า / บริการ"
- On save → navigate to /catalog/:newItemId

**Edit item:**
- Two buttons: "บันทึกการเปลี่ยนแปลง" (blue, full width)

**Validation errors:**
- ชื่อสินค้า required: "กรุณาใส่ชื่อสินค้าหรือบริการ"
- ราคา required: "กรุณาใส่ราคา"
- Show inline below each field — no alert()

### Delete / Deactivate

Tapping "ลบ" in edit mode top bar shows confirmation bottom sheet:

```
ลบ [item name]?
รายการนี้จะถูกซ่อนจากแค็ตตาล็อก
เอกสารที่ใช้รายการนี้ไม่ได้รับผลกระทบ

[ลบรายการ]  (red)    [ยกเลิก]  (gray)
```

On confirm: set is_active = false (soft delete — never hard delete).
Item disappears from catalog list but remains on historical documents.

---

## Section 3 — Item Detail & Stock History (/catalog/:itemId)

### Data Required

```typescript
// Item data
const item = await supabase
  .from('items')
  .select('*')
  .eq('id', itemId)
  .single()

// Stock movements — most recent first
const movements = await supabase
  .from('stock_movements')
  .select('*')
  .eq('item_id', itemId)
  .order('created_at', { ascending: false })
  .limit(50)
```

### Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  ITEM SUMMARY CARD          │
│  STOCK STATUS CARD          │  products only
│  QUICK ACTIONS              │  products only
│  STOCK HISTORY              │  products only
│  ITEM DETAILS CARD          │  pricing, units, settings
└─────────────────────────────┘
```

### Top Bar

```
← สินค้า     [Item name]     [แก้ไข]
```

- "แก้ไข" → navigate to /catalog/:itemId/edit

### Item Summary Card

White card, padding 16px.

```
[Item name]                    [Type badge]
฿ 180 / รีม
฿ 1,800 / ลัง  ← if carton set
```

- Name: 18px, weight 700, #1A1A18
- Price: 15px, #444441
- Carton price: 13px, #888780

### Stock Status Card (products only)

White card, padding 16px. Most prominent card on the page.

```
สต็อกปัจจุบัน

52 รีม
(5.2 ลัง)          ← if carton unit set

[⚠ เหลือน้อย]     ← badge if low, hidden if normal
```

- "สต็อกปัจจุบัน": 11px, uppercase, #888780
- Stock number: 36px, weight 700
  - Normal: #1A1A18
  - Low: #633806
  - Zero: #C0392B
- Carton equivalent: 16px, #888780, below main number
- Low stock badge same style as catalog list

### Quick Actions (products only)

Two side-by-side buttons below stock status card:

**รับสินค้าเข้า (Stock In):**
- bg #EAF3DE, text #27500A, border 0.5px #C8E6B0, 8px radius
- Tap → opens Stock In modal (see below)

**ตัดสต็อก (Manual Stock Out):**
- bg #FCEBEB, text #791F1F, border 0.5px #F5C6C6, 8px radius
- Tap → opens Stock Out modal (see below)

### Stock History (products only)

**Section label:** "ประวัติการเคลื่อนไหวสต็อก" — 11px, uppercase, #888780

**Each movement row:**

```
[type icon]  รับสินค้าเข้า              +50 รีม
             10 พ.ค. 2568              คงเหลือ 52 รีม
             ซื้อสินค้าใหม่ · 5 ลัง
```

**Movement type icons and colors:**
| Type | Icon | Color |
|---|---|---|
| manual_in | ↑ | #27500A green |
| auto_out | ↓ | #888780 gray |
| manual_out | ↓ | #C0392B red |
| auto_in (restore) | ↑ | #888780 gray |

**Row fields:**
- Type label: 13px, weight 500
  - manual_in: "รับสินค้าเข้า"
  - auto_out: "ตัดสต็อก (ใบแจ้งหนี้)"
  - manual_out: "ตัดสต็อกด้วยตนเอง"
  - auto_in: "คืนสต็อก (ยกเลิกใบแจ้งหนี้)"
- Quantity: right-aligned, 13px, weight 600
  - Positive (in): "+50 รีม" in green #27500A
  - Negative (out): "-25 รีม" in #C0392B
- Date: 11px, #888780
- Balance after: "คงเหลือ 52 รีม" — 11px, #888780
- Reason / reference: 11px, #AAAAAA, italic
  - For auto movements: show document number "INV-2025-007" as tappable link → navigate to that document
  - For manual movements: show user-entered reason
  - If carton conversion used: "5 ลัง (50 รีม)" shown as additional line

**Load more:**
Show first 20 movements. "โหลดเพิ่มเติม" button at bottom if more exist.

**Empty state (no movements yet):**
"ยังไม่มีประวัติการเคลื่อนไหว" — centered, 13px, #888780

### Item Details Card

White card, padding 16px. Shows all item settings read-only.

```
ราคา           ฿ 180 / รีม
หน่วยรอง       1 ลัง = 10 รีม
แจ้งเตือน      เหลือน้อยกว่า 5 รีม
สถานะ          ใช้งานอยู่
```

Each row: label 12px #888780, value 13px #1A1A18, separated by 0.5px #F1EFE8 dividers.

---

## Stock In Modal

Triggered by "รับสินค้าเข้า" quick action button.
Bottom sheet, white, 16px radius top corners.

**Header:** "รับสินค้าเข้า — [item name]"

**Fields:**

**จำนวนที่รับ (required):**
```
รับเข้า  [___]  ลัง        ← if carton unit set, default to carton input
         = 0 รีม            ← live conversion hint
```

If no carton unit:
```
รับเข้า  [___]  รีม
```

- Numeric input, decimal allowed
- If carton unit set: user enters in carton unit by default
  - Show toggle: "ป้อนเป็น รีม แทน" — switches input to base unit
  - Conversion hint updates live
- Min: 0.001

**เหตุผล / หมายเหตุ (optional):**
```
[ซื้อสินค้าใหม่...]   ← placeholder
```
Free text, one line.

**Preview after this transaction:**
```
สต็อกปัจจุบัน     52 รีม
รับเข้า          +50 รีม  (5 ลัง)
─────────────────────────────
สต็อกหลังรับ      102 รีม  (10.2 ลัง)
```
Updates live as qty changes.

**Confirm button:** "ยืนยันรับสินค้าเข้า" — full width, green bg #27500A, white text

**On confirm:**
```typescript
// Convert to base unit if entered in carton
const qtyBase = enteredInCarton
  ? Math.round(qtyCarton * item.qty_per_carton * 1000) / 1000
  : qtyBase

const newStock = item.stock_count + qtyBase

// Update item stock
await supabase
  .from('items')
  .update({ stock_count: newStock })
  .eq('id', item.id)

// Log movement
await supabase
  .from('stock_movements')
  .insert({
    item_id: item.id,
    user_id: currentUserId,
    movement_type: 'manual_in',
    qty_base: qtyBase,
    qty_carton: enteredInCarton ? qtyCarton : null,
    carton_unit: enteredInCarton ? item.carton_unit : null,
    balance_after: newStock,
    reason: reason || null
  })
```

Dismiss modal, refresh stock status card and history list.
Show success toast: "รับสินค้าเข้าแล้ว +[qty] [unit] ✓"

---

## Stock Out Modal

Triggered by "ตัดสต็อก" quick action button.
Same structure as Stock In modal but for manual reductions.

**Header:** "ตัดสต็อก — [item name]"

**Fields:**

**จำนวนที่ตัด (required):**
Same input pattern as stock in — base unit or carton if set.

**เหตุผล (recommended):**
```
[สินค้าเสียหาย / สูญหาย...]   ← placeholder
```
Not required but strongly encouraged — show hint "แนะนำให้ระบุเหตุผล" in 11px #888780.

**Preview:**
```
สต็อกปัจจุบัน     52 รีม
ตัดออก           -10 รีม
─────────────────────────────
สต็อกคงเหลือ      42 รีม
```

If resulting stock < 0:
```
⚠ สต็อกจะติดลบ — ระบบจะตั้งค่าเป็น 0
```
Warning in amber. Clamp stock at 0, do not allow negative.

**Confirm button:** "ยืนยันตัดสต็อก" — full width, red bg #C0392B, white text

**On confirm:** same pattern as stock in but movement_type = 'manual_out', qty_base is negative.

---

## Loading States

**Catalog list:** 4 skeleton item cards, static gray.
**Item detail:** skeleton for each card section.
**Stock history:** 5 skeleton rows.

---

## Component Breakdown

| Component | Props |
|---|---|
| `CatalogList` | items, onItemTap, onAdd |
| `CatalogSearch` | value, onChange |
| `CatalogTypeTabs` | activeTab, onChange |
| `ItemCard` | item, onTap |
| `ItemForm` | itemId (edit) or null (new), onSave |
| `TypeSelector` | value, onChange |
| `UnitSelector` | value, onChange, onCustom |
| `CartonUnitSection` | enabled, unit, qtyPerCarton, onChange |
| `CartonPreview` | baseUnit, cartonUnit, qtyPerCarton, unitPrice |
| `StockInitialField` | value, onChange, unit, cartonUnit, qtyPerCarton |
| `ItemDetail` | itemId |
| `StockStatusCard` | item |
| `StockHistory` | movements, onLoadMore |
| `StockMovementRow` | movement, item |
| `StockInModal` | item, isOpen, onConfirm, onDismiss |
| `StockOutModal` | item, isOpen, onConfirm, onDismiss |
| `StockTransactionPreview` | currentStock, delta, unit, cartonUnit, qtyPerCarton |

---

## What This Section Does NOT Do

- Does not handle purchase orders or restock requests
- Does not support stock across multiple locations or warehouses
- Does not support item variants (size, color)
- Does not support two-level unit conversion (pcs → box → carton)
- Does not allow negative stock — floor at 0 always
- Does not bulk import items — one at a time only in v1
