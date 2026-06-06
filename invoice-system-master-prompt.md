# Invoice System — Master Build Prompt (Final)

> Hand this document to any AI coding agent or developer as the complete specification.
> It covers product decisions, UI direction, data model, tech stack, and project structure.
> Do not infer or fill in missing details — everything that matters is written here.

---

## Purpose

Build a simple, multi-client web-based invoice management system for small Thai businesses.
The system must be clean and easy to use for non-technical users including those with very
limited experience with digital tools. The primary design principle is simplicity — every
feature decision should favour the least complex solution that still works in real-world
Thai SME workflows.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) |
| Hosting | Vercel |
| Styling | Tailwind CSS |
| PDF generation | jsPDF (classic) + HTML print to jsPDF (modern), client-side |
| Language | TypeScript |

**Supabase Auth** handles all authentication — email and password only.
No custom auth code needed. Use Supabase RLS for data isolation between clients.
All financial logic runs on the client (React) — no custom backend server required.

---

## Project Structure

```
/
├── src/
│   ├── app/                    # Page-level route components
│   │   ├── (auth)/
│   │   │   ├── login.tsx
│   │   │   └── setup.tsx       # First-time client profile setup
│   │   ├── (client)/
│   │   │   ├── home.tsx        # Deal pipeline — primary screen
│   │   │   ├── deals/
│   │   │   │   ├── [id].tsx    # Deal detail view
│   │   │   │   └── new.tsx     # New deal flow
│   │   │   ├── documents/
│   │   │   │   ├── index.tsx   # Document list with search/filter
│   │   │   │   └── [id].tsx    # Document detail + PDF preview
│   │   │   ├── catalog/
│   │   │   │   ├── index.tsx   # Item list
│   │   │   │   ├── [id].tsx    # Item detail + stock history
│   │   │   │   └── new.tsx
│   │   │   └── settings/
│   │   │       ├── profile.tsx
│   │   │       ├── tax.tsx
│   │   │       └── numbering.tsx
│   │   └── (admin)/
│   │       ├── clients.tsx     # Admin: all clients list
│   │       └── clients/[id].tsx
│   │
│   ├── components/
│   │   ├── ui/                 # Base components (Button, Badge, Card, Input)
│   │   ├── deal/               # DealCard, DealPipeline, NewDealModal
│   │   ├── document/           # DocumentForm, LineItemRow, TaxSummary, PDFPreview
│   │   ├── catalog/            # ItemForm, StockMovementLog, StockInModal
│   │   └── layout/             # AppShell, BottomNav, TopBar
│   │
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client init
│   │   ├── tax.ts              # Tax calculation functions (pure, tested)
│   │   ├── pdf.ts              # PDF generation logic
│   │   ├── docNumber.ts        # Document number generation (calls DB function)
│   │   └── stock.ts            # Stock movement helpers
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useDeals.ts
│   │   ├── useDocuments.ts
│   │   ├── useItems.ts
│   │   └── useCustomers.ts
│   │
│   ├── types/
│   │   └── index.ts            # All TypeScript types mirroring DB schema
│   │
│   └── constants/
│       └── index.ts            # WHT rates, VAT default, document type labels (Thai + EN)
│
├── supabase/
│   └── schema.sql              # Full DB schema (see schema.sql file)
│
├── public/
└── vercel.json
```

---

## Core Philosophy

Users do not think in document types. They think in deals — a transaction with a customer
that moves forward step by step until money is received. The system must reflect this
mental model.

The interface has two gears:

**Fast lane (90% of usage)** — user picks a customer, picks items, moves the deal forward
with one tap at each stage. Tax calculations, document numbering, and stock deductions
happen silently in the background. User makes zero decisions they do not need to make.

**Details (10% of usage)** — advanced fields like WHT override, delivery note, credit note,
document number, and tax settings are accessible inside the deal but never shown upfront.
Hidden behind a quiet "show more" expand — never visible by default.

---

## Users

### Admin (system owner)
- Creates and manages client accounts
- Can view all clients and their data in read-only mode
- Can log in as any client to provide support (UI clearly indicates when operating as client)
- Can reset any client's password
- Cannot delete documents or alter financial records

### Client (small business owner)
- Has their own login, sees only their own data
- Creates and manages deals
- Manages their item catalog and stock
- Downloads PDF documents to send to their customers

---

## Authentication

