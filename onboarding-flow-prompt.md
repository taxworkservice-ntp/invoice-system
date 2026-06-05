# Onboarding Flow — Standalone Build Prompt

> Self-contained prompt for building the first-time client onboarding experience.
> Read the Master Build Prompt and Settings Page prompt for context.
> This covers: first login detection, profile setup wizard, and first-use nudges.

---

## What This Is

When a client logs in for the first time their account is empty — no company profile,
no items, no customers. Without guidance they will immediately try to create a document
and end up with a PDF that has blank company info. The onboarding flow prevents this by
walking them through the minimum setup before they reach the dashboard.

The onboarding must be fast, friendly, and skippable after step 1.
Do not make it feel like a long form. Maximum 3 steps.

---

## When Onboarding Triggers

Check on every login whether the client needs onboarding:

```typescript
// After successful login, before routing to home
const { data: profile } = await supabase
  .from('client_profiles')
  .select('company_name_th, tax_id, vat_registered')
  .eq('user_id', currentUserId)
  .single()

if (!profile || !profile.company_name_th) {
  // Route to onboarding
  navigate('/setup')
} else {
  // Route to home dashboard
  navigate('/home')
}
```

Onboarding triggers when `company_name_th` is null or empty.
Once company name is saved — onboarding never shows again.

---

## Route

```
/setup      ← onboarding wizard (redirected here on first login)
```

---

## Page Design

Full-screen white page. No bottom nav. No top bar back button.
Progress indicator at top: three dots, active dot filled blue.

```
  ●  ○  ○       ← step dots
```

Clean, centered layout. Warm off-white bg #F7F6F3.
Card content centered vertically, max-width 400px, padding 24px.

---

## Step 1 — Company Profile (required, cannot skip)

**Header:**
"ยินดีต้อนรับ! 👋" — 22px, weight 700, #1A1A18, centered
"เริ่มต้นด้วยการตั้งค่าข้อมูลบริษัทของคุณ" — 14px, #888780, centered, margin-top 6px

**Fields (same as settings company profile card):**

**ชื่อบริษัท / ชื่อร้าน — required:**
Large input, 16px font, prominent.
Placeholder: "เช่น ร้านมาลี หรือ บริษัท สมชาย จำกัด"
Autofocus on load.

**ชื่อผู้ติดต่อ — optional:**
Placeholder: "ชื่อคุณ (ใช้สำหรับทักทายในแอป)"

**จดทะเบียน VAT หรือไม่:**
Two large option cards side by side:

```
┌──────────────┐  ┌──────────────┐
│      🧾      │  │      📋      │
│  จด VAT แล้ว │  │  ยังไม่ได้จด │
│              │  │              │
│ ออกใบกำกับ  │  │ ออกใบแจ้ง   │
│ ภาษีได้      │  │ หนี้         │
└──────────────┘  └──────────────┘
```

Card style: white, 0.5px border #E8E6DF, 10px radius, padding 16px, centered content.
Selected: border #378ADD, bg #F0F7FF.
Default: neither selected — user must choose one.

**เลขผู้เสียภาษี — shown only if VAT selected:**
Appears with slide-down animation when VAT card is tapped.
Placeholder: "0000000000000 (13 หลัก)"
Hint: "จำเป็นสำหรับการออกใบกำกับภาษีที่ถูกต้องตามกฎหมาย" — 11px, #888780

**Continue button:**
"ถัดไป →" — full width, blue, 8px radius, 15px, weight 600
Disabled (gray) until company name AND VAT choice are filled.
On tap → save to client_profiles, advance to step 2.

**On save step 1:**
```typescript
await supabase
  .from('client_profiles')
  .upsert({
    user_id: currentUserId,
    company_name_th: companyName,
    contact_name: contactName || null,
    vat_registered: vatRegistered,
    tax_id: vatRegistered ? taxId : null,
    // defaults for other fields
    vat_rate: 7.00,
    default_wht_rate: '3',
    stock_deduct_trigger: 'invoice'
  })

// Create default doc number sequences (trigger fires automatically via DB trigger)
```

---

## Step 2 — Add First Item (skippable)

**Header:**
"เพิ่มสินค้าหรือบริการชิ้นแรก" — 20px, weight 700, centered
"คุณสามารถเพิ่มเพิ่มเติมได้ภายหลัง" — 13px, #888780, centered

**Simplified item form — not the full catalog form:**
Only the most essential fields:

**ประเภท:**
```
[  🛍 สินค้า  |  ⚙ บริการ  ]
```
Segmented control. Default: สินค้า.

**ชื่อ — required:**
Placeholder: "เช่น กระดาษ A4, ออกแบบโลโก้..."

**ราคา — required:**
```
฿  [________]   ต่อ  [ชิ้น ▾]
```
Price input + unit dropdown side by side.

**สต็อกเริ่มต้น (สินค้าเท่านั้น):**
```
[0]  ชิ้น
```
Shown only for product type.

**Two buttons:**
"เพิ่มสินค้า / บริการ" — full width, blue, saves item and advances to step 3
"ข้ามขั้นตอนนี้ →" — full width, gray text, advances to step 3 without saving

