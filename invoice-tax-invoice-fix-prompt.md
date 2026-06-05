# Invoice vs Tax Invoice Naming — Standalone Fix Prompt

> This prompt covers a specific fix that affects the PDF template, UI labels, and
> a shared helper function. It does NOT require any database changes.
> If this prompt conflicts with the PDF Template prompt on document naming — this prompt wins.
> Read alongside: pdf-template-prompt.md, document-form-prompt.md, deal-page-prompt.md

---

## The Problem

In Thailand, ใบแจ้งหนี้ (Invoice) and ใบกำกับภาษี (Tax Invoice) are legally different
documents. The current design uses one doc_type 'invoice' but always displays
"ใบแจ้งหนี้" regardless of whether the client is VAT registered. This is incorrect.

A VAT-registered client must issue ใบกำกับภาษี — not ใบแจ้งหนี้. Their customers
need the correct document name for tax filing and input VAT credit claims.

---

## The Rule

| Client VAT setting | Document name (Thai) | Document name (EN) |
|---|---|---|
| vat_registered = false | ใบแจ้งหนี้ | Invoice |
| vat_registered = true | ใบกำกับภาษี | Tax Invoice |

The doc_type in the database stays 'invoice' for both cases.
This is purely a display and naming change — no database changes required.

The display name is always derived at render time from the document's stored
`vat_registered` field (which is a snapshot taken from client_profiles at save time).

---

## Change 1 — Shared Label Helper

Create this helper function and use it everywhere document type labels are displayed.

```typescript
// lib/docLabels.ts

export function invoiceLabel(vatRegistered: boolean): {
  thai: string
  en: string
  short: string
} {
  if (vatRegistered) {
    return {
      thai: 'ใบกำกับภาษี',
      en: 'Tax Invoice',
      short: 'TAX INV'
    }
  }
  return {
    thai: 'ใบแจ้งหนี้',
    en: 'Invoice',
    short: 'INV'
  }
}

// Full label for any document type — use this everywhere
export function documentTypeLabel(
  docType: DocumentType,
  vatRegistered: boolean
): { thai: string; en: string } {
  switch (docType) {
    case 'invoice':
      return invoiceLabel(vatRegistered)
    case 'quotation':
      return { thai: 'ใบเสนอราคา', en: 'Quotation' }
    case 'billing_note':
      return { thai: 'ใบวางบิล', en: 'Billing Note' }
    case 'receipt':
      return { thai: 'ใบเสร็จรับเงิน', en: 'Receipt' }
    case 'delivery_note':
      return { thai: 'ใบส่งของ', en: 'Delivery Note' }
    case 'credit_note':
      return { thai: 'ใบลดหนี้', en: 'Credit Note' }
    default:
      return { thai: docType, en: docType }
  }
}
```

**Use `documentTypeLabel()` everywhere a document type name appears in the UI.**
Never hardcode "ใบแจ้งหนี้" or "ใบกำกับภาษี" as a string directly in any component.

---

## Change 2 — UI Labels (display only, no logic changes)

Every place in the UI that shows a document type name for an invoice document
must call `documentTypeLabel(doc.doc_type, doc.vat_registered)`.

**Affected components and what to change:**

### Deal Page — Pipeline Stage Label
```typescript
// Stage 2 label
const invoiceStageName = documentTypeLabel('invoice', deal.vatRegistered).thai
// Shows "ใบกำกับภาษี" or "ใบแจ้งหนี้" depending on client setting
```

### Deal Page — Timeline Row
```typescript
// Document type shown on each timeline card
const label = documentTypeLabel(document.doc_type, document.vat_registered).thai
```

### Document Form — Top Bar Title and Header Card
```typescript
// Form title and document type header
const label = documentTypeLabel(docType, clientProfile.vat_registered).thai
```

### Document List — Each Row
```typescript
// Document type column or label on list rows
const label = documentTypeLabel(document.doc_type, document.vat_registered).thai
```

### Home Dashboard — Deal Card Status / Labels
Next action labels do not mention document type names directly so no change needed.
Status badges show document status (sent, paid etc.) not document type — no change needed.

### New Deal Bottom Sheet — Option 2
The plain-language option "ออกใบแจ้งหนี้เลย" should NOT change based on VAT setting
at this point because the client is just picking what they want to do — the correct
legal name appears on the actual document. Keep plain language in the picker.

---

## Change 3 — PDF Template Fix

This is the most important change. The PDF must show the legally correct document name.

### Document Header Name

```typescript
// In drawHeader() function — pdf.ts

const displayName = documentTypeLabel(
  data.document.doc_type,
  data.document.vat_registered  // use snapshot stored on document, not live profile
)

// Right column of header
doc.setFont('Sarabun', 'bold')
doc.setFontSize(14)
doc.text(displayName.thai, rightColX, currentY, { align: 'right' })

doc.setFont('Sarabun', 'normal')
doc.setFontSize(10)
doc.text(displayName.en, rightColX, currentY + 6, { align: 'right' })
```

Always use `data.document.vat_registered` — the snapshot stored at save time.
Never use the live client_profiles.vat_registered for PDF rendering.
This ensures old documents print correctly even if the client changes their VAT setting later.

### Tax Invoice PDF — Additional Legal Requirements

When `data.document.vat_registered = true` (Tax Invoice), the PDF must include
additional fields required by Thai Revenue Department regulations:

**Client (seller) section — header zone:**
- Tax ID must always be shown — not optional
- Format: "เลขประจำตัวผู้เสียภาษี: xxx-xxx-xxxxx"
- Font: 9pt, #1A1A18
- If client has no tax ID set — show warning placeholder:
  "เลขผู้เสียภาษี: [กรุณาตั้งค่า]" in red #C0392B
  This signals to the client they need to complete their profile

