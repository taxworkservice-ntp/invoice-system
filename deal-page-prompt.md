# Deal Page — Standalone Build Prompt

> This is a self-contained prompt for building the Deal Detail page.
> Read the full Master Build Prompt for system-wide context (auth, schema, tax logic, etc.)
> This prompt covers everything specific to the Deal page only.

---

## What This Page Is

The Deal page is the most important page in the app. It is the daily working screen where
users move a customer transaction forward from start to finish. It answers three questions
at a glance:

1. **Who and how much** — which customer, what amount
2. **What to do next** — one obvious action button
3. **What happened** — full document timeline

The user should never feel lost on this page. Every state has a clear next step.

---

## Route

```
/deals/:dealId
```

---

## Data Required

Fetch the following when the page loads:

```typescript
// 1. Deal record
const deal = await supabase
  .from('deals')
  .select('*, customers(*)')
  .eq('id', dealId)
  .single()

// 2. All documents for this deal, ordered by created_at ascending
const documents = await supabase
  .from('documents')
  .select('*')
  .eq('deal_id', dealId)
  .order('created_at', { ascending: true })

// 3. Line items for each document (for item summary display)
const lineItems = await supabase
  .from('document_line_items')
  .select('*')
  .in('document_id', documents.map(d => d.id))
```

---

## Page Layout — Four Zones (top to bottom)

```
┌─────────────────────────────┐
│  TOP BAR                    │  Fixed, white, border-bottom
├─────────────────────────────┤
│  ZONE 1 — Customer card     │  Who + amount summary
│  ZONE 2 — Pipeline + action │  Stage track + one action button
│  ZONE 3 — Document timeline │  History of all documents
│  ZONE 4 — Side actions      │  Secondary actions, quiet
└─────────────────────────────┘
```

Scroll area covers zones 1–4. Top bar is fixed.

---

## Top Bar

```
← หน้าหลัก     [Customer name]     ···
```

- Back arrow navigates to Home (deal pipeline)
- Title = customer company name, truncated with ellipsis if too long
- ··· menu (top right) opens a bottom sheet with:
  - สร้าง deal ใหม่จากอันนี้ (Copy deal)
  - ดูข้อมูลลูกค้า (View customer profile)

---

## Zone 1 — Customer Card

White card, 10px radius, 0.5px border #E8E6DF.

**Left side:**
- Customer name — 15px, weight 600, #1A1A18
- Item summary — 12px, #888780, max 2 lines
  - Auto-generated from first document's line items
  - Format: "ชื่อสินค้า × qty, ชื่อสินค้า × qty"
  - If more than 2 items: "ชื่อสินค้าแรก × qty และอีก N รายการ"
- Status pill — shown below item summary
  - Derive from current active document status (see status pill rules below)

**Right side:**
- Amount — 20px, weight 700, #1A1A18
  - Show net_payable of the most recent non-voided billing note if exists
  - Otherwise show net_payable of most recent invoice
  - Otherwise show net_payable of quotation
- Amount label below — 11px, #888780
  - "ยอดที่ต้องรับ" if billing note exists
  - "ยอดในใบแจ้งหนี้" if invoice but no billing note
  - "ยอดในใบเสนอราคา" if quotation only

**Status pill rules:**

| Deal state | Pill text | Color |
|---|---|---|
| Has draft document | ร่าง | gray bg #F1EFE8, text #888780 |
| Quotation sent, awaiting approval | รอลูกค้าตอบ | amber bg #FAEEDA, text #633806 |
| Invoice sent, not yet collected | รอวางบิล | blue bg #E6F1FB, text #0C447C |
| Billing note sent, not overdue | รอชำระ | blue bg #E6F1FB, text #0C447C |
| Billing note overdue | เกินกำหนด | red bg #FCEBEB, text #791F1F |
| Fully paid | ชำระแล้ว | green bg #EAF3DE, text #27500A |

**Quick note field (collapsed by default):**
Below the item summary, a subtle "+ เพิ่มโน้ต" link in 11px #888780.
Tap to expand a single-line text input. Saves to deals.note column on blur.
If note already exists, show it directly (not collapsed).

---

## Zone 2 — Pipeline Card

White card, 10px radius, 0.5px border #E8E6DF. Padding 16px.

### Stage Track

Four stages displayed horizontally with connectors between them:

```
[✓] ── [✓] ── [3] ── [4]
ใบเสนอ  ใบแจ้ง  วางบิล  เสร็จ
ราคา    หนี้   เก็บเงิน  สิ้น
```