- Supabase Auth — email and password only
- Admin has role = 'admin' in profiles table, clients have role = 'client'
- On login, check profile role and route accordingly:
  - admin → /admin/clients
  - client (profile incomplete) → /setup
  - client (profile complete) → /home
- Row Level Security enforces data isolation at database level
- Clients cannot access other clients' data under any circumstances
- Admin impersonation: store target client user_id in session state, apply as filter on all queries — do not use actual Supabase impersonation

---

## Client Profile Setup

Every client completes a one-time profile before creating any deal.
Profile data prints automatically on every PDF.

**Company fields:**
- Company name Thai (required)
- Company name English (optional)
- Tax ID — เลขผู้เสียภาษี 13 digits (required if VAT registered)
- Address (required)
- Phone (required)
- Logo upload → stored in Supabase Storage bucket `client-logos` at path `{user_id}/logo`

**Tax defaults:**
- VAT registered: Yes / No toggle
- VAT rate: numeric, default 7.00 (editable — policy may change)
- Default WHT rate: select from None / 1% / 2% / 3% / 5%

These defaults pre-fill every new document and can be overridden per document.

---

## UI Style

Warm minimalism — inspired by Notion's design language.

- Page background: warm off-white #F7F6F3
- Cards: white #FFFFFF, 0.5px border #E8E6DF, border-radius 10px
- Primary action color: blue #378ADD
- Font: system-ui or Inter — clean, renders Thai naturally
- Font sizes: 13px body, 15px card titles, 11px labels and badges
- Spacing: generous padding (16–20px on cards), 8–12px gaps between elements
- No gradients, no drop shadows, no decorative effects
- Fully responsive — same codebase for mobile and desktop

**Status badge colors:**
| Status | Background | Text |
|---|---|---|
| Draft | #F1EFE8 | #444441 |
| Sent / In billing | #E6F1FB | #0C447C |
| Paid / Generated | #EAF3DE | #27500A |
| Overdue | #FCEBEB | #791F1F |
| Pending / Quote | #FAEEDA | #633806 |
| Voided / Converted | #F1EFE8 | #888780 |

---

## Navigation

Four bottom navigation tabs only (mobile-first layout):

1. **หน้าหลัก** (Home) — deal pipeline
2. **เอกสาร** (Documents) — full document list
3. **สินค้า** (Catalog) — items and stock
4. **ตั้งค่า** (Settings) — profile, tax, numbering

---

## Home Screen — Deal Pipeline

**Top summary row (3 metric cards):**
- ยังไม่ชำระ — total unpaid across all active billing notes
- รับแล้วเดือนนี้ — total paid this calendar month
- เกินกำหนด — total overdue (red text)

**Needs action section:**
All active deals sorted by most recent activity. Each deal card shows:
- Customer name (bold)
- Item summary (first item name + count if multiple)
- Amount (net payable)
- Status badge
- Next action label in plain Thai (tap to proceed)

**Recently done section (below divider):**
Last 5 completed deals — customer name, amount, paid date.

The user should never need to leave this screen for daily work.

---

## Starting a New Deal

Tapping "+ สร้างใหม่" opens a bottom sheet with three plain options:

```
คุณต้องการทำอะไร?

○ ส่งใบเสนอราคาก่อน
○ ออกใบแจ้งหนี้เลย
○ ได้รับเงินแล้ว ต้องการออกใบเสร็จ
```

These map silently to starting document type:
- Option 1 → create Quotation
- Option 2 → create Tax Invoice
- Option 3 → create Billing Note

User never sees the words "quotation", "invoice", or "billing note" at this step.

After selecting, user is taken to the document form with:
1. Customer selector (search existing or add new inline)
2. Line items (search catalog or type freely)
3. Save button

Everything else (tax, document number, dates) is handled automatically.

---

## Deal Flow and Pipeline Stages

```
QUOTE  →  INVOICE  →  COLLECT  →  DONE
```

**Stage actions — one tap each:**

| Current stage | Button label | What happens |
|---|---|---|
| Quote (sent) | ลูกค้าตกลงแล้ว | Quotation → Converted. New Invoice created with same items. |
| Invoice (sent) | วางบิล | Opens billing note form pre-filled with this invoice selected. |
| Collect (sent) | รับเงินแล้ว | Opens payment confirmation. Receipt auto-generates on confirm. |
| Done | — | No action. Show receipt download only. |

