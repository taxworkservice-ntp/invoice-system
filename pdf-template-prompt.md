# PDF Template — Standalone Build Prompt

> Self-contained prompt for building the PDF generation system.
> Read the Master Build Prompt for system-wide context (auth, schema, tax logic, design tokens).
> This covers: PDF layout for all 6 document types, Thai font setup, generation logic,
> preview page, and download behavior.

---

## What This Is

Client-side PDF generation for all six document types. PDFs are generated on demand
in the browser using jsPDF with a Thai font embedded. No server required. The PDF
must look like a professional Thai business document — clean, printable on A4,
readable by accountants and customers alike.

---

## Technology Choice

Use **jsPDF** with the **Sarabun** Thai font embedded as a base64 string.
Do not use @react-pdf/renderer — it has poor Thai font support.
Do not rely on system fonts — always embed the font.

```typescript
// lib/pdf.ts
import jsPDF from 'jspdf'
import { sarabunBase64 } from './fonts/sarabun'  // pre-converted font file

export function createPDF(): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'  // 210 × 297 mm
  })

  // Register Thai font
  doc.addFileToVFS('Sarabun.ttf', sarabunBase64)
  doc.addFont('Sarabun.ttf', 'Sarabun', 'normal')
  doc.addFont('Sarabun.ttf', 'Sarabun', 'bold')
  doc.setFont('Sarabun')

  return doc
}
```

**Font setup:**
Download Sarabun Regular and Bold from Google Fonts.
Convert both to base64 using: https://rawgit.com/MrRio/jsPDF/master/fontconverter/fontconverter.html
Store as: src/lib/fonts/sarabun.ts (exports sarabunBase64 and sarabunBoldBase64 strings)

---

## Page Margins and Grid

```
Page size:     A4 — 210 × 297 mm
Margin top:    15 mm
Margin right:  15 mm
Margin bottom: 20 mm
Margin left:   15 mm
Content width: 180 mm  (210 - 15 - 15)
```

All measurements in millimeters. Use consistent spacing of 5mm between sections.

---

## Document Types and PDF Differences

| Document | Thai name | EN name | Has line items | Has prices | Has tax | Has signature |
|---|---|---|---|---|---|---|
| quotation | ใบเสนอราคา | Quotation | ✅ | ✅ | ✅ | ✅ |
| invoice | ใบแจ้งหนี้ / ใบกำกับภาษี | Tax Invoice | ✅ | ✅ | ✅ | ✅ |
| billing_note | ใบวางบิล | Billing Note | Invoice list | Totals only | ✅ | ✅ |
| receipt | ใบเสร็จรับเงิน | Receipt | Invoice list | ✅ | ✅ | ✅ |
| delivery_note | ใบส่งของ | Delivery Note | ✅ | ❌ | ❌ | ✅ |
| credit_note | ใบลดหนี้ | Credit Note | ✅ | ✅ | ✅ | ✅ |

---

## PDF Layout — All Document Types

Every PDF follows this structure top to bottom:

```
┌──────────────────────────────────────────────┐
│  HEADER ZONE                                 │
│  left: logo + company info                   │
│  right: document type + number + date        │
├──────────────────────────────────────────────┤
│  CUSTOMER ZONE                               │
│  Bill to / ผู้รับ info                       │
├──────────────────────────────────────────────┤
│  REFERENCE ZONE (some types only)            │
│  Reference invoice numbers                   │
├──────────────────────────────────────────────┤
│  ITEMS ZONE                                  │
│  Table of line items or invoice list         │
├──────────────────────────────────────────────┤
│  TAX ZONE (except delivery note)             │
│  Subtotal, VAT, total, WHT, net payable      │
├──────────────────────────────────────────────┤
│  NOTES ZONE                                  │
│  Free text note if exists                    │
├──────────────────────────────────────────────┤
│  FOOTER ZONE                                 │
│  Signature blocks                            │
│  Page number if multi-page                   │
└──────────────────────────────────────────────┘
```

---

## Zone 1 — Header (top of every PDF)

Height: approximately 35mm

