# Stock Workflow — Standalone Build Prompt

> Self-contained prompt for implementing the complete stock management workflow.
> Read the Master Build Prompt and Item Catalog prompt for context.
> This prompt covers: all stock in triggers, all stock out triggers, the deduction
> trigger setting, stock return on void, and the complete movement log behavior.
> If this prompt conflicts with the Item Catalog prompt on stock behavior — this prompt wins.

---

## Core Principle

Stock is tracked in base unit only. Always. No exceptions.
Carton units are a display and entry convenience — internally everything is stored and
calculated in base unit (reams, pieces, hours, etc.).

Stock count is always ≥ 0. Never allow negative stock in the database.
If a deduction would result in negative stock — clamp to 0 and log a warning.
Never block the user from completing a transaction because of insufficient stock.

---

## Stock Movement Types

Every change to stock creates one record in the stock_movements table.

```
movement_type    direction    triggered by
─────────────────────────────────────────────────────────────
manual_in        +            User taps "รับสินค้าเข้า" on item detail
manual_out       -            User taps "ตัดสต็อก" on item detail
auto_out         -            Invoice or delivery note confirmed (sent)
auto_in          +            Invoice or delivery note voided after confirmation
return_in        +            User confirms stock return after void
```

---

## Stock In — All Triggers

### 1. Manual Stock In (from item detail page)

Triggered when user taps "รับสินค้าเข้า" and confirms the stock in modal.

**When to use:** receiving new stock from a supplier, restocking, correcting a count.

**Input:** quantity in carton unit (if carton set) or base unit. Reason (optional).

**Logic:**
```typescript
async function manualStockIn(
  itemId: string,
  userId: string,
  qtyEntered: number,
  enteredInCarton: boolean,
  reason?: string
): Promise<void> {

  const item = await getItem(itemId)

  // Convert to base unit
  const qtyBase = enteredInCarton && item.qty_per_carton
    ? round3(qtyEntered * item.qty_per_carton)
    : qtyEntered

  const newStock = round3(item.stock_count + qtyBase)

  // Update item stock count
  await supabase
    .from('items')
    .update({ stock_count: newStock, updated_at: now() })
    .eq('id', itemId)

  // Log movement
  await supabase
    .from('stock_movements')
    .insert({
      item_id: itemId,
      user_id: userId,
      movement_type: 'manual_in',
      qty_base: qtyBase,
      qty_carton: enteredInCarton ? qtyEntered : null,
      carton_unit: enteredInCarton ? item.carton_unit : null,
      balance_after: newStock,
      reason: reason || null,
      document_id: null
    })
}
```

### 2. Initial Stock (new item creation)

When a new product item is created with stock_count > 0, create the first movement record:

```typescript
// After inserting new item
if (item.item_type === 'product' && initialStock > 0) {
  await supabase
    .from('stock_movements')
    .insert({
      item_id: newItem.id,
      user_id: userId,
      movement_type: 'manual_in',
      qty_base: initialStock,
      qty_carton: null,
      balance_after: initialStock,
      reason: 'สต็อกเริ่มต้น',
      document_id: null
    })
}
```

### 3. Stock Return After Void (return_in)

When a document is voided and the user confirms stock return.
Covered in detail in the Stock Return section below.

---

## Stock Out — All Triggers

### Trigger Setting (per client)

Each client has a stock deduction trigger setting stored in client_profiles:

```sql
-- Add to client_profiles table
stock_deduct_trigger  text  not null  default 'invoice'
-- Values: 'invoice' | 'delivery_note'
```

**Setting UI location:** Settings → สต็อก

```
ตัดสต็อกอัตโนมัติเมื่อ

○ ส่งใบแจ้งหนี้       ← default
  ระบบตัดสต็อกเมื่อคุณยืนยันว่าส่งใบแจ้งหนี้แล้ว

○ ออกใบส่งของ
  ระบบตัดสต็อกเมื่อคุณสร้างและส่งใบส่งของ
  เหมาะสำหรับธุรกิจที่เบิกสินค้าออกจากคลังก่อนออกบิล
```

This setting applies to ALL auto stock out behavior for that client.
Default is 'invoice' — covers most small businesses.

---

### Trigger 1 — Invoice Sent (when setting = 'invoice')

**When:** invoice document status changes from 'draft' → 'sent'
**How triggered:** user taps "ส่งใบแจ้งหนี้แล้ว" action button on deal page

