# Settings Page — Standalone Build Prompt

> Self-contained prompt for building the Settings page.
> Read the Master Build Prompt for system-wide context (auth, schema, design tokens).
> This covers: company profile, tax defaults, document numbering, stock settings.

---

## What This Page Is

The settings page is where clients configure their account once and rarely return.
It covers four areas: company profile (printed on every PDF), tax defaults (pre-fill
every document), document numbering (prefix and sequence per type), and stock behavior.
Keep it simple — most clients set this up once and never touch it again.

---

## Route

```
/settings
```

Single page with four sections stacked vertically. No tabs, no sub-routes.
Each section is a card with its own save button — sections save independently.

---

## Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  COMPANY PROFILE CARD       │
│  TAX SETTINGS CARD          │
│  DOCUMENT NUMBERING CARD    │
│  STOCK SETTINGS CARD        │
│  ACCOUNT CARD               │
└─────────────────────────────┘
```

---

## Top Bar

```
ตั้งค่า
```

- Title only: 15px, weight 600, #1A1A18
- No back button — settings is a bottom nav tab
- No action button in top bar — each card saves independently

---

## Card 1 — Company Profile

White card, padding 16px, 10px radius.

**Section label:** "ข้อมูลบริษัท" — 11px, uppercase, #888780, weight 600

**Logo upload:**
```
[Logo preview — 64×64px, rounded 8px]    [เปลี่ยนโลโก้]
                                          [ลบโลโก้]  ← only if logo exists