**Stage dot states:**
- Done: 30px circle, bg #EAF3DE, text #27500A, shows ✓
- Active: 30px circle, bg #378ADD, text white, shows stage number, box-shadow 0 0 0 4px #E6F1FB
- Pending: 30px circle, bg #F1EFE8, text #AAAAAA, shows stage number

**Connector states:**
- Between two done stages: 2px line, #C8E6B0 (green)
- Involving pending stage: 2px line, #E8E6DF (gray)

**Stage labels** below each dot, 10px, centered:
- Done: #27500A
- Active: #378ADD, weight 600
- Pending: #888780

**Which stage is active — derive from documents:**

| Active stage | Condition |
|---|---|
| Stage 1 — ใบเสนอราคา | Latest non-voided doc is a quotation |
| Stage 2 — ใบแจ้งหนี้ | Latest non-voided doc is an invoice not yet in billing |
| Stage 3 — วางบิล/เก็บเงิน | Latest non-voided doc is a billing note (sent or overdue) |
| Stage 4 — เสร็จสิ้น | All documents resolved, billing note paid |

**Skipped stages:** if deal started at invoice (no quotation), stage 1 dot shows as a small
gray dash — not a ✓, not pending. Communicates "not applicable" rather than "not done."

---

### Action Button

Full-width button below the stage track.

**Normal state:** bg #378ADD, text white, 13px padding, 8px radius, weight 600

**Overdue state:** bg #C0392B, text white — replaces blue entirely when billing note is overdue

**Button label and action by stage:**

| Stage | Button label | On tap |
|---|---|---|
| Quotation draft | 📤 ส่งใบเสนอราคาแล้ว | Set quotation status → sent |
| Quotation sent | ✅ ลูกค้าตกลงแล้ว → สร้างใบแจ้งหนี้ | Convert quotation, create invoice draft, navigate to invoice form |
| Invoice draft | 📤 ส่งใบแจ้งหนี้แล้ว | Set invoice status → sent, trigger stock deduction |
| Invoice sent | 📋 วางบิล → ขอรับชำระ | Open billing note form (pre-filled with this invoice) |
| Billing note draft | 📤 ส่งใบวางบิลแล้ว | Set billing note status → sent |
| Billing note sent | 💰 รับเงินแล้ว → ยืนยัน | Open payment confirmation modal |
| Billing note overdue | ⚠️ เกินกำหนด — รับเงินแล้ว? | Same as above — open payment confirmation modal |
| Done | — | No button shown. Show "เสร็จสิ้น ✓" text in green instead |

**Hint text** below button, 11px #888780, centered:
- If billing note exists: "ครบกำหนด [due_date] · [doc_number]"
- If due date is past: hint text turns red #791F1F
- Otherwise: show document number only

---

## Zone 3 — Document Timeline

Section label: "ประวัติเอกสาร" — 11px, uppercase, #888780, weight 600

Timeline renders all documents for this deal in chronological order (oldest first).
Each document is one timeline row.

### Timeline Row Structure

```
[dot]
 |        [document card — tappable]
[dot]
 |        [document card — tappable]
[dot last] [document card — tappable, current = blue border]
```

**Left column (28px wide):**
- Dot: 10px circle, color by status (see dot colors below)
- Vertical line: 1.5px, #E8E6DF, connecting dots
- Last row: no line below

**Document card (flex: 1):**
- bg white, 0.5px border #E8E6DF, 8px radius, padding 10px 12px
- margin-bottom 8px
- Tap → navigate to /documents/:documentId
- Hover: border-color → #378ADD

**Current active document card:**
- border-color #378ADD
- bg #FAFCFF
- Document type label in blue

**Card left column:**
- Document type name — 12px, weight 600, #1A1A18 (or #378ADD if current)
- Document number — 11px, #888780
- Date — 10px, #AAAAAA
  - For billing note: show "issue_date · ครบ due_date"
  - If due date is past and unpaid: due date portion in red

**Card right column:**
- Amount — 13px, weight 600, #1A1A18
  - Show net_payable for billing notes and receipts
  - Show total_amount for invoices and quotations
- Status badge (see badge colors below)
- "⬇ PDF" — 10px, #378ADD, tappable — triggers PDF generation and download

**Dot colors by document status:**

| Status | Dot color |
|---|---|
| draft | #CCCCCC |
| sent / in_billing | #378ADD |
| converted | #AAAAAA |
| paid / generated | #27500A |
| overdue | #C0392B |
| voided | #DDDDDD |