**Skipping stages:**
- Quotation is optional — deal can start at Invoice
- Invoice can be skipped — deal can start at Billing Note (for option 3 above)

**Conversion:**
Quotation → Invoice copies all line items, customer, amounts exactly.
Original quotation status → 'converted'. Locked, no editing.

---

## Side Actions (inside deal detail only)

**Delivery Note** — shown only if deal has at least one product line item.
Button: "บันทึกการส่งของ" (quiet secondary style, not primary)
Creates a delivery note document. Does not affect pipeline stage or invoice status.

**Credit Note** — shown only if deal status is 'done' (fully paid).
Button: "ออกใบลดหนี้" (quiet secondary style)
Creates a credit note document referencing the paid invoice.

Neither button is ever shown on the home pipeline screen.

---

## Document Types Reference

| Document | Thai name | doc_type value | Who creates |
|---|---|---|---|
| Quotation | ใบเสนอราคา | quotation | User or pipeline |
| Tax Invoice | ใบกำกับภาษี | invoice | User or pipeline |
| Billing Note | ใบวางบิล | billing_note | User or pipeline |
| Receipt | ใบเสร็จรับเงิน | receipt | Auto only |
| Delivery Note | ใบส่งของ | delivery_note | User (side action) |
| Credit Note | ใบลดหนี้ | credit_note | User (side action) |

---

## Document States

```
Quotation:     draft → sent → converted | voided
Invoice:       draft → sent → in_billing → paid | voided
Billing Note:  draft → sent → paid | overdue | voided
Receipt:       generated  (permanent, no transitions)
Delivery Note: draft → sent | voided
Credit Note:   draft → issued | voided
```

**Overdue** is set automatically — run `mark_overdue_billing_notes()` daily.
Use a Vercel cron job: `vercel.json` with a `/api/cron/overdue` route calling the Supabase function.

---

## Void and Copy

**If document status is 'draft':** allow direct editing. No special flow.

**If document status is 'sent' or later:**
- Show "ยกเลิกและสร้างใหม่" button (void and copy)
- Original document: status → 'voided', voided_at = now(), cannot be edited
- New document: exact copy of original, status = 'draft', new doc_number = null (assigned on save), copied_from_id = original id
- User edits the new draft and saves

**Edge case — invoice voided while inside a billing note:**
- Set billing note status back to 'draft'
- Remove the voided invoice from billing_note_invoices
- Show warning banner on billing note: "ใบแจ้งหนี้ในใบวางบิลนี้ถูกยกเลิก กรุณาตรวจสอบก่อนส่งใหม่"

Voided documents stay visible in document list with Voided badge.
They can be viewed and PDF downloaded but never edited.

---

## Document Numbering

Format: `[PREFIX]-[YEAR]-[SEQUENCE]`
Examples: INV-2025-001, QT-2025-004, BN-2025-002

Default prefixes created automatically when client profile is saved:
QT, INV, BN, RC, DN, CN

Client can change prefixes and toggle yearly reset in Settings → Numbering.

Document number is assigned by calling `generate_doc_number(user_id, doc_type)` inside a
Supabase transaction at the moment of saving. Never assign numbers in React — always call
the DB function to prevent duplicates.

Draft documents have no number yet. Number is assigned on first save as non-draft,
or when explicitly confirmed by user.

---

## Tax Calculation

**Strict order — implement exactly as written:**

```typescript
// lib/tax.ts
export function calculateTax(
  lineItems: LineItem[],
  vatRegistered: boolean,
  vatRate: number,      // e.g. 7.00
  whtRate: number       // e.g. 3.00
): TaxResult {
  const subtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0)
  const vatAmount = vatRegistered ? round2(subtotal * vatRate / 100) : 0
  const total = round2(subtotal + vatAmount)
  const whtAmount = whtRate > 0 ? round2(subtotal * whtRate / 100) : 0
  const netPayable = round2(total - whtAmount)
  return { subtotal, vatAmount, total, whtAmount, netPayable }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
```

**Rules:**
- WHT is calculated on subtotal ONLY — never on the VAT-inclusive total
- VAT and WHT do not compound each other
- All amounts stored to 2 decimal places
- Store calculated amounts at save time — never recalculate from current prices later