```

- If no logo: show placeholder box with camera icon, bg #F7F6F3, dashed border
- Tap "เปลี่ยนโลโก้" → opens device image picker
- Accepted formats: JPG, PNG, max 2MB
- On select → upload to Supabase Storage at `client-logos/{user_id}/logo`
- Show upload progress inline (simple progress bar below logo)
- On success → update logo_url in client_profiles, show new logo immediately
- "ลบโลโก้" → confirmation "ลบโลโก้?" → on confirm: delete from storage, set logo_url = null

**Fields:**

**ชื่อบริษัท (ภาษาไทย) — required:**
```
[input]
```
Placeholder: "บริษัท มาลี จำกัด"

**ชื่อบริษัท (ภาษาอังกฤษ) — optional:**
```
[input]
```
Placeholder: "Malee Co., Ltd. (ไม่บังคับ)"

**เลขประจำตัวผู้เสียภาษี:**
```
[input — numeric, 13 digits]
```
Placeholder: "0000000000000"
Hint: "13 หลัก จำเป็นสำหรับใบกำกับภาษี" — 11px, #888780
If vat_registered = true and this field is empty: show red hint "จำเป็นต้องกรอก"

**ที่อยู่:**
```
[textarea — 3 rows]
```
Placeholder: "ที่อยู่สำหรับพิมพ์บนเอกสาร"

**เบอร์โทรศัพท์:**
```
[input — phone keyboard]
```

**ชื่อผู้ติดต่อ / ชื่อเจ้าของ:**
```
[input]
```
Placeholder: "ชื่อที่ใช้แสดงในการทักทาย"
Hint: "ใช้สำหรับข้อความทักทายในแอป" — 11px, #888780
This field is used for the greeting on home dashboard: "สวัสดี, คุณ[ชื่อ]"

**Save button:**
"บันทึกข้อมูลบริษัท" — full width, blue, 8px radius
On save → update client_profiles, show toast "บันทึกแล้ว ✓"
Validation: company_name_th required

---

## Card 2 — Tax Settings

White card, padding 16px, 10px radius.

**Section label:** "ตั้งค่าภาษี" — 11px, uppercase, #888780, weight 600

**จดทะเบียน VAT:**
```
จดทะเบียนภาษีมูลค่าเพิ่ม        [toggle ON/OFF]
```

Toggle: blue when on, gray when off.

Helper text below toggle — updates based on state:
- When ON: "เอกสารจะออกเป็น ใบกำกับภาษี และแสดง VAT อัตโนมัติ" — 11px, #888780
- When OFF: "เอกสารจะออกเป็น ใบแจ้งหนี้ ไม่มีรายการ VAT" — 11px, #888780

**อัตรา VAT (shown only when VAT toggle is ON):**
```
อัตราภาษีมูลค่าเพิ่ม    [7] %
```
Numeric input, default 7.
Hint: "ปัจจุบัน 7% — แก้ไขได้หากอัตราเปลี่ยนแปลง" — 11px, #888780

**ภาษีหัก ณ ที่จ่าย (WHT) เริ่มต้น:**
```
อัตราเริ่มต้น WHT    [3% ▾]
```
Dropdown: ไม่มี / 1% / 2% / 3% / 5%
Hint: "ใช้เป็นค่าเริ่มต้นในทุกเอกสาร แก้ไขได้ต่อเอกสาร" — 11px, #888780

**Important notice (shown as info box):**
```
[ℹ blue info box]
การเปลี่ยนแปลงการตั้งค่าภาษีจะมีผลกับเอกสารใหม่เท่านั้น
เอกสารที่สร้างไปแล้วจะไม่เปลี่ยนแปลง
```
bg #E6F1FB, text #0C447C, 8px radius, padding 10px 12px, 12px text.

**Save button:**
"บันทึกการตั้งค่าภาษี" — full width, blue
On save → update client_profiles (vat_registered, vat_rate, default_wht_rate)
Show toast "บันทึกแล้ว ✓"

---

## Card 3 — Document Numbering

White card, padding 16px, 10px radius.

**Section label:** "เลขที่เอกสาร" — 11px, uppercase, #888780, weight 600

**Description:**
"ตั้งค่า prefix และรูปแบบเลขที่สำหรับแต่ละประเภทเอกสาร" — 12px, #888780, margin-bottom 12px

**One row per document type — six rows total:**

```
ใบเสนอราคา      Prefix: [QT  ]    ตัวอย่าง: QT-2568-001
ใบกำกับภาษี     Prefix: [INV ]    ตัวอย่าง: INV-2568-001
ใบวางบิล        Prefix: [BN  ]    ตัวอย่าง: BN-2568-001
ใบเสร็จรับเงิน  Prefix: [RC  ]    ตัวอย่าง: RC-2568-001
ใบส่งของ        Prefix: [DN  ]    ตัวอย่าง: DN-2568-001
ใบลดหนี้        Prefix: [CN  ]    ตัวอย่าง: CN-2568-001
```

**Each row:**
- Doc type label: 13px, #1A1A18, width 110px
- Prefix input: 60px wide, uppercase forced, max 5 characters, bg #F7F6F3
- Example text: "ตัวอย่าง: [PREFIX]-[THAI_YEAR]-001" — 11px, #888780
  - Thai year = current Gregorian year + 543 (e.g. 2025 → 2568)
  - Updates live as prefix changes

**Reset yearly toggle (one setting for all types):**
```
รีเซ็ตลำดับทุกปี              [toggle ON]
เลขที่จะเริ่มต้นใหม่ทุกต้นปี
```
Default ON. When OFF: sequence runs continuously forever.

**Warning if prefix changed:**
```
[⚠ amber info box — shown only when any prefix is changed]
การเปลี่ยน prefix จะมีผลกับเอกสารใหม่เท่านั้น
เลขที่เดิมจะยังคงอยู่ในระบบ
```

**Save button:**
"บันทึกการตั้งค่าเลขที่" — full width, blue
On save → update all doc_number_sequences rows for this user
Show toast "บันทึกแล้ว ✓"
Validation: prefix cannot be empty for any type

---

## Card 4 — Stock Settings

White card, padding 16px, 10px radius.

**Section label:** "การจัดการสต็อก" — 11px, uppercase, #888780, weight 600

**ตัดสต็อกอัตโนมัติเมื่อ:**

Two radio options:

```
● ส่งใบแจ้งหนี้ / ใบกำกับภาษี      ← default
  ระบบตัดสต็อกทันทีที่ยืนยันว่าส่งแล้ว
  เหมาะสำหรับธุรกิจบริการและสินค้าทั่วไป