**Badge colors:**

| Status | Badge text | bg | text color |
|---|---|---|---|
| draft | ร่าง | #F1EFE8 | #888780 |
| sent | ส่งแล้ว | #E6F1FB | #0C447C |
| in_billing | อยู่ในวางบิล | #E6F1FB | #0C447C |
| converted | แปลงแล้ว | #F1EFE8 | #888780 |
| paid | ชำระแล้ว | #EAF3DE | #27500A |
| overdue | เกินกำหนด | #FCEBEB | #791F1F |
| voided | ยกเลิกแล้ว | #F1EFE8 | #AAAAAA |
| generated | ออกแล้ว | #EAF3DE | #27500A |

**Voided documents:**
Voided rows are shown collapsed by default under a toggle at the bottom of the timeline:
"แสดงเอกสารที่ยกเลิก (N)" — 11px, #888780, tappable.
Tap to reveal voided rows inline. Tap again to collapse.
Voided cards have reduced opacity (0.5) and strikethrough on the document number.

---

## Zone 4 — Side Actions Card

White card, 10px radius, 0.5px border #E8E6DF. Padding 14px 16px.

Section label: "เพิ่มเติม" — same style as other section labels.

Two buttons side by side, equal width:

**Button 1 — Delivery Note**
- Label: "📦 บันทึกการส่งของ"
- Visible only if deal has at least one product line item
- Tap → navigate to /documents/new?type=delivery_note&dealId=xxx
- Style: bg #F7F6F3, border 0.5px #E8E6DF, 7px radius, 12px text, #444441

**Button 2 — Void / Edit**
- Label: "✏️ ยกเลิก / แก้ไข"
- Visible always
- Tap → opens bottom sheet:
  - "แก้ไขเอกสารล่าสุด" (if current doc is draft — direct edit)
  - "ยกเลิกและสร้างใหม่" (if current doc is sent or later — void and copy flow)
  - "ยกเลิก" (cancel sheet)

**Credit Note button** — only shown when deal is fully done (stage 4):
- Appears as a third button or replaces the delivery note button if no products
- Label: "📄 ออกใบลดหนี้"
- Tap → navigate to /documents/new?type=credit_note&dealId=xxx

---

## Payment Confirmation Modal

Triggered by the main action button when billing note is in 'sent' or 'overdue' state.

Full-screen bottom sheet, white, 16px radius top corners.

**Header:** "ยืนยันรับเงิน" — 16px, weight 600

**Fields:**
1. วันที่รับเงิน — date picker, default today
2. ช่องทางรับเงิน — segmented control: เงินสด / โอนเงิน / เช็ค
3. เลขที่ใบหัก ณ ที่จ่าย — text input, optional, placeholder "กรอกถ้ามี"

**Summary section (read-only, shown above confirm button):**
```
ยอดในใบวางบิล      ฿ 13,375
หัก ณ ที่จ่าย 3%    -฿ 375
────────────────────────────
ยอดที่รับจริง       ฿ 13,000
```

**Confirm button:** "✓ ยืนยันรับเงิน" — full width, blue, same style as main action button

**On confirm:**
1. Set billing note status → 'paid', paid_at = now()
2. Set all linked invoice statuses → 'paid'
3. Create receipt document automatically (status = 'generated')
4. Dismiss modal
5. Refresh deal page — pipeline advances to stage 4
6. Show brief success toast: "รับเงินแล้ว ใบเสร็จถูกสร้างอัตโนมัติ ✓"

---

## Void and Copy Flow

Triggered from Zone 4 side actions when current document is sent or later.

**Confirmation bottom sheet:**
- Title: "ยกเลิกและสร้างเอกสารใหม่?"
- Body: "เอกสาร [doc_number] จะถูกยกเลิก และสำเนาใหม่จะถูกสร้างให้แก้ไข"
- Two buttons: "ยกเลิกเอกสาร" (red) / "ไม่ใช่" (gray)

**On confirm:**
1. Set original document status → 'voided', voided_at = now()
2. Create duplicate document with:
   - status = 'draft'
   - doc_number = null (assigned on save)
   - copied_from_id = original document id
   - All line items copied
3. If original was an invoice inside a billing note:
   - Set billing note status → 'draft'
   - Remove original invoice from billing_note_invoices
   - Show warning banner on deal page (yellow, dismissible):
     "ใบแจ้งหนี้ในใบวางบิลนี้ถูกยกเลิก กรุณาตรวจสอบก่อนส่งใหม่"