**Display on document:**
```
ราคารวม             ฿ 12,500.00
VAT 7%                 ฿ 875.00
─────────────────────────────────
รวมทั้งสิ้น         ฿ 13,375.00
หัก ณ ที่จ่าย 3%      -฿ 375.00
─────────────────────────────────
ยอดที่ต้องชำระ       ฿ 13,000.00
```

Hide VAT row if not VAT registered. Hide WHT row if rate is 0.

---

## Billing Note — Batching

One billing note can cover one or many invoices from the same customer.

**Form flow:**
1. Customer auto-filled (from deal context)
2. Show checklist of all unpaid invoices for that customer
3. User selects one or many
4. System calculates combined subtotal, VAT, WHT, net payable from selected invoices
5. User sets due date
6. Optional note
7. Save → status = draft, then send → status = sent

**Payment confirmation (marking as paid):**
- User taps "รับเงินแล้ว"
- Modal asks:
  - Payment method: Cash / Bank transfer / Cheque
  - WHT certificate number (ใบหักภาษี ณ ที่จ่าย) — text field
  - Date received (default today)
- On confirm:
  - Billing note status → 'paid'
  - All linked invoices status → 'paid'
  - Receipt document auto-created (status = 'generated')
  - Stock is NOT affected at this step (stock deducts when invoice is confirmed/sent)

---

## Receipt — Auto Generation

Receipt is created automatically. Never create manually.

**Receipt document contains:**
- doc_type = 'receipt'
- status = 'generated'
- deal_id = same as billing note's deal
- customer_id = same as billing note
- Reference to billing note number (in note field or dedicated field)
- payment_method from confirmation
- wht_certificate_no from confirmation
- paid_at = confirmation timestamp
- amount_received = billing note net_payable
- subtotal, vat_amount, wht_amount, net_payable = copied from billing note

---

## Line Items

Used on: Quotation, Invoice, Delivery Note, Credit Note.
(Billing note uses invoice checklist instead — no line items.)

**Each line item:**
- item_id (nullable — null for free-text items not in catalog)
- item_name (snapshot — always store, even if item_id is set)
- item_type: product | service
- unit (snapshot)
- unit_price (snapshot)
- quantity (in base unit)
- qty_carton (optional display field — base qty ÷ qty_per_carton)
- carton_unit (optional display label)
- line_total = unit_price × quantity (stored, not computed on read)
- sort_order (integer, for drag reorder later)

User can add items by searching catalog or typing freely.
Free-text items (no item_id) do not affect stock.

The item name input uses a custom `CatalogAutocomplete` dropdown (replacing the native
`<datalist>`). It filters by partial name match, shows item type badge and unit price
per suggestion, and displays a green checkmark when the line item is linked to a catalog
entry. Selection autofills item_type, unit, and unit_price. Keyboard navigation (↑↓ Enter Esc)
supported. Same component reused in the Credit Note form as an add-from-catalog selector.

---

## Item Catalog

**Item fields:**
- name (required)
- item_type: product | service
- unit_price (per base unit)
- base_unit (e.g. ชิ้น, รีม, ชั่วโมง)
- carton_unit (optional — e.g. ลัง, กล่อง)
- qty_per_carton (optional numeric)
- stock_count (product only — managed by system)
- low_stock_threshold (default 5)
- is_active (soft delete)

**Service items:** never show stock fields anywhere in the UI.

**If carton_unit and qty_per_carton are blank:** item has no unit conversion.
Show only base unit everywhere.

---

## Unit Conversion Logic

```typescript
// lib/stock.ts
export function cartonsToBase(cartons: number, qtyPerCarton: number): number {
  return Math.round(cartons * qtyPerCarton * 1000) / 1000  // 3 decimal precision
}

export function baseToCartons(base: number, qtyPerCarton: number): number {
  return Math.round((base / qtyPerCarton) * 1000) / 1000
}
```

**Stock in:** user enters carton quantity → convert to base → add to stock_count.
**Invoice line item:** user enters base quantity → show carton equivalent as hint text.
**Stock display:** always show both if carton unit is set: "52 รีม (5.2 ลัง)"

---

## Stock Management

**Stock movements table records every change.**

**Auto movements (system-triggered):**
- Invoice status draft → sent: deduct line item quantities (products only)
- Invoice voided after sent: restore line item quantities

**Manual movements (user-triggered from item detail screen):**
- Stock in: user enters quantity (in cartons if carton_unit set, else base unit)
- Stock out: user enters base quantity + reason

