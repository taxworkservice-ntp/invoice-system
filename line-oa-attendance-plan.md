# LINE OA Clock-In/Out — HumanSoft Research & Adaptation Plan

> Status: PLAN ONLY — no code implemented. Read this before building anything.
> Decisions locked: shared OA · GPS + QR · raw in/out hours (no shift engine in phase 1).

## 1. How HumanSoft uses LINE OA (from humansoft.co.th docs)

- **One shared OA** `@app.humansoft` for all client companies, with a LIFF web app
  inside the chat (Rich Menu: clock-in, login, docs, slips). Same account works on
  Web / Mobile App / LINE OA.
- **First-time link:** add friend → `Login Account` → `Allow` → enter **Domain +
  company + username (= employee code) + password (first login = 13-digit national
  ID, forced change)**. Binds LINE `userId` → employee record.
- **Only 2 punch methods on LINE OA** (face/liveness, Wi-Fi, Beacon, Kiosk are
  app/hardware only):
  1. **GPS** — menu → `Get Location` → punch → `ยืนยัน` → `ตกลง`.
  2. **QR** — menu → `QR Code` → scan site poster → `ยืนยัน`.
- **Anti-fraud:** Admin defines **workplaces** (name, lat/long, radius e.g. 50–100 m,
  allowed days, target group; only one `Everywhere` entry). Punch rejected outside
  radius/group/day. **Server timestamp** — employee cannot set time. Requires phone
  GPS + LINE location/camera permission.
- **Flow:** punch → time ledger (method/date/time/place visible to HR) → shift plan
  (6 shift types incl. overnight) + late/early/OT rules → **auto into payroll**
  (no OT re-keying). Fixes via HR `ปรับปรุงเวลาการทำงาน` with edit log. LINE also
  pushes news + doc-approval status.

Sources: `/th/features/attendant`, `/th/features/time-attendant`,
`/th/features/workforce`, docs `check-in-out-via-line-oa`, `checkin-by-line-oa`,
`using-line-oa`, `employee-manual`, `workplace-configuration`.

## 2. What we already have (no duplication)

- `payroll_attendance_imports` table (migration `20260912000000` — applied).
- Pure engine: `parseAttendanceCsv`, `summarizeAttendance`, `summaryToPayrollInput`
  (`src/lib/payroll/attendance.ts`) + `AttendancePanel` CSV import → line items.
- API pattern: single catch-all lambda (`api/index.js` → `server/routes.js` static
  table); Vercel rewrites `/api/:path*`, plus cron support.
- Missing: any LINE plumbing, workplaces/QR tables, punch-pairing, LIFF page.

## 3. Adaptation design (fits our accountant-portal niche)

LINE is a **punch collector**; payroll stays the calculator. No face, no beacons,
no shift engine in phase 1.

### New data (all `user_id`-scoped, RLS like existing payroll tables)

| Table | Purpose | Key columns |
|---|---|---|
| `line_links` | LINE user ↔ employee binding | `user_id, line_user_id (unique), employee_id, linked_at` |
| `workplaces` | geofence set per client | `user_id, name, lat, lng, radius_m, days int[], target (jsonb: all|dept|list)` |
| `qr_tokens` | printable site QR codes | `workplace_id, token (unique), active` |
| (reuse) `payroll_attendance_imports` | punch ledger | + `source ('line_gps'\|'line_qr'\|'manual')`, `note` = method/place |

### New API routes (extend `server/routes.js` statically)

- `POST line/webhook` — verify LINE signature, handle follow/message/postback.
- `POST line/clock-in` — body `{ lineUserId, method: gps|qr, lat?, lng?, qrToken? }`;
  checks: link exists → workplace gate (haversine ≤ radius, day/group) → server
  timestamp → insert punch row. Returns accept/reject reason in Thai.
- `GET workplaces` / `POST workplaces` — HR CRUD (owner/manager only).

### Pairing (pure, in `lib/payroll/attendance.ts`, unit-tested)

- `pairPunches(punches): AttendanceDay[]` — first punch of day = in, last = out,
  `hours = out − in`; single unpaired punch = `present, hours: null` (HR fixes via
  Manual). Feeds existing `summarizeAttendance` → `summaryToPayrollInput` →
  AttendancePanel apply. **No payroll formula changes.**

### LIFF/client surface

- Minimal LIFF page: linked employee context → two buttons (GPS punch / QR scan) →
  result message. Punch history list (read from imports).
- HR: workplaces CRUD + QR poster print view; review punches inside existing
  AttendancePanel (no new payroll page).

## 4. Phase plan

- **Phase 1:** LINE link + GPS/QR punch → imports ledger + pairing lib + tests.
- **Phase 2 (only after 1 lands):** fix-request flow (`ลืมลงเวลา`), HR approve via
  audit log, LINE push on finalize (`สลิปพร้อมแล้ว`), poster print polish.
- **Out of scope:** face liveness, Wi-Fi/Beacon, Kiosk, 6 shift types, late/early
  auto-flags, per-client OA branding, leave/OT approvals via LINE.

## 5. Costs & risks (confirm before build)

- LINE Messaging API volume fees + LIFF/Login channel setup per environment.
- GPS spoofing is only mitigated (radius + server time), same as HumanSoft.
- PDPA: location is sensitive — consent on link, store place name + timestamp,
  drop raw lat/long after check (or disclose retention period).
- QR posters must rotate if leaked (token revoke endpoint).

## 6. Build entry checklist

1. Create LINE Login + Messaging API channels; store secrets in env (never commit).
2. Migrations for `line_links`, `workplaces`, `qr_tokens` (+ `source` on imports).
3. `pairPunches` + tests → routes → LIFF page → AttendancePanel review wiring.
4. E2E: link → GPS punch in/out → QR punch → reject outside radius → payroll apply.
