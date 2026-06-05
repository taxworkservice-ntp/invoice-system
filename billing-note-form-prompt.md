# Billing Note Form — Standalone Build Prompt

> Self-contained prompt for building the Billing Note Form page.
> Read the Master Build Prompt for system-wide context (auth, schema, tax logic, design tokens).
> Read the Document Form prompt for context on how other document forms work.
> This form is separate from the shared document form because it works fundamentally differently —
> it picks invoices instead of line items.

---

## What This Page Is

The billing note (ใบวางบิล) is the payment collection document. Instead of line items,
it bundles one or more unpaid invoices from a customer into a single payment request.
The user selects which invoices to include, sets a due date, and the system calculates
the combined total automatically. Amounts are always locked from the original invoices —
never editable on the billing note itself.

---

## Routes

```
/documents/new?type=billing_note&dealId=xxx     ← from deal page action button
/documents/new?type=billing_note                ← from home new deal sheet (option 3)
/documents/:documentId/edit                     ← edit existing draft billing note
```

---

## Data Required

```typescript
// 1. Customer — from deal if dealId provided
const deal = dealId
  ? await supabase.from('deals').select('*, customers(*)').eq('id', dealId).single()
  : null

// 2. All unpaid invoices for this customer
// "Unpaid" means status = 'sent' and not already in another active billing note
const invoices = await supabase
  .from('documents')
  .select('*, document_line_items(*)')
  .eq('user_id', currentUserId)
  .eq('customer_id', customerId)
  .eq('doc_type', 'invoice')
  .eq('status', 'sent')          // only sent invoices — not draft, not already paid
  .order('created_at', { ascending: true })

// 3. If editing existing billing note — load existing data
const existingBillingNote = documentId
  ? await supabase
      .from('documents')
      .select('*, billing_note_invoices(*, documents(*))')
      .eq('id', documentId)
      .single()
  : null
```

---

## Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │  Fixed
├─────────────────────────────┤
│  DOCUMENT HEADER            │  Doc type + number placeholder
│  CUSTOMER SECTION           │  Customer display
│  DATE SECTION               │  Issue date + due date
│  INVOICE PICKER SECTION     │  Core of this form — invoice checklist
│  TAX SUMMARY SECTION        │  Combined totals — read only
│  WHT SECTION                │  WHT rate selector
│  NOTES SECTION              │  Optional note
│  ACTION BAR                 │  Fixed at bottom
└─────────────────────────────┘
```

---

## Top Bar

```
← [Back label]     ใบวางบิล     [···]
```

**Back label:**
- If came from deal page: "← Deal"
- Otherwise: "← ยกเลิก"

**··· menu:**
- "ลบฉบับร่าง" — only if document exists in DB
- Confirmation before delete

---

## Document Header Card

White card, padding 16px.

```
ใบวางบิล                    ร่าง — ยังไม่มีเลขที่
[Customer name]
```

- "ใบวางบิล": 18px, weight 700, #1A1A18
- Customer name: 14px, #888780, shown once customer is selected
- Status: same gray badge style as other forms

---

## Customer Section

White card, padding 16px.

**If came from deal page (dealId provided):**
Show customer as read-only selected card — same style as document form.
No search input — customer is locked to the deal's customer.

**If no dealId (standalone billing note):**
Show customer search selector — same component as document form CustomerSelector.
Customer must be selected before invoice picker appears.

**Important:** invoice picker only loads after customer is confirmed.
Show placeholder in invoice section: "เลือกลูกค้าก่อนเพื่อดูใบแจ้งหนี้" until customer selected.

---

## Date Section

White card, padding 16px.

**Issue date:**
- Label: "วันที่ออกใบวางบิล"
- Date picker, default today
- Display in Thai Buddhist calendar format

**Due date:**
- Label: "ครบกำหนดชำระ"
- Date picker, default +7 days from issue date
- Required field — billing note must have a due date
- If user picks a past date: show inline warning "⚠ วันครบกำหนดผ่านไปแล้ว" in amber
  but do not block — allow saving

---

## Invoice Picker Section

This is the core of the billing note form. White card, padding 16px.

**Section label:** "เลือกใบแจ้งหนี้" — 11px, uppercase, #888780, weight 600

### This Deal's Invoices (shown first)

If dealId provided, show invoices from this deal first under a subtle sub-label:
"จาก deal นี้" — 11px, #AAAAAA

Each invoice shown as a selectable row:

```
☑  INV-2025-007                          ฿ 13,375
   3 พ.ค. 2568 · กระดาษ A4 × 50, หมึก × 5