○ ออกใบส่งของ
  ระบบตัดสต็อกเมื่อส่งใบส่งของ
  เหมาะสำหรับธุรกิจที่เบิกสินค้าออกจากคลังก่อนออกบิล
```

Radio button style: 18px circle, blue fill when selected, border #E8E6DF when unselected.
Option title: 13px, weight 500, #1A1A18.
Option description: 11px, #888780, margin-top 2px.
Selected option bg: #F0F7FF, border 0.5px #378ADD, 8px radius, padding 10px 12px.
Unselected option bg: white, border 0.5px #E8E6DF, 8px radius, padding 10px 12px.

**Save button:**
"บันทึกการตั้งค่าสต็อก" — full width, blue
On save → update client_profiles.stock_deduct_trigger
Show toast "บันทึกแล้ว ✓"

---

## Card 5 — Account

White card, padding 16px, 10px radius.

**Section label:** "บัญชี" — 11px, uppercase, #888780, weight 600

**Email display (read-only):**
```
อีเมล    somchai@example.com
```
Label 12px #888780, value 13px #1A1A18. Not editable — contact admin to change.

**เปลี่ยนรหัสผ่าน:**
```
[เปลี่ยนรหัสผ่าน →]
```
Blue text button, 13px.
Tap → sends password reset email via Supabase Auth:
```typescript
await supabase.auth.resetPasswordForEmail(userEmail)
```
Show toast: "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบอีเมล"

**ออกจากระบบ (Log out):**
```
[ออกจากระบบ]
```
Red text, 13px, tappable.
Tap → confirmation: "ออกจากระบบ?" with confirm (red) and cancel (gray).
On confirm:
```typescript
await supabase.auth.signOut()
// Navigate to /login
```

---

## Incomplete Profile Banner

If client has not completed their company profile (company_name_th is null or empty),
show a persistent yellow banner at the very top of the settings page above all cards:

```
[⚠ amber banner]
ข้อมูลบริษัทยังไม่ครบ
เพิ่มชื่อบริษัทและที่อยู่เพื่อให้เอกสาร PDF แสดงถูกต้อง
```

Banner is not dismissible. Disappears automatically when profile is saved with required fields.

---

## Data Loading

Load all settings data in a single query on page mount:

```typescript
const { data: profile } = await supabase
  .from('client_profiles')
  .select('*')
  .eq('user_id', currentUserId)
  .single()

const { data: sequences } = await supabase
  .from('doc_number_sequences')
  .select('*')
  .eq('user_id', currentUserId)
  .order('doc_type')
```

Pre-populate all cards with existing values on load.

---

## Save Behavior

Each card saves independently with its own save button.
No global "save all" button — this prevents accidental saves across sections.

Each save button:
- Shows loading spinner while saving (replace button text with spinner)
- Shows "บันทึกแล้ว ✓" toast on success
- Shows "บันทึกไม่สำเร็จ ลองใหม่" toast on error
- Returns to normal state after save completes

Unsaved changes indicator:
When any field in a card is changed but not yet saved — show a subtle dot indicator
on the save button: blue dot, 6px, top-right corner of button.
Disappears after save.

---

## Loading State

Show skeleton for each card while data loads.
Static gray #F1EFE8 rectangles per field.

---

## Component Breakdown

| Component | Props |
|---|---|
| `SettingsPage` | — |
| `CompanyProfileCard` | profile, onSave |
| `LogoUploader` | logoUrl, userId, onUpload, onDelete |
| `TaxSettingsCard` | profile, onSave |
| `DocumentNumberingCard` | sequences, onSave |
| `DocSequenceRow` | sequence, currentYear, onChange |
| `StockSettingsCard` | profile, onSave |
| `AccountCard` | email, onPasswordReset, onLogout |
| `IncompleteProfileBanner` | visible |

---

## What This Page Does NOT Do

- Does not allow changing email address — contact admin
- Does not support multiple users per client account in v1
- Does not handle billing or subscription — this is a free tool
- Does not allow deleting the account — contact admin
- Does not support notification preferences in v1
- Does not support language switching in v1 — Thai only