**Left column (logo + company info) — width 90mm:**

If logo uploaded:
- Logo image: max 25mm wide, max 20mm tall, top-left aligned
- Company name Thai: 11pt bold, below logo, #1A1A18
- Company name EN: 9pt regular, #444444
- Address: 8pt regular, #444444, wrapped
- Tax ID: 8pt regular, "เลขผู้เสียภาษี: xxx-xxx-xxxxx", #444444
- Phone: 8pt regular, #444444

If no logo:
- Company name Thai: 14pt bold, top-left
- Company name EN: 10pt regular
- Address, tax ID, phone: 8pt regular, #444444

**Right column (document info) — width 85mm, right-aligned:**

- Document type Thai name: 14pt bold, #1A1A18
- Document type EN name: 10pt regular, #444444
- Gap 3mm
- "เลขที่:" label 8pt + doc_number value 9pt bold
- "วันที่:" label 8pt + issue_date value 8pt
- Type-specific date label + value 8pt:
  - Quotation: "วันหมดอายุ:" + expiry_date
  - Invoice: "ครบกำหนด:" + due_date
  - Delivery note: "วันที่ส่ง:" + delivery_date
  - Billing note: "ครบกำหนดชำระ:" + due_date
  - Receipt: "วันที่รับเงิน:" + paid_at date
  - Credit note: "อ้างอิง:" + converted_from doc_number

**Horizontal divider line** after header: 0.3pt, #CCCCCC, full content width

---

## Zone 2 — Customer Info

Height: approximately 20mm

**Label row:**
- Left: "ลูกค้า / Bill To" — 8pt, #888888
- Right (invoice and billing note only): "ผู้ขาย / Seller" — 8pt, #888888

**Customer block (left, width 90mm):**
- Customer name: 10pt bold, #1A1A18
- Tax ID (if exists): 8pt, "เลขผู้เสียภาษี: xxx" #444444
- Address: 8pt, #444444, wrapped max 3 lines
- Phone: 8pt, #444444

**For invoice only — right column shows abbreviated seller info:**
- Client company name: 9pt bold
- Tax ID: 8pt
(This is a legal requirement for Thai tax invoices — both parties must appear)

**Horizontal divider line** after customer zone.

---

## Zone 3 — Reference (delivery note and credit note only)

Height: approximately 8mm

**Delivery note:**
"อ้างอิงใบแจ้งหนี้:" 8pt label + invoice number 8pt bold

**Credit note:**
"อ้างอิงใบแจ้งหนี้เดิม:" 8pt label + invoice number 8pt bold

**Horizontal divider line** after reference zone.

---

## Zone 4 — Items Table

**Table header row:** bg #F7F6F3, 8pt bold, #444444, height 7mm

**Column definitions by document type:**

**Quotation and Invoice:**
| Col | Label | Width | Align |
|---|---|---|---|
| # | ลำดับ | 10mm | center |
| Description | รายการ | 80mm | left |
| Qty | จำนวน | 20mm | center |
| Unit | หน่วย | 15mm | center |
| Unit price | ราคา/หน่วย | 25mm | right |
| Total | จำนวนเงิน | 30mm | right |

**Delivery note (no prices):**
| Col | Label | Width | Align |
|---|---|---|---|
| # | ลำดับ | 10mm | center |
| Description | รายการ | 110mm | left |
| Qty | จำนวน | 30mm | center |
| Unit | หน่วย | 30mm | center |

**Billing note and receipt (invoice list, not line items):**
| Col | Label | Width | Align |
|---|---|---|---|
| # | ลำดับ | 10mm | center |
| Invoice no. | เลขที่ใบแจ้งหนี้ | 45mm | left |
| Date | วันที่ | 25mm | center |
| Subtotal | ราคาก่อน VAT | 30mm | right |
| VAT | VAT | 25mm | right |
| Total | รวม | 30mm | right |

**Item rows:**
- Row height: 8mm minimum, expands for long descriptions
- Alternating row bg: white and #FAFAFA
- 8pt regular, #1A1A18
- Description column: 8pt, wraps if longer than column width
- Numbers: right-aligned, formatted with comma separator and 2 decimal places
- Bottom border: 0.2pt #EEEEEE on each row