```

**Row anatomy:**
- Checkbox: left side, 20px, blue when checked (#378ADD)
- Invoice number: 13px, weight 600, #1A1A18
- Amount (net_payable): 13px, weight 600, #1A1A18, right-aligned
- Date + item summary: 11px, #888780, below invoice number
  - Item summary: first 2 line item names from that invoice, truncated
- Row bg: white default, #F0F7FF when checked
- Row border-bottom: 0.5px #E8E6DF

**Pre-selection behavior:**
- If came from deal page action button: pre-select all invoices from this deal automatically
- User can uncheck any if needed
- At least one invoice must remain selected

### Other Deals' Invoices (collapsed by default)

Below this deal's invoices, show a collapsed toggle row:

```
+ เพิ่มใบแจ้งหนี้จาก deal อื่น  (N รายการ)    ▾
```

- 13px, #378ADD, tappable
- N = count of unpaid invoices from same customer but different deals
- If N = 0: hide this toggle entirely

**On expand:**
Show invoices from other deals grouped by deal:

```
Deal: บริษัท มาลี — งานออกแบบโลโก้
☐  INV-2025-005                          ฿ 4,500
   28 เม.ย. 2568 · ออกแบบโลโก้

Deal: บริษัท มาลี — ติดตั้งระบบ
☐  INV-2025-003                          ฿ 18,000
   20 เม.ย. 2568 · ค่าติดตั้ง
```

Deal group header: 11px, #AAAAAA, not selectable
Invoice rows: same style as above, unchecked by default

**On collapse:** tap toggle again — checked items from other deals remain selected

### Empty State (no unpaid invoices)

If customer has no unpaid invoices at all:

```
[centered]
ไม่มีใบแจ้งหนี้ที่รอชำระ
ลูกค้ารายนี้ไม่มีใบแจ้งหนี้ค้างชำระ

[สร้างใบแจ้งหนี้ใหม่ →]  ← blue text button
```

Tap → navigate to /documents/new?type=invoice&dealId=xxx

---

## Tax Summary Section

White card, padding 16px.
Read-only — amounts are calculated from selected invoices, never editable.

**Section label:** "สรุปยอด" — 11px, uppercase, #888780

### Selected Invoices Summary Table

Shows each selected invoice as a row:

```
INV-2025-007    3 พ.ค.    ฿ 12,500    VAT ฿ 875    รวม ฿ 13,375
INV-2025-005    28 เม.ย.   ฿ 4,000    VAT ฿ 280    รวม ฿ 4,280
```

- Invoice number: 12px, weight 500, #1A1A18
- Date: 11px, #888780
- Subtotal, VAT, total: 12px, #444441
- Rows separated by 0.5px #F1EFE8 dividers

### Combined Total Block

Below the invoice rows, after a 0.5px #E8E6DF divider:

```
ราคารวมทั้งหมด          ฿ 16,500.00
VAT 7%                   ฿ 1,155.00
────────────────────────────────────
รวมทั้งสิ้น             ฿ 17,655.00
หัก ณ ที่จ่าย 3%          -฿ 495.00
────────────────────────────────────
ยอดที่ต้องชำระ           ฿ 17,160.00
```

**Calculation rules:**
- Sum subtotals from all selected invoices → combined subtotal
- Sum VAT amounts from all selected invoices → combined VAT
- Combined total = combined subtotal + combined VAT
- WHT = combined subtotal × WHT rate (not on VAT — same rule as always)
- Net payable = combined total − WHT

**Important:** use each invoice's already-stored vat_amount values — do not recalculate
from scratch. This preserves historical accuracy if VAT rate changed between invoices.

WHT is calculated fresh on the billing note level using the combined subtotal.

Updates live as user checks/unchecks invoices.

---

## WHT Section

White card, padding 16px.

```
ภาษีหัก ณ ที่จ่าย        [3% ▾]
คำนวณจากราคาก่อน VAT
```

- Dropdown: ไม่มี / 1% / 2% / 3% / 5%
- Inherits from client_profile.default_wht_rate on init
- Changing WHT rate updates tax summary live
- Sub-label: "คำนวณจากราคาก่อน VAT" — 11px, #888780
  Reminds user of the correct calculation basis

---

## Notes Section

White card, padding 16px.

**Label:** "หมายเหตุ / ข้อความในใบวางบิล" — 11px, uppercase, #888780

**Input:** multiline textarea, 3 rows, expands as typed.
Placeholder: "เช่น กรุณาโอนเงินภายในวันที่กำหนด ขอบคุณครับ/ค่ะ"
This note prints on the billing note PDF.

---

## Action Bar (fixed bottom)

Same two-button pattern as document form.

**Left — "บันทึกร่าง":**
- Saves billing note as draft with selected invoices
- Updates linked invoices: status → 'in_billing'
- Shows toast "บันทึกแล้ว ✓"

**Right — "บันทึก & ดูตัวอย่าง":**
- Validates form (see below)
- Assigns doc_number via generate_doc_number()
- Saves billing note as draft
- Updates linked invoices: status → 'in_billing'
- Navigates to document detail / PDF preview

**Validation:**
- Customer must be selected
- At least one invoice must be selected
- Due date must be set
- Show inline errors in Thai below each invalid section — no alert() dialogs

---

## Auto-save Behavior

Same as document form — debounced 2 seconds after inactivity.
Only auto-saves if customer selected and at least one invoice selected.
Auto-save updates billing_note_invoices table to reflect current selection.

**When auto-saving, update invoice statuses:**
- Newly selected invoices: status → 'in_billing'
- Deselected invoices (if any changed): status → 'sent' (restore)

This keeps invoice statuses consistent with the billing note draft at all times.

---

## Editing Existing Billing Note

Load existing billing note and pre-populate:
- Customer (locked — cannot change customer on existing billing note)
- Pre-check all invoices currently in billing_note_invoices
- Pre-fill due date, WHT rate, notes

**Editable states:**
- status = 'draft' → fully editable
- status = 'sent' → read-only, show banner:
  ```
  [yellow banner]
  ใบวางบิลนี้ส่งแล้ว ไม่สามารถแก้ไขได้
  [ยกเลิกและสร้างใหม่ →]
  ```
- status = 'paid' → read-only, no void option:
  ```
  [green banner]
  ชำระแล้ว — เอกสารนี้ปิดแล้ว
  ```

---

## Warning Banner (voided invoice case)

If a billing note reverts to draft because a linked invoice was voided (triggered from
deal page void and copy flow), show a persistent yellow warning banner at the top of
the form above all sections:

```
[⚠ yellow banner — cannot dismiss]
ใบแจ้งหนี้ที่เชื่อมอยู่ถูกยกเลิกแล้ว
กรุณาตรวจสอบรายการที่เลือกก่อนส่งอีกครั้ง
```

The voided invoice row in the picker shows as:
- Grayed out, unchecked, not selectable
- Strikethrough on invoice number
- Small "ยกเลิกแล้ว" badge in red

---

## Invoice Already in Another Billing Note

If an invoice is already in a DIFFERENT active billing note (status = 'in_billing'),
do not show it in the picker at all. It is unavailable until that other billing note
is voided or paid.

This prevents the same invoice from appearing in two billing notes simultaneously.

---

## What Happens on Save — Full Sequence

When user saves (draft or final):

```typescript
// 1. Upsert billing note document
const billingNote = await supabase
  .from('documents')
  .upsert({
    id: existingId || undefined,
    user_id: currentUserId,
    deal_id: dealId,
    customer_id: customerId,
    doc_type: 'billing_note',
    doc_number: docNumber,      // only if explicitly saving, not auto-save
    status: 'draft',
    issue_date: issueDate,
    due_date: dueDate,
    wht_rate: whtRate,
    subtotal: combinedSubtotal,
    vat_amount: combinedVat,
    total_amount: combinedTotal,
    wht_amount: whtAmount,
    net_payable: netPayable,
    note: note
  })