**Logic:**
```typescript
async function deductStockOnInvoiceSent(
  invoiceId: string,
  userId: string
): Promise<StockWarning[]> {

  // Only run if client setting is 'invoice'
  const clientProfile = await getClientProfile(userId)
  if (clientProfile.stock_deduct_trigger !== 'invoice') return []

  const lineItems = await getInvoiceLineItems(invoiceId)
  const invoice = await getDocument(invoiceId)
  const warnings: StockWarning[] = []

  for (const item of lineItems) {
    // Skip services and free-text items (no item_id)
    if (item.item_type !== 'product' || !item.item_id) continue

    const catalogItem = await getItem(item.item_id)
    const newStock = round3(catalogItem.stock_count - item.quantity)
    const finalStock = Math.max(0, newStock)

    // Update stock
    await supabase
      .from('items')
      .update({ stock_count: finalStock, updated_at: now() })
      .eq('id', item.item_id)

    // Log movement
    await supabase
      .from('stock_movements')
      .insert({
        item_id: item.item_id,
        user_id: userId,
        movement_type: 'auto_out',
        qty_base: -item.quantity,
        qty_carton: item.qty_carton ? -item.qty_carton : null,
        carton_unit: item.carton_unit || null,
        balance_after: finalStock,
        reason: `ตัดสต็อกจากใบแจ้งหนี้ ${invoice.doc_number}`,
        document_id: invoiceId
      })

    // Collect warnings if stock was insufficient
    if (newStock < 0) {
      warnings.push({
        itemName: item.item_name,
        requested: item.quantity,
        available: catalogItem.stock_count,
        unit: item.unit
      })
    }
  }

  return warnings
}
```

**After calling this function:**
If warnings array is not empty — show toast for each:
"⚠ [item name] สต็อกไม่พอ (มี [available] [unit] แต่ใช้ [requested] [unit])"
Toast style: amber bg, does not block user, auto-dismiss after 4 seconds.

---

### Trigger 2 — Delivery Note Sent (when setting = 'delivery_note')

**When:** delivery note document status changes from 'draft' → 'sent'
**How triggered:** user taps "ส่งใบส่งของแล้ว" or marks delivery note as sent

**Logic:** identical to invoice deduction above but:
- Only runs if `stock_deduct_trigger === 'delivery_note'`
- Uses delivery note's line items
- Reason text: `ตัดสต็อกจากใบส่งของ ${deliveryNote.doc_number}`
- movement_type: 'auto_out' (same type — reason text differentiates)

**Important edge case:**
If setting is 'delivery_note' and an invoice is sent WITHOUT a delivery note
(e.g. service client accidentally creates a delivery note), stock does NOT deduct on invoice.
Stock only deducts when delivery note is sent.

---

### Trigger 3 — Manual Stock Out (from item detail page)

Triggered when user taps "ตัดสต็อก" and confirms the stock out modal.

**When to use:** damaged goods, lost items, stock count correction, expired products.

```typescript
async function manualStockOut(
  itemId: string,
  userId: string,
  qtyBase: number,
  reason?: string
): Promise<void> {

  const item = await getItem(itemId)
  const newStock = round3(item.stock_count - qtyBase)
  const finalStock = Math.max(0, newStock)

  if (newStock < 0) {
    // Log that we clamped — useful for debugging
    console.warn(`Stock clamped to 0 for item ${itemId}: would have been ${newStock}`)
  }

  await supabase
    .from('items')
    .update({ stock_count: finalStock, updated_at: now() })
    .eq('id', itemId)

  await supabase
    .from('stock_movements')
    .insert({
      item_id: itemId,
      user_id: userId,
      movement_type: 'manual_out',
      qty_base: -qtyBase,
      qty_carton: null,
      balance_after: finalStock,
      reason: reason || 'ตัดสต็อกด้วยตนเอง',
      document_id: null
    })
}
```

---

## Stock Return On Void

This is the most important flow that was missing from the original design.

### When It Applies

Stock return is offered when ANY of these documents are voided:
- Invoice (if setting = 'invoice' and invoice was previously sent)
- Delivery note (if setting = 'delivery_note' and delivery note was previously sent)

Stock return is NOT offered when:
- Quotation is voided (quotation never deducts stock)
- Billing note is voided (billing note never deducts stock)
- Receipt is voided (receipts are permanent — never voided)
- Document was still in 'draft' when voided (draft never deducted stock)
- Document had no product line items

### The Void Flow With Stock Return

When user initiates void and copy on a qualifying document, the confirmation sheet
changes to include the stock return question:

**Step 1 — Void confirmation (existing void and copy flow):**
```
ยกเลิกและสร้างเอกสารใหม่?

เอกสาร INV-2025-007 จะถูกยกเลิก
และสำเนาใหม่จะถูกสร้างให้แก้ไข

[ยกเลิกเอกสาร]  (red)    [ไม่ใช่]  (gray)
```

**Step 2 — Stock return question (shown immediately after void confirmed, before navigation):**
Only shown if document had product line items and stock was previously deducted.

```
คืนสต็อกสินค้าด้วยไหม?

สินค้าต่อไปนี้จะถูกคืนสต็อก:
• กระดาษ A4 × 50 รีม
• หมึกพิมพ์ × 5 กล่อง

[คืนสต็อก ✓]  (green)    [ไม่ต้อง]  (gray)
```

User chooses:
- "คืนสต็อก" → run restoreStockOnVoid()
- "ไม่ต้อง" → skip stock restore, proceed to new draft document

### Stock Restore Logic

```typescript
async function restoreStockOnVoid(
  voidedDocumentId: string,
  userId: string
): Promise<void> {

  const lineItems = await getDocumentLineItems(voidedDocumentId)
  const document = await getDocument(voidedDocumentId)

  for (const item of lineItems) {
    if (item.item_type !== 'product' || !item.item_id) continue

    const catalogItem = await getItem(item.item_id)
    const newStock = round3(catalogItem.stock_count + item.quantity)

    // Update stock
    await supabase
      .from('items')
      .update({ stock_count: newStock, updated_at: now() })
      .eq('id', item.item_id)

    // Log as return_in movement
    await supabase
      .from('stock_movements')
      .insert({
        item_id: item.item_id,
        user_id: userId,
        movement_type: 'return_in',
        qty_base: item.quantity,
        qty_carton: item.qty_carton || null,
        carton_unit: item.carton_unit || null,
        balance_after: newStock,
        reason: `คืนสต็อกจากการยกเลิก ${document.doc_number}`,
        document_id: voidedDocumentId
      })
  }
}
```

Show success toast after restore:
"คืนสต็อกแล้ว [N] รายการ ✓" — green toast, auto-dismiss.

---

## Movement Log — Display Rules

The stock movement log on the item detail page shows all movements in reverse
chronological order. Each movement type displays differently:

| movement_type | Icon | Color | Label Thai |
|---|---|---|---|
| manual_in | ↑ | #27500A | รับสินค้าเข้า |
| auto_out | ↓ | #888780 | ตัดสต็อก (เอกสาร) |
| manual_out | ↓ | #C0392B | ตัดสต็อกด้วยตนเอง |
| auto_in | ↑ | #888780 | คืนสต็อก (ยกเลิกเอกสาร) |
| return_in | ↑ | #378ADD | คืนสต็อกจากการยกเลิก |

**Quantity display:**
- Stock in movements: "+50 รีม" in green #27500A
- Stock out movements: "-25 รีม" in red #C0392B
- Return in movements: "+50 รีม" in blue #378ADD (visually distinct from regular manual_in)

**Document reference:**
For auto_out, auto_in, and return_in movements — show document number as a tappable link.
Tap → navigate to /documents/:documentId.

**Carton display:**
If qty_carton is set on the movement record, show below the base qty:
"(5 ลัง)" in 11px #888780.

---

## Stock Calculation Helpers

All stock calculations use these helpers. Use them everywhere — never raw arithmetic.

```typescript
// lib/stock.ts

// Round to 3 decimal places (base unit precision)
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

// Convert carton qty to base unit qty
export function cartonsToBase(
  cartons: number,
  qtyPerCarton: number
): number {
  return round3(cartons * qtyPerCarton)
}

// Convert base unit qty to carton qty (for display)
export function baseToCartons(
  base: number,
  qtyPerCarton: number
): number {
  return round3(base / qtyPerCarton)
}

// Format stock for display — always shows base, optionally carton
export function formatStock(
  stockBase: number,
  baseUnit: string,
  cartonUnit?: string,
  qtyPerCarton?: number
): string {
  const baseStr = `${stockBase} ${baseUnit}`
  if (!cartonUnit || !qtyPerCarton) return baseStr
  const cartons = baseToCartons(stockBase, qtyPerCarton)
  return `${baseStr} (${cartons} ${cartonUnit})`
}

// Check if stock is low
export function isLowStock(
  stockCount: number,
  threshold: number
): boolean {
  return stockCount > 0 && stockCount <= threshold
}

// Check if stock is out
export function isOutOfStock(stockCount: number): boolean {
  return stockCount <= 0
}
```