**Rules:**
- Warning if stock would go below zero — do not block
- stock_count floor at 0 for display (never show negative)
- Low stock badge when stock_count ≤ low_stock_threshold

**Stock movement log columns:**
Date | Type | Qty entered | Converted to base | Reason | Balance

---

## PDF Generation

Use two client-side PDF paths:
- `jsPDF` with embedded Thai font support for the classic renderer
- styled HTML rendered into a fixed A4 off-screen sheet, then captured and inserted into `jsPDF` for the modern renderer

Do not use `@react-pdf/renderer` here. Generate client-side only — no server needed.

**Every PDF (A4, portrait):**
- Header: client logo + company name + address + tax ID (right side) + document type Thai and English + document number + date
- Customer block: bill to name, address, tax ID
- Line items table: no. / description / unit / qty / unit price / amount
- Tax summary block: subtotal / VAT / total / WHT / net payable (hide zero rows)
- Footer: signature line + stamp area + "generated by [system name]"

**Billing note PDF:** replaces line items table with invoice reference table:
Invoice no. / Invoice date / Amount / VAT / Total

**Receipt PDF additionally shows:**
- Payment method
- WHT certificate number
- Amount received

**Thai font:** use Sarabun or Noto Sans Thai — embed in PDF, do not rely on system fonts.

**PDF template — Modern (HTML print):**
An alternative "modern" template renders as styled HTML and is captured with `html2canvas`,
but it must never capture the visible mobile preview itself. Always render a separate fixed-width
A4 sheet off-screen in a hidden container, then capture that hidden sheet so mobile and desktop
export match the same layout.

Users select their template in Settings (classic / modern / bold / perforated).
Bulk ZIP downloads respect the chosen template — documents using the modern template
are rendered off-screen in a hidden container before capture.

**Modern save/download behavior:**
- Desktop: clicking save should trigger a normal file download
- Mobile: clicking save should first attempt the browser's native save/share flow for the PDF file
- If native mobile file sharing is unavailable, try a direct browser download
- Only fall back to opening the PDF in a new tab if the browser refuses both save/share and download
- Accept that some mobile browsers, especially iOS Safari and in-app browsers, may still show a share sheet instead of silently saving straight to device storage

**Layout alignment (modern template):**
- Header outer container uses no side padding; inner content areas use `px-2` (8px) to match table cell padding
- Customer detail section background and border span the full table width (174mm)
- Table column headers have background only (no bottom border line)
- Tax invoice/receipt label renders as two stacked lines: "ใบกำกับภาษี /" + "ใบเสร็จรับเงิน"

---

## Search and Filter — Documents Screen

- Text search: customer name or document number (debounced, 300ms)
- Filter chips: All / Quotation / Invoice / Billing Note / Receipt / Delivery Note / Credit Note
- Status filter: All / Draft / Sent / Paid / Overdue / Voided
- Date range picker: issue date from/to
- Default sort: created_at descending

---

## Data Export

Available in the Documents screen:

- **CSV export:** all documents, one row per document, columns: doc_number, doc_type, status, customer_name, issue_date, due_date, subtotal, vat, wht, net_payable, paid_at
- **Bulk PDF ZIP download:** multi-select documents via checkboxes, then download all selected as a ZIP of PDFs. Shows progress (e.g. "กำลังสร้าง 3/12"). Respects the client's chosen PDF template (classic jsPDF or modern html2canvas). Uses JSZip for packaging. Mobile: floating selection bar at bottom with count and download button.

---

## Admin Panel

Separate section at `/admin/*`. Only accessible when profile.role = 'admin'.

**Clients list:** all client accounts, name, email, created date, active status.
**Client detail:** read-only view of their documents and catalog.
**Actions:** create new client (calls Supabase Admin API to create auth user + insert profile), reset password (send password reset email via Supabase Auth), deactivate account.

Admin cannot edit documents or catalog items belonging to clients.

---

## Supabase Configuration Notes

**Row Level Security:** enabled on all tables. Policies written so:
- Clients read/write only rows where user_id = auth.uid()
- Admin reads all rows (select only — no insert/update/delete on client data)
- Receipts are insert-only from system functions, never editable by client

**Storage buckets:**
- `client-logos` — authenticated users read/write their own path only
- `document-pdfs` — optional cache, same policy