// 2. Delete existing billing_note_invoices links (full replace)
await supabase
  .from('billing_note_invoices')
  .delete()
  .eq('billing_note_id', billingNote.id)

// 3. Insert fresh links for selected invoices
await supabase
  .from('billing_note_invoices')
  .insert(selectedInvoices.map(inv => ({
    billing_note_id: billingNote.id,
    invoice_id: inv.id,
    user_id: currentUserId,
    invoice_number: inv.doc_number,
    subtotal: inv.subtotal,
    vat_amount: inv.vat_amount,
    total_amount: inv.total_amount
  })))

// 4. Update invoice statuses
await supabase
  .from('documents')
  .update({ status: 'in_billing' })
  .in('id', selectedInvoices.map(i => i.id))

// 5. Restore status of any previously selected but now deselected invoices
await supabase
  .from('documents')
  .update({ status: 'sent' })
  .in('id', deselectedInvoiceIds)
```

All five steps should run as a single operation. If any step fails, show error toast
and do not partially save.

---

## Loading State

Show skeleton placeholders for all sections.
Invoice picker skeleton: 3 gray rows with checkbox placeholder.
Static, no animation.

---

## Component Breakdown

| Component | Props |
|---|---|
| `BillingNoteForm` | dealId, documentId (edit mode) |
| `BillingNoteHeader` | docNumber, status, customerName |
| `BillingNoteDateSection` | issueDate, dueDate, onChange |
| `InvoicePicker` | customerId, dealId, selectedIds, onSelectionChange |
| `InvoicePickerRow` | invoice, isSelected, isDisabled, onToggle |
| `OtherDealsExpander` | invoices, selectedIds, onToggle |
| `BillingNoteTaxSummary` | selectedInvoices, whtRate |
| `WhtSelector` | value, onChange |
| `VoidedInvoiceWarningBanner` | visible |
| `BillingNoteActionBar` | onSaveDraft, onSaveAndPreview, isSaving, isValid |

---

## What This Form Does NOT Do

- Does not allow editing invoice amounts — amounts are locked from original invoices
- Does not create invoices — user must go to document form for that
- Does not handle payment confirmation — that is handled on the deal page action button
- Does not generate PDF — that happens on the document detail page
- Does not support billing notes across different customers — one customer per billing note always