**If items span multiple pages:**
- Repeat table header on each new page
- Add "ต่อ (Continued)" at bottom right of each page that continues
- Page number: "หน้า N / N" at bottom center

**Total row (bottom of items table):**
Light gray bg #F7F6F3, bold, shows column totals where applicable.

---

## Zone 5 — Tax Summary (except delivery note)

Right-aligned block, width 80mm, positioned at right side of page.

```
ราคารวม (Subtotal)           ฿ 12,500.00
VAT 7%                          ฿ 875.00
────────────────────────────────────────
รวมทั้งสิ้น (Total)          ฿ 13,375.00
หัก ณ ที่จ่าย 3% (WHT)        -฿ 375.00
────────────────────────────────────────
ยอดที่ต้องชำระ (Net Payable)  ฿ 13,000.00
```

- Labels: 8pt, #444444
- Amounts: 8pt, right-aligned, #1A1A18
- "ยอดที่ต้องชำระ" row: 10pt bold, #1A1A18
- Divider lines: 0.3pt #CCCCCC
- Hide VAT row if vat_amount = 0
- Hide WHT row if wht_amount = 0

**Receipt additional row:**
After net payable row, add:
```
ช่องทางรับเงิน: [payment_method Thai label]
เลขที่ใบหัก ณ ที่จ่าย: [wht_certificate_no]   ← only if exists
```
8pt, #444444

**Amount in words (Thai):**
Below the tax block, full width:
"จำนวนเงิน (ตัวอักษร): หนึ่งหมื่นสามพันบาทถ้วน"
8pt, #444444
Convert net_payable to Thai text — implement a Thai number-to-words function.

---

## Thai Number to Words Function

```typescript
// lib/thaiNumberToWords.ts
export function thaiNumberToWords(amount: number): string {
  // Convert a number like 13000.00 to
  // "หนึ่งหมื่นสามพันบาทถ้วน"
  // or "หนึ่งหมื่นสามพันห้าร้อยบาทห้าสิบสตางค์"

  const ones = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

  // Handle baht and satang separately
  const [bahtPart, satangPart] = amount.toFixed(2).split('.')
  const satang = parseInt(satangPart)

  // Convert integer part to Thai words
  // Special case: สิบเอ็ด for 11, ยี่สิบ for 20
  // Full implementation required — this is a well-known Thai algorithm

  const bahtWords = convertIntToThai(parseInt(bahtPart), ones, positions)
  const satangWords = satang > 0
    ? convertIntToThai(satang, ones, positions) + 'สตางค์'
    : 'ถ้วน'

  return bahtWords + 'บาท' + satangWords
}
```

Implement the full Thai number conversion. Key special cases:
- 11 = สิบเอ็ด (not สิบหนึ่ง)
- 20 = ยี่สิบ (not สองสิบ)
- 1 in the ones place of millions = หนึ่ง (not เอ็ด)
- Numbers ≥ 1,000,000: use ล้าน correctly

---

## Zone 6 — Notes

If document has a note field value:

"หมายเหตุ:" label 8pt bold #444444
Note text: 8pt regular #444444, wraps across full content width
Max 3 lines — truncate if longer (unlikely but safe)

---

## Zone 7 — Footer (Signature Blocks)

Always at bottom of last page. If content is short, push footer to bottom of page
using remaining space. Never let footer float in the middle of the page.

**Three signature blocks side by side, equal width (60mm each):**

```
_______________________    _______________________    _______________________
ผู้รับเงิน / Received by   ผู้จ่ายเงิน / Paid by      ผู้อนุมัติ / Approved by

(................................)  (................................)  (................................)
วันที่ / Date: ............  วันที่ / Date: ............  วันที่ / Date: ............
```

- Signature line: 0.3pt solid #AAAAAA, width 50mm
- Label below: 8pt, centered, #444444
- Name line in brackets: 8pt, #AAAAAA
- Date line: 8pt, #AAAAAA