**Cron job for overdue:**
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/overdue",
    "schedule": "0 1 * * *"
  }]
}
```
Route calls `supabase.rpc('mark_overdue_billing_notes')` with service role key.

**Document number generation:**
Always call `supabase.rpc('generate_doc_number', { p_user_id, p_doc_type })` from within a
transaction when saving a document. Never generate numbers in React.

---

## Data Model Summary

| Table | Purpose |
|---|---|
| profiles | Links auth.users to role (admin/client) |
| client_profiles | Company info, tax defaults, logo |
| doc_number_sequences | Per-client per-type running number config |
| customers | Client's own customer list |
| items | Product and service catalog per client |
| stock_movements | Full audit log of every stock change |
| deals | Parent container for a transaction lifecycle |
| documents | All document types in one table |
| document_line_items | Line items on quotation/invoice/delivery/credit |
| billing_note_invoices | Invoice references inside a billing note |

All financial amounts stored at save time. Never recomputed from live item prices.
Line items store item name, price, unit as snapshots — not live references.

---

## What Is Intentionally Left Out

Do not build these in v1. They can be added without redesigning the system:

- Email sending from the system
- Payment gateway integration
- Recurring invoices
- Purchase orders and restocking workflow
- Multi-currency
- Multiple users per client account
- Accountant access role
- Automated SMS/email reminders for overdue
- Discount fields per invoice or per line item
- Stock variants (size, color)
- Two-level unit conversion (pcs → box → carton)
- Native mobile app

---

## Key Design Decisions Summary

| Decision | Choice | Reason |
|---|---|---|
| Mental model | Deal pipeline, not document list | Matches how users think |
| New deal entry | Plain-language 3 options | Non-technical users |
| Receipt creation | Always automatic | One less step for user |
| Delivery note | Side action only | 5% of deals — not in pipeline |
| Credit note | Side action on completed deals only | 1% of deals — not in pipeline |
| WHT calculation | Per document, inherited from profile | Simpler, covers 95% of cases |
| WHT base | Pre-VAT subtotal only | Thai revenue department requirement |
| Stock unit | Always stored in base unit | No conversion errors |
| Carton conversion | One level only (base ↔ carton) | Sufficient for all clients |
| Mistake correction | Void and copy | Full audit trail, no retyping |
| Tax fields | Hidden by default, expandable | Non-technical users not confused |
| Financial amounts | Stored at save time | Historical accuracy |
| Document numbers | Generated by DB function | Prevents duplicates |
| UI language | Thai primary, English secondary | Real users are Thai |
| UI style | Warm minimal, blue primary, Notion-inspired | Approachable, professional |
| Auth | Supabase Auth only | Zero custom auth code |
| Currency | Thai Baht only, no multi-currency | Scope control |
| Backend | No custom server — Supabase + Vercel cron only | Simplicity, cost |
---

## Current Rollout Status

Completed recently:
- Documents list redesigned into a cleaner command-center style
- Mobile-first improvements for Documents list filters and scanning
- Quick-detail document modal from the Documents list
- Quick-detail modal supports outside-click close
- Quick-detail modal now fetches full document detail on open
- Quick-detail modal shows compact item lines and financial summary
- Document detail page visual hierarchy improved for clearer summary and actions
- Catalog autocomplete with visual match indicator replaces native datalist in deal/credit note forms
- Multi-select and bulk PDF ZIP download on Documents page (respects classic and modern templates)
- PDF print template layout aligned: customer background matches table width, unified text inset
- Tax invoice/receipt label split into two stacked lines on print template
- Modern PDF export now renders from a hidden fixed A4 sheet so mobile and desktop layout stay consistent
- Mobile PDF save now prefers native save/share or direct download before falling back to opening a tab
- Home greeting uses full company name (not just first word)

Still remaining:

### Phase 1
- Finish polishing document detail page so summary, actions, and related information feel fully consistent across mobile and desktop
- Improve Home dashboard into a stronger "what needs attention now" view
- Simplify create/edit document forms and reduce visual noise in long workflows

### Phase 2
- Redesign Customers list and customer detail around relationship status, outstanding amount, and recent activity
- Reorganize Settings into clearer business-friendly sections
- Improve empty states, confirmations, and general UI consistency across screens

### Phase 3
- Improve workflow visibility across related documents: quotation -> invoice -> billing note -> receipt
- Add deeper mobile polish for sticky actions, sheet behavior, and reduced scroll fatigue