4. Navigate to document form for the new draft

---

## Copy Deal Flow

Triggered from ··· menu → "สร้าง deal ใหม่จากอันนี้"

**Confirmation bottom sheet:**
- Title: "สร้าง deal ใหม่?"
- Body: "จะสร้าง deal ใหม่สำหรับ [customer name] โดยใช้รายการสินค้าเดิม"
- Button: "สร้างเลย" (blue) / "ยกเลิก" (gray)

**On confirm:**
1. Create new deal record (same customer_id)
2. Create new quotation draft with same line items (snapshot prices from original)
3. Navigate to new deal page

---

## Stock Deduction — When to Trigger

Stock deducts when invoice status changes from 'draft' → 'sent'.
This happens when user taps "📤 ส่งใบแจ้งหนี้แล้ว" on the action button.

**Logic:**
```typescript
// For each product line item on the invoice
for (const item of invoiceLineItems) {
  if (item.item_type === 'product' && item.item_id) {

    // Get current stock
    const { data: catalogItem } = await supabase
      .from('items')
      .select('stock_count')
      .eq('id', item.item_id)
      .single()

    const newStock = catalogItem.stock_count - item.quantity
    const finalStock = Math.max(0, newStock)

    // Update stock
    await supabase
      .from('items')
      .update({ stock_count: finalStock })
      .eq('id', item.item_id)

    // Log movement
    await supabase
      .from('stock_movements')
      .insert({
        item_id: item.item_id,
        user_id: currentUserId,
        movement_type: 'auto_out',
        qty_base: -item.quantity,
        balance_after: finalStock,
        reason: `ออกจากใบแจ้งหนี้ ${invoice.doc_number}`,
        document_id: invoice.id
      })

    // Show warning if stock went to zero or would have gone negative
    if (newStock < 0) {
      showToast(`⚠ ${item.item_name} สต็อกไม่พอ — ดำเนินการต่อแล้ว`)
    }
  }
}
```

Stock deduction does NOT block the invoice from being sent. Warning only.

---

## Empty States

**No documents yet (brand new deal):**
Show a centered message in the timeline area:
"ยังไม่มีเอกสาร — กดปุ่มด้านบนเพื่อเริ่มต้น"
Icon: a simple document outline illustration

**Deal fully done — no action needed:**
Pipeline all green. Replace action button with:
"เสร็จสิ้น ✓" — green text, no button
Timeline shows all documents. Side actions remain available.

---

## Loading State

Show skeleton cards for all four zones while data loads.
Skeleton: gray #F1EFE8 rounded rectangles, no animation needed — keep it simple.

---

## Error State

If deal not found or user has no access:
Show centered message: "ไม่พบข้อมูล deal นี้"
Back button still functional.

---

## Design Tokens (match system-wide)

```
Background page:       #F7F6F3
Card background:       #FFFFFF
Card border:           0.5px solid #E8E6DF
Border radius card:    10px
Border radius button:  8px
Border radius badge:   4px
Primary blue:          #378ADD
Primary blue hover:    #2A72C7
Primary blue light:    #E6F1FB
Overdue red:           #C0392B
Success green:         #27500A
Success green bg:      #EAF3DE
Text primary:          #1A1A18
Text secondary:        #888780
Text muted:            #AAAAAA
Font:                  -apple-system, 'Sarabun', sans-serif
```

---

## Component Breakdown

Build these as separate components:

| Component | Props |
|---|---|
| `DealTopBar` | customerName, onBack, onMore |
| `DealCustomerCard` | customer, amount, amountLabel, statusPill, note, onNoteChange |
| `DealPipeline` | currentStage, skippedStages, isOverdue, onAction |
| `DealActionButton` | label, isOverdue, onClick |
| `DealTimeline` | documents, showVoided, onToggleVoided, onDocumentTap, onPdfDownload |
| `DealTimelineRow` | document, isCurrent, isLast, onTap, onPdfDownload |
| `DealSideActions` | hasProducts, isDone, onDeliveryNote, onVoidEdit, onCreditNote |
| `PaymentConfirmModal` | billingNote, onConfirm, onDismiss |
| `VoidCopySheet` | document, onConfirm, onDismiss |

---

## What This Page Does NOT Do

- Does not create documents directly — navigates to document form pages
- Does not edit customer details — navigates to customer profile
- Does not show stock levels — stock is in the Catalog section
- Does not handle cross-deal billing note batching — that is handled in the billing note form
- Does not support partial payments in v1 — billing note is all-or-nothing