---

## Complete Stock Flow Diagram (text)

```
NEW ITEM CREATED
      │
      ▼
initial stock > 0? ──yes──► manual_in log created
      │
      ▼
QUOTATION SENT
(no stock change)
      │
      ▼
INVOICE CREATED (draft)
(no stock change)
      │
      ▼
INVOICE SENT
      │
      ├── setting = 'invoice' ──► auto_out per product line item
      │                           warnings if insufficient
      │
      └── setting = 'delivery_note' ──► no stock change yet
                │
                ▼
          DELIVERY NOTE CREATED (draft)
          (no stock change)
                │
                ▼
          DELIVERY NOTE SENT
                │
                └──► auto_out per product line item
                     warnings if insufficient

      │
      ▼
INVOICE / DELIVERY NOTE VOIDED
      │
      ├── was sent? ──no──► no stock change (draft never deducted)
      │
      └── was sent? ──yes──► show stock return prompt
                              │
                              ├── user confirms ──► return_in per product item
                              │
                              └── user declines ──► no stock change

MANUAL STOCK IN (from item detail)
──► manual_in log, stock increases

MANUAL STOCK OUT (from item detail)
──► manual_out log, stock decreases, floor at 0
```

---

## Settings Page — Stock Section

Add a stock settings section to the Settings page.

**Route:** /settings (existing page — add a new card)

**Card title:** "การจัดการสต็อก" — 11px uppercase, #888780

```
ตัดสต็อกอัตโนมัติเมื่อ

○ ส่งใบแจ้งหนี้        ← radio button
  ระบบตัดสต็อกทันทีที่ยืนยันว่าส่งใบแจ้งหนี้แล้ว

○ ออกใบส่งของ          ← radio button
  ระบบตัดสต็อกเมื่อส่งใบส่งของ
  เหมาะสำหรับธุรกิจที่เบิกสินค้าออกจากคลังก่อน
```

Save button: "บันทึก" — blue, saves to client_profiles.stock_deduct_trigger.
Show success toast on save.

**Default:** 'invoice' for all existing and new clients.

---

## Database Changes Required

Add one column to client_profiles:

```sql
alter table client_profiles
add column stock_deduct_trigger text not null default 'invoice'
check (stock_deduct_trigger in ('invoice', 'delivery_note'));
```

Add return_in to the stock_movement_type enum:

```sql
alter type stock_movement_type add value 'return_in';
```

No other schema changes needed — the existing stock_movements table handles all
movement types correctly with these additions.

---

## Edge Cases and Rules

**1. Delivery note setting but no delivery note created:**
If client uses 'delivery_note' setting but sends an invoice without ever creating
a delivery note — stock never deducts automatically. User must deduct manually
if needed. This is intentional — the setting means "I control stock via delivery notes."

**2. Multiple delivery notes for one invoice:**
If a user creates two delivery notes for the same invoice (partial shipments — rare),
each delivery note deducts stock independently when sent. No double-deduction check
is needed because each delivery note has its own line items.

**3. Credit note and stock:**
Credit notes do not automatically restore stock in v1. If goods are physically returned
the user should do a manual stock in with reason "ลูกค้าคืนสินค้า". Keep it simple.

**4. Quotation and stock:**
Quotations never affect stock. Even if a quotation is for physical goods, stock only
moves when the invoice or delivery note reaches 'sent' status.

**5. Billing note and stock:**
Billing notes never affect stock. They are financial documents only.

**6. Receipt and stock:**
Receipts never affect stock. They are payment confirmation documents only.

**7. Free-text line items (no item_id):**
Never deduct stock for free-text line items. item_id = null means no catalog item
to deduct from. Skip silently.

**8. Service items:**
Never deduct stock for service type items even if item_id is set.
Always check item_type === 'product' before any stock operation.

**9. Concurrent updates:**
Supabase does not handle optimistic locking by default. For this app scale
(single user per client account) this is acceptable. Do not implement
row-level locking in v1.

---

## What This Prompt Does NOT Cover

- Purchase orders or supplier management (v2)
- Stock reservations on quotation approval (v2)
- Multi-location stock (v2)
- Stock alerts via email or push notification (v2)
- Bulk stock adjustment (v2)
- Stock valuation or COGS calculation (v2)