On save:
```typescript
await supabase
  .from('items')
  .insert({
    user_id: currentUserId,
    name: itemName,
    item_type: itemType,
    unit_price: price,
    base_unit: unit,
    stock_count: itemType === 'product' ? initialStock : 0
  })

// Create initial stock movement if stock > 0
if (itemType === 'product' && initialStock > 0) {
  await supabase.from('stock_movements').insert({
    item_id: newItem.id,
    user_id: currentUserId,
    movement_type: 'manual_in',
    qty_base: initialStock,
    balance_after: initialStock,
    reason: 'สต็อกเริ่มต้น'
  })
}
```

---

## Step 3 — Ready (completion screen)

**Header:**
"พร้อมแล้ว! 🎉" — 24px, weight 700, centered

**Summary of what was set up:**
```
✓ ข้อมูลบริษัท: [company name]
✓ VAT: [จดทะเบียน / ไม่ได้จด]
[✓ สินค้า: [item name]]   ← shown only if item was added
```
Each line: 14px, #27500A, left-aligned within centered card.

**What they can do next — three option cards:**

```
┌─────────────────────────────────────────────┐
│  🧾  สร้าง deal แรก                         │
│      เริ่มออกใบเสนอราคาหรือใบแจ้งหนี้        │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  👥  เพิ่มลูกค้าก่อน                        │
│      บันทึกข้อมูลลูกค้าที่คุณทำงานด้วย      │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  ⚙️  ตั้งค่าเพิ่มเติม                       │
│      แก้ไขที่อยู่, prefix เอกสาร, และอื่นๆ  │
└─────────────────────────────────────────────┘
```

Card style: white, 0.5px border #E8E6DF, 10px radius, padding 14px 16px.
Each card tappable — navigates to respective route.
On tap → navigate and mark onboarding complete.

**Or skip all:**
"เข้าสู่หน้าหลัก →" — blue text link below cards, centered.
Tap → navigate to /home.

**Any tap on this screen marks onboarding complete.**
No way to come back to /setup after this step.

---

## Back Navigation Between Steps

Step 2 and 3 have a "← ย้อนกลับ" text link at top left — 13px, #378ADD.
Step 1 has no back button — it's the first screen.

Going back does not lose entered data — preserve form state in component state.

---

## Progress Dots

Three dots at top of each step screen:

```
Step 1:  ●  ○  ○
Step 2:  ●  ●  ○
Step 3:  ●  ●  ●
```

Active dot: 8px, filled #378ADD.
Inactive dot: 8px, filled #E8E6DF.
Centered horizontally, margin-bottom 24px.

---

## Post-Onboarding Nudges (on home dashboard)

After onboarding, first-time users see gentle nudges on the home dashboard
until they complete each action. These are not blocking — just helpful reminders.

**Nudge 1 — Complete company profile:**
Shown if address or tax_id is missing after onboarding.
Small blue info card at top of home screen (below summary row):
```
[ℹ] เพิ่มที่อยู่บริษัทเพื่อให้ PDF แสดงครบถ้วน  [ตั้งค่า →]
```
Dismissible with ✕. Dismissed state stored in localStorage.

**Nudge 2 — Add first customer:**
Shown if customer count = 0.
Same style blue info card:
```
[ℹ] เพิ่มลูกค้าคนแรกเพื่อเริ่มสร้างเอกสาร  [เพิ่มลูกค้า →]
```
Dismissible. Disappears automatically when first customer is added.

**Nudge 3 — Add more items:**
Shown if item count < 3 and user has been active for more than 1 day.
Same style, lower priority:
```
[ℹ] เพิ่มสินค้าหรือบริการในแค็ตตาล็อกเพื่อสร้างเอกสารได้เร็วขึ้น  [เพิ่ม →]
```
Dismissible. Show max once.

**Show at most 1 nudge at a time** — priority order: profile → customer → items.

---

## Admin Creating a New Client Account

When admin creates a new client account from the admin panel, the client receives
an email from Supabase Auth with a "Set password" link. On first login:

1. Client sets their password via Supabase Auth password reset flow
2. After password set → redirected to /setup
3. Onboarding flow runs as normal

Admin pre-fills the client's email when creating the account. That's all.
Admin does NOT set up the client's company profile — the client does it themselves.

---

## Component Breakdown

| Component | Props |
|---|---|
| `OnboardingPage` | — |
| `OnboardingStep1` | onComplete |
| `OnboardingStep2` | onComplete, onSkip |
| `OnboardingStep3` | companyName, itemAdded, onNavigate |
| `VATChoiceCards` | value, onChange |
| `OnboardingProgressDots` | currentStep, totalSteps |
| `HomeNudgeBanner` | type, onDismiss, onAction |

---

## What This Does NOT Do

- Does not force completion of all steps — step 2 and 3 are skippable
- Does not re-show onboarding after company name is saved
- Does not collect payment or billing info
- Does not send a welcome email — Supabase handles the invite email
- Does not show a product tour or tooltips overlay