**Stamp area (right side, receipt only):**
Dashed rectangle 40mm × 30mm, 0.5pt dashed #CCCCCC
"ประทับตราบริษัท" — 8pt centered #CCCCCC inside box

**Page number:**
Bottom center of every page: "หน้า 1 / 1" — 7pt, #888888

---

## PDF Generation Function

Main entry point — call this to generate any document type:

```typescript
// lib/pdf.ts

export interface PDFData {
  document: Document
  lineItems: DocumentLineItem[]        // empty for billing_note and receipt
  billingNoteInvoices: BillingNoteInvoice[]  // empty for other types
  clientProfile: ClientProfile
  customer: Customer
  referenceDoc?: Document              // for delivery_note and credit_note
}

export function generatePDF(data: PDFData): jsPDF {
  const doc = createPDF()

  let currentY = 15  // start at top margin

  currentY = drawHeader(doc, data, currentY)
  currentY += 5
  currentY = drawCustomer(doc, data, currentY)
  currentY += 5

  if (needsReference(data.document.doc_type)) {
    currentY = drawReference(doc, data, currentY)
    currentY += 5
  }

  currentY = drawItemsTable(doc, data, currentY)
  currentY += 5

  if (hasTax(data.document.doc_type)) {
    currentY = drawTaxSummary(doc, data, currentY)
    currentY += 5
  }

  if (data.document.note) {
    currentY = drawNotes(doc, data.document.note, currentY)
    currentY += 5
  }

  drawFooter(doc, data, currentY)
  drawPageNumbers(doc)

  return doc
}

// Helper predicates
function needsReference(type: DocumentType): boolean {
  return type === 'delivery_note' || type === 'credit_note'
}

function hasTax(type: DocumentType): boolean {
  return type !== 'delivery_note'
}
```

**Page overflow handling:**
Before drawing each new section, check if remaining page height is sufficient.
If not: add a new page, reset currentY to top margin, redraw table header if in table.

```typescript
function checkPageBreak(doc: jsPDF, currentY: number, neededHeight: number): number {
  const pageHeight = 297
  const bottomMargin = 20
  if (currentY + neededHeight > pageHeight - bottomMargin) {
    doc.addPage()
    return 15  // reset to top margin
  }
  return currentY
}
```

---

## Download Behavior

```typescript
export function downloadPDF(data: PDFData): void {
  const doc = generatePDF(data)
  const filename = `${data.document.doc_number || data.document.doc_type}-${
    format(new Date(data.document.issue_date), 'yyyyMMdd')
  }.pdf`
  doc.save(filename)
}
```

Filename examples:
- `INV-2025-007-20250503.pdf`
- `QT-2025-004-20250501.pdf`
- `RC-2025-003-20250505.pdf`

---

## PDF Preview Page (/documents/:documentId)

This is the page shown after saving a document. It shows a preview and download button.

### Route
```
/documents/:documentId
```

### Data Required
```typescript
const document = await supabase
  .from('documents')
  .select('*')
  .eq('id', documentId)
  .single()

const lineItems = await supabase
  .from('document_line_items')
  .select('*')
  .eq('document_id', documentId)
  .order('sort_order')

const billingNoteInvoices = document.doc_type === 'billing_note'
  ? await supabase
      .from('billing_note_invoices')
      .select('*')
      .eq('billing_note_id', documentId)
  : []

const clientProfile = await supabase
  .from('client_profiles')
  .select('*')
  .eq('user_id', currentUserId)
  .single()

const customer = await supabase
  .from('customers')
  .select('*')
  .eq('id', document.customer_id)
  .single()
```

### Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  STATUS BANNER              │  status + badge
│  PDF PREVIEW AREA           │  rendered preview
│  ACTION BUTTONS             │  download + status actions
└─────────────────────────────┘
```

### Top Bar
```
← [Back]     [Doc number]     [···]
```

Back navigates to deal page if deal_id exists, otherwise to documents list.

··· menu:
- "ยกเลิกและสร้างใหม่" — void and copy (if not voided/paid/generated)

### Status Banner

Colored banner below top bar showing current document status:

| Status | bg | text | Message |
|---|---|---|---|
| draft | #F1EFE8 | #444441 | "ฉบับร่าง — ยังไม่ได้ส่ง" |
| sent | #E6F1FB | #0C447C | "ส่งแล้ว — รอดำเนินการ" |
| paid | #EAF3DE | #27500A | "ชำระแล้ว" |
| voided | #FCEBEB | #791F1F | "ยกเลิกแล้ว — เอกสารนี้ไม่มีผลบังคับใช้" |
| generated | #EAF3DE | #27500A | "ออกอัตโนมัติ" |

### PDF Preview Area

Render the PDF as an embedded preview using PDF.js or an iframe with object tag.
Generate the PDF blob client-side and create an object URL:

```typescript
const doc = generatePDF(pdfData)
const blob = doc.output('blob')
const url = URL.createObjectURL(blob)
// Render in <iframe src={url} /> or <embed src={url} />
```

Preview height: 60vh on desktop, 45vh on mobile.
White bg, subtle shadow, centered.

If preview fails to render (browser restriction): show "กดปุ่มด้านล่างเพื่อดาวน์โหลด PDF"

### Action Buttons

Below preview area, two or three buttons depending on document type and status:

**Always shown:**
```
[⬇ ดาวน์โหลด PDF]   ← blue, full width or half width
```

**If status = draft (not receipt, not voided):**
```
[⬇ ดาวน์โหลด PDF]   [📤 ทำเครื่องหมายว่าส่งแล้ว]
```
"ทำเครื่องหมายว่าส่งแล้ว" → sets status to 'sent', refreshes page

**If status = sent (invoice only):**
```
[⬇ ดาวน์โหลด PDF]   [📋 วางบิล]
```
"วางบิล" → navigate to billing note form

**If voided:**
Show only download button. Voided banner makes state clear.
No status action available.

**Button styles:**
- Download: bg #378ADD, white, 8px radius, weight 600
- Status action: bg #F7F6F3, border #E8E6DF, #444441

---

## Number Formatting Helper

```typescript
export function formatAmount(amount: number): string {
  return '฿ ' + amount.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  // Display in Thai Buddhist Era (พ.ศ.) — add 543 to year
  const thaiYear = date.getFullYear() + 543
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ]
  return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${thaiYear}`
}
```

All dates on PDFs display in Thai Buddhist calendar.
All amounts formatted with ฿ prefix and 2 decimal places.

---

## Component Breakdown

| Component / Function | Purpose |
|---|---|
| `generatePDF(data)` | Main PDF generation entry point |
| `createPDF()` | Initialize jsPDF with Thai font |
| `drawHeader(doc, data, y)` | Header zone — logo, company, doc info |
| `drawCustomer(doc, data, y)` | Customer zone |
| `drawReference(doc, data, y)` | Reference zone (delivery + credit note) |
| `drawItemsTable(doc, data, y)` | Items table — handles all doc types |
| `drawTaxSummary(doc, data, y)` | Tax summary block |
| `drawNotes(doc, note, y)` | Notes zone |
| `drawFooter(doc, data, y)` | Signature blocks + stamp area |
| `drawPageNumbers(doc)` | Page N/N on all pages |
| `checkPageBreak(doc, y, h)` | Page overflow check |
| `downloadPDF(data)` | Triggers browser download |
| `thaiNumberToWords(amount)` | Converts amount to Thai text |
| `formatAmount(amount)` | ฿ formatted string |
| `formatDate(dateString)` | Thai Buddhist calendar date string |
| `DocumentPreviewPage` | Preview page component |
| `PDFPreviewFrame` | Iframe wrapper for PDF blob display |
| `DocumentActionBar` | Download + status action buttons |

---

## What This Does NOT Do

- Does not send PDF by email — client downloads and sends manually
- Does not store PDFs on Supabase Storage — generated fresh on every download
- Does not support custom PDF templates per client in v1 — one template for all
- Does not support landscape orientation
- Does not support paper sizes other than A4
- Does not watermark voided documents in v1 — voided banner on preview page is sufficient
