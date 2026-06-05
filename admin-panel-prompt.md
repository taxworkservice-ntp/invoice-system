# Admin Panel — Standalone Build Prompt

> Self-contained prompt for building the Admin Panel.
> Read the Master Build Prompt for system-wide context (auth, schema, design tokens).
> This covers: client list, client detail, create client, and admin impersonation.
> Admin panel is completely separate from the client-facing app.

---

## What This Is

A simple management interface for the system owner (admin) to oversee all client
accounts, create new ones, and assist clients when they are stuck. The admin panel
is read-only for all client data — admin never edits documents or catalog items
on behalf of clients.

---

## Routes

```
/admin                          ← redirect to /admin/clients
/admin/clients                  ← client list
/admin/clients/:userId          ← client detail
/admin/clients/new              ← create new client
```

All /admin/* routes are protected — redirect to /login if not admin role.

```typescript
// Route guard
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', currentUserId)
  .single()

if (profile?.role !== 'admin') {
  navigate('/home')
}
```

---

## Admin Layout

Different shell from client app. No bottom nav. Side nav on desktop, top nav on mobile.

**Top bar (all admin pages):**
```
[⚙ Admin]     ลูกค้า     [ออกจากระบบ admin]
```

- "Admin" label with gear icon — 14px, weight 600, #1A1A18
- "ลูกค้า" nav link — navigates to /admin/clients
- "ออกจากระบบ admin" — logs out, navigates to /login
- bg white, border-bottom 0.5px #E8E6DF

**When impersonating a client — top bar changes completely:**
```
[← หยุดดูในฐานะลูกค้า]     กำลังดูในฐานะ: [client name]
```
- Full-width amber banner: bg #FAEEDA, text #633806
- "← หยุดดูในฐานะลูกค้า" — tappable, returns to admin panel
- This banner must always be visible when impersonating — never hidden

---

## Page 1 — Client List (/admin/clients)

### Data Required

```typescript
const clients = await supabase
  .from('client_profiles')
  .select(`
    *,
    profiles!inner(id, created_at),
    customers(count),
    documents(count)
  `)
  .order('created_at', { ascending: false })
```

Note: use service role key for admin queries — RLS would block cross-client reads.
Admin API calls must use the Supabase service role key stored in environment variables.
Never expose the service role key to the client — admin queries must go through
a Vercel serverless function or Supabase Edge Function.

### Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  PAGE HEADER + ADD BUTTON   │
│  SEARCH BAR                 │
│  CLIENT LIST                │
│  client row                 │
│  client row                 │
└─────────────────────────────┘
```

### Page Header

```
ลูกค้าทั้งหมด (N)              [+ เพิ่มลูกค้าใหม่]
```

- Title with count: 18px, weight 700, #1A1A18
- "+ เพิ่มลูกค้าใหม่": bg #378ADD, white, 8px radius
- Tap → navigate to /admin/clients/new

### Search Bar

Placeholder: "ค้นหาชื่อบริษัท หรืออีเมล..."
Searches: company_name_th, company_name_en, email (from auth.users via join).

### Client Row

White card, 0.5px border #E8E6DF, 10px radius, padding 14px 16px.
Tappable → navigate to /admin/clients/:userId.

```
[Company name]                    [Active badge]
[Email]
[สร้างเมื่อ: date] · [N เอกสาร] · [N ลูกค้า]
```

**Company name:** 14px, weight 600, #1A1A18
- If not set yet: "ยังไม่ได้ตั้งค่าบริษัท" in #AAAAAA italic

**Email:** 12px, #888780

**Meta row:** 11px, #AAAAAA
- Created date in Thai Buddhist calendar
- Document count
- Customer count

**Status badge:**
- Active: bg #EAF3DE, text #27500A, "ใช้งานอยู่"
- Inactive: bg #F1EFE8, text #888780, "ปิดการใช้งาน"

**Incomplete profile warning:**
If company_name_th is null — show amber "⚠ ยังไม่ได้ตั้งค่า" pill — 10px.

### Empty State

"ยังไม่มีลูกค้า — กด + เพิ่มลูกค้าใหม่ เพื่อเริ่มต้น" — centered.

---

## Page 2 — Client Detail (/admin/clients/:userId)

### Data Required

```typescript
// Client profile
const profile = await adminSupabase
  .from('client_profiles')
  .select('*')
  .eq('user_id', userId)
  .single()

// Auth user (for email)
const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId)

// Recent documents (last 10)
const documents = await adminSupabase
  .from('documents')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(10)

// Summary counts
const { count: dealCount } = await adminSupabase
  .from('deals')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
```

### Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  CLIENT SUMMARY CARD        │
│  ADMIN ACTIONS CARD         │
│  RECENT DOCUMENTS CARD      │
└─────────────────────────────┘
```

### Top Bar

```
← ลูกค้า     [Company name or email]     [···]
```

**··· menu:**
- "ปิดการใช้งานบัญชี" (Deactivate) — if currently active
- "เปิดใช้งานบัญชี" (Reactivate) — if currently inactive

### Client Summary Card

White card, padding 16px.
Read-only display of client profile info.

```
[Company name TH]
[Company name EN]
อีเมล: xxx@example.com
เลขผู้เสียภาษี: xxx
ที่อยู่: xxx
VAT: จดทะเบียน / ไม่ได้จด
WHT เริ่มต้น: 3%
สร้างบัญชีเมื่อ: [date]
เอกสารทั้งหมด: N
Deal ทั้งหมด: N
```

All read-only. No edit button — admin does not edit client data.
Labels: 11px, #888780. Values: 13px, #1A1A18.

### Admin Actions Card

White card, padding 16px.
**Section label:** "การจัดการ" — 11px, uppercase, #888780

**Three action buttons stacked:**

**1. ดูในฐานะลูกค้า (Impersonate):**
- Style: full width, bg #E6F1FB, text #0C447C, border 0.5px #378ADD, 8px radius
- Tap → sets impersonation state, navigates to /home showing client's data
- Implementation: store target userId in React context / Zustand store
  Apply as filter on all queries: `.eq('user_id', impersonatedUserId)`
  The amber banner in top bar always shows when impersonating

**2. รีเซ็ตรหัสผ่าน (Reset Password):**
- Style: full width, bg white, border 0.5px #E8E6DF, #444441
- Tap → confirmation: "ส่งอีเมลรีเซ็ตรหัสผ่านให้ [email]?"
- On confirm:
  ```typescript
  await adminSupabase.auth.admin.generateLink({
    type: 'recovery',
    email: authUser.email
  })
  // Or use: supabase.auth.resetPasswordForEmail(email)
  ```
- Show toast: "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว ✓"

**3. ปิดการใช้งานบัญชี (Deactivate):**
- Style: full width, bg white, border 0.5px #E8E6DF, text #C0392B
- Tap → confirmation: "ปิดการใช้งานบัญชีของ [company name]? ลูกค้าจะไม่สามารถเข้าสู่ระบบได้"
- On confirm:
  ```typescript
  await adminSupabase.auth.admin.updateUserById(userId, {
    ban_duration: 'none' // or set to permanent ban
  })
  // Update profiles table
  await adminSupabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', userId)
  ```
- Refresh page — status badge changes to inactive
- Button changes to "เปิดใช้งานบัญชี" in green

### Recent Documents Card

White card, padding 16px.
**Section label:** "เอกสารล่าสุด (10 รายการ)" — 11px, uppercase, #888780

Simple list of last 10 documents — read-only.

Each row:
```
[Doc number]     [Doc type]     [Customer]     [Amount]     [Status badge]
INV-2025-007     ใบกำกับภาษี    ร้านมาลี       ฿ 13,375     ชำระแล้ว
```

- 12px text throughout
- Tappable rows: navigate to document detail (admin sees read-only document detail)
- "ดูทั้งหมด →" link at bottom — shows all documents for this client

---

## Page 3 — Create New Client (/admin/clients/new)

### Page Layout

```
┌─────────────────────────────┐
│  TOP BAR                    │
├─────────────────────────────┤
│  CREATE CLIENT FORM         │
│  ACTION BAR                 │
└─────────────────────────────┘
```

### Top Bar

```
← ลูกค้า     เพิ่มลูกค้าใหม่
```

### Create Client Form

White card, padding 16px.

**อีเมล — required:**
```
[input — email keyboard]
```
Placeholder: "อีเมลสำหรับเข้าสู่ระบบ"
Hint: "ลูกค้าจะได้รับอีเมลสำหรับตั้งรหัสผ่าน" — 11px, #888780

**ชื่อบริษัท (เบื้องต้น) — optional:**
```
[input]
```
Placeholder: "ลูกค้าสามารถแก้ไขเองได้ภายหลัง"
If filled — pre-populates company_name_th in client_profiles.
If left blank — client fills in during onboarding.

**หมายเหตุสำหรับ admin — optional:**
```
[textarea]
```
Placeholder: "บันทึกส่วนตัวสำหรับ admin (ลูกค้าไม่เห็น)"
Stored in a separate admin_notes column (add to profiles table if needed)
or simply in a note field — not shown to client anywhere.

### Action Bar

"สร้างบัญชีและส่งอีเมลเชิญ" — full width, blue
On tap → validate email, call Supabase Admin API:

```typescript
// Create auth user and send invite email
const { data: newUser, error } = await adminSupabase
  .auth.admin.createUser({
    email: email,
    email_confirm: false,  // require email confirmation
    user_metadata: { company_name: companyName || '' }
  })

if (error) {
  showToast('สร้างบัญชีไม่สำเร็จ: ' + error.message)
  return
}

// Create profile record
await adminSupabase
  .from('profiles')
  .insert({
    id: newUser.user.id,
    role: 'client'
  })

// Create client_profile if company name provided
if (companyName) {
  await adminSupabase
    .from('client_profiles')
    .insert({
      user_id: newUser.user.id,
      company_name_th: companyName
    })
  // Note: DB trigger creates default doc_number_sequences automatically
}

// Send password setup email
await adminSupabase.auth.admin.generateLink({
  type: 'invite',
  email: email
})
```

On success:
- Show toast: "สร้างบัญชีแล้ว ส่งอีเมลเชิญไปที่ [email] ✓"
- Navigate to /admin/clients/:newUserId

On error (email already exists):
- Show inline error below email field: "อีเมลนี้มีบัญชีอยู่แล้ว"

---

## Impersonation — Full Implementation

When admin taps "ดูในฐานะลูกค้า":

```typescript
// Store in global state (Zustand or React context)
interface AdminState {
  isImpersonating: boolean
  impersonatedUserId: string | null
  impersonatedClientName: string | null
}

// Set impersonation
setImpersonating(true, targetUserId, clientName)

// Navigate to client app
navigate('/home')
```

**All data queries when impersonating:**
Replace `auth.uid()` with `impersonatedUserId` in all queries.
This works because admin bypasses RLS using service role key.

```typescript
// Helper hook used in all data hooks
function useEffectiveUserId(): string {
  const { isImpersonating, impersonatedUserId } = useAdminStore()
  const { user } = useAuth()
  return isImpersonating && impersonatedUserId
    ? impersonatedUserId
    : user.id
}
```

**Amber banner always visible when impersonating:**
Rendered at the app shell level — above all pages.
Cannot be dismissed. Contains client name and "← หยุดดูในฐานะลูกค้า" button.

**Stopping impersonation:**
Tap "← หยุดดูในฐานะลูกค้า" → clears impersonation state, navigates back to
/admin/clients/:impersonatedUserId.

**Impersonation is read-only for financial data:**
Admin can VIEW everything. Admin CAN take actions like marking documents as sent
or paid while impersonating if needed to help a stuck client — but should do so
carefully. There is no separate permission layer for this in v1.

---

## Security Notes

**Service role key:**
All admin API calls that bypass RLS must use the Supabase service role key.
This key must NEVER be exposed to the browser.
Store as `SUPABASE_SERVICE_ROLE_KEY` in Vercel environment variables.
Create Vercel serverless functions at `/api/admin/*` that use this key server-side.

**Admin route protection:**
Every /admin/* page checks profile.role === 'admin' on load.
If not admin → redirect to /home immediately.

**Impersonation audit:**
In v1 there is no audit log for admin actions. This is acceptable for a small
non-commercial tool. Add audit logging in v2 if needed.

---

## Loading States

Static skeleton cards for all data sections.

---

## Component Breakdown

| Component | Props |
|---|---|
| `AdminShell` | children, isImpersonating, impersonatedName |
| `ImpersonationBanner` | clientName, onStop |
| `AdminClientList` | clients, onClientTap, onAdd |
| `AdminClientRow` | client, onTap |
| `AdminClientDetail` | userId |
| `AdminClientSummaryCard` | profile, authUser, counts |
| `AdminActionsCard` | userId, email, isActive, onImpersonate, onReset, onToggleActive |
| `AdminRecentDocuments` | documents |
| `CreateClientForm` | onSuccess |

---

## What Admin Cannot Do

- Cannot edit client documents, catalog, or customer data
- Cannot view client passwords (Supabase never exposes these)
- Cannot transfer data between client accounts
- Cannot bulk export all clients' data in v1
- Cannot view financial reports across all clients in v1
- Cannot set per-client feature flags in v1