**Customer (buyer) section — customer zone:**
- Customer tax ID must be shown on tax invoices
- Format: "เลขประจำตัวผู้เสียภาษี: xxx-xxx-xxxxx"
- If customer has no tax ID: show "เลขผู้เสียภาษี: -" (dash, not blank)
  Some customers are individuals without a tax ID — this is acceptable

**VAT section — tax summary zone:**
On a tax invoice the VAT line must be explicit and clear:
```
ราคาสินค้า/บริการ (ก่อน VAT)    ฿ 12,500.00
ภาษีมูลค่าเพิ่ม 7%               ฿   875.00
──────────────────────────────────────────────
รวมทั้งสิ้น (รวม VAT)           ฿ 13,375.00
```

Use the full label "ภาษีมูลค่าเพิ่ม 7%" — not just "VAT 7%".
The subtotal label must say "ราคาสินค้า/บริการ (ก่อน VAT)" — not just "ราคารวม".
This matches standard Thai tax invoice format.

### Non-VAT Invoice PDF

When `data.document.vat_registered = false`:
- Document name: ใบแจ้งหนี้ / Invoice
- No VAT line in tax summary
- Tax summary shows only:
```
รวมทั้งสิ้น                     ฿ 12,500.00
หัก ณ ที่จ่าย 3%                -฿   375.00
──────────────────────────────────────────────
ยอดที่ต้องชำระ                  ฿ 12,125.00
```
- Client tax ID in header: optional (show if set, hide if not)
- Customer tax ID: not required (show if set, hide if not)

---

## Change 4 — Document Form Warning

When a VAT-registered client opens the document form to create an invoice and their
client_profiles.tax_id is null or empty — show a warning banner at the top of the form:

```
[⚠ amber banner]
คุณเป็นผู้ประกอบการจดทะเบียน VAT แต่ยังไม่ได้ตั้งค่าเลขผู้เสียภาษี
เลขผู้เสียภาษีจำเป็นสำหรับใบกำกับภาษี
[ตั้งค่าเลย →]  ← navigates to /settings/profile
```

This warning appears only on invoice type documents and only when:
- client_profiles.vat_registered = true
- client_profiles.tax_id is null or empty string

The warning does not block the user — they can still create the document.
But the PDF will show a red placeholder until the tax ID is set.

---

## Change 5 — Settings Profile Page Clarification

On the Settings → Profile page, the VAT registered toggle should have clear helper text
explaining what it changes:

```
จดทะเบียน VAT          [toggle]

เปิด: เอกสารจะออกเป็น "ใบกำกับภาษี"
      และแสดงรายการ VAT 7% อัตโนมัติ

ปิด:  เอกสารจะออกเป็น "ใบแจ้งหนี้"
      ไม่มีรายการ VAT
```

This removes any ambiguity about what the toggle actually does to the documents.

---

## What Does NOT Change

- Database schema — no changes needed
- doc_type value — stays 'invoice' for both cases
- Tax calculation logic — unchanged, already correct
- WHT calculation logic — unchanged
- Billing note — always called "ใบวางบิล" regardless of VAT setting
- Receipt — always called "ใบเสร็จรับเงิน" regardless of VAT setting
- Quotation — always called "ใบเสนอราคา" regardless of VAT setting
- Delivery note — always called "ใบส่งของ" regardless of VAT setting

---

## Implementation Checklist

In order of priority:

- [ ] Create `lib/docLabels.ts` with `invoiceLabel()` and `documentTypeLabel()`
- [ ] Update `drawHeader()` in `pdf.ts` to use `documentTypeLabel()`
- [ ] Add tax ID display logic to PDF header (required for tax invoice, optional for invoice)
- [ ] Add customer tax ID to PDF customer zone (required for tax invoice)
- [ ] Update VAT line labels in PDF tax summary zone for tax invoice
- [ ] Update deal page timeline row to use `documentTypeLabel()`
- [ ] Update deal page pipeline stage 2 label
- [ ] Update document form top bar and header card
- [ ] Update document list rows
- [ ] Add missing tax ID warning banner to document form
- [ ] Add helper text to Settings → Profile VAT toggle

---

## Testing Checklist

After implementing, verify these scenarios:

**VAT registered client:**
- [ ] Invoice PDF shows "ใบกำกับภาษี / Tax Invoice" in header
- [ ] Client tax ID appears in PDF header
- [ ] Customer tax ID appears in PDF customer zone
- [ ] VAT line shows "ภาษีมูลค่าเพิ่ม 7%" with full label
- [ ] Subtotal shows "ราคาสินค้า/บริการ (ก่อน VAT)"
- [ ] Deal page pipeline shows "ใบกำกับภาษี" for stage 2
- [ ] Document list shows "ใบกำกับภาษี" badge/label

**Non-VAT client:**
- [ ] Invoice PDF shows "ใบแจ้งหนี้ / Invoice" in header
- [ ] No VAT line in PDF tax summary
- [ ] Deal page pipeline shows "ใบแจ้งหนี้" for stage 2
- [ ] Document list shows "ใบแจ้งหนี้" badge/label

**VAT client with missing tax ID:**
- [ ] Warning banner appears in document form
- [ ] PDF header shows red placeholder text for missing tax ID

**Client changes VAT setting after creating documents:**
- [ ] Old documents still print with the VAT setting they were created with
- [ ] New documents use the updated VAT setting
- [ ] Changing VAT setting does not alter any existing document records
