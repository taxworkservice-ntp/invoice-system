## Context — Read Before Writing Any Code

You are adding a **payroll feature** to an existing multi-tenant client portal called **Taxwork**, which currently handles invoice/document collection for accounting clients.

Before writing any code:

1. Look at how the existing invoice module in this codebase is structured — folder layout, routing, data model, and how multi-tenant data isolation is enforced per client.
2. Look at the existing UI components and styling already used in the app (tables, buttons, badges, status indicators) and reuse them as-is.
3. Match whatever tools, libraries, and architectural patterns are already in use in this project. Do not introduce a new framework, database, styling approach, or component library — extend what's already here.

The goal is for payroll to feel like a natural extension of the existing app, not a bolted-on separate tool.

---

## Scope — Exactly 2 Pages

Do not build more than 2 pages. Do not add navigation sub-sections, settings pages, or dashboards beyond what is listed here.

### Page 1: Employees

A table-based master data page (not cards, not a wizard).

**Fields (columns):**
| Field | Type | Notes |
|---|---|---|
| Employee code | text | unique per client |
| Full name | text | |
| Thai national ID / tax ID | text | |
| Position | text | |
| Department | text | optional, can be blank |
| Salary type | enum: `monthly` / `daily` | |
| Base salary / daily rate | number | THB |
| Bank account | text | reference only, no auto-pay in phase 1 |
| Start date | date | |
| Status | enum: `active` / `inactive` | |
| End date | date | nullable, only set when status = inactive |

**UX requirements:**
- Inline editable cells (click to edit, no modal dialogs).
- Visible default columns limited to ~5 (name, position, salary type, base salary, status). Put ID/bank account behind an expandable row or edit drawer.
- Add/remove employee rows directly in the table.

---

### Page 2: Payroll

A **single page** representing one table with **three states** — do not split this into separate Run / Report / Payslip pages.

**State 1 — Draft (input)**
- Select pay period (month/year) and pay date at the top of the page.
- Table shows one row per active employee for that period.
- Per row, an expandable "+" control (not always-visible columns) reveals:
  - Days worked / absent (if salary type = daily)
  - OT entries: OT hours + OT type (Normal / Holiday) + OT rate multiplier (see OT Calculation Rules below; multiple OT entries per employee per period should be supported, e.g. some hours at normal rate and some at holiday rate)
  - Additions (free text label + amount) — bonus, allowance, etc.
  - Deductions (free text label + amount) — advance, other
- A "Draft" status badge shown at the top of the page.

**State 2 — Finalized (report)**
- Same table, now read-only, showing calculated columns:
  - Gross pay
  - SSO (employee, 5%)
  - SSO (employer, 5%) — shown for reference, does not subtract from net
  - Withholding tax (PND1)
  - Other deductions
  - **Net pay** (bold, right-aligned — this is the primary number)
- Totals row pinned at the bottom of the table (sum of each numeric column).
- Status badge changes to "Finalized" and the page becomes locked from further edits (require an explicit "Reopen" action to go back to Draft).

**State 3 — Payslip (print action)**
- A "Print Payslip" icon/button on each row.
- Clicking it renders that single employee's row as a printable/exportable slip — not a separate app page/route.
- Payslip layout: company/client header → employee info block → two-column breakdown (earnings | deductions) → bold net pay at the bottom.

---

## Calculation Rules (Phase 1 — Thailand)

Keep this calculation logic isolated from the UI code so it can be tested and adjusted independently.

- **Gross pay** = base salary (or daily rate × days worked) + allowances + OT pay
- **Social Security (SSO):**
  - 5% employee contribution, 5% employer contribution
  - Wage ceiling: **17,500 THB** (effective Jan 1, 2026) — confirm this figure against the latest SSO announcement before shipping, as ceiling increases are scheduled for 2029 and 2032
  - Maximum monthly contribution: 875 THB per party at current ceiling
- **Withholding tax (PND1):** progressive Thai personal income tax table, applied to annualized income, with standard personal deductions
- **Net pay** = Gross pay − SSO (employee) − Withholding tax − Other deductions

### OT Calculation Rules (customizable rate)

- **Hourly rate** = base salary ÷ 30 ÷ 8 (standard convention; make the divisor configurable per client in case a client uses working-days-in-month instead of a flat 30)
- **OT pay per entry** = hourly rate × OT hours × OT rate multiplier
- **Default multipliers** (Thai Labor Protection Act baseline, used as pre-filled defaults only):
  - Normal workday OT: 1.5×
  - Holiday OT (beyond normal hours): 3×
- **Customization requirement:** the OT rate multiplier must be **editable per client** (some clients may have different contractual OT rates) and **overridable per individual OT entry** at the time of input, in case of a one-off exception. Store the client-level default multiplier as a setting tied to the client/employer record, and let each OT entry in a payroll run optionally override it.
- Each employee's total OT pay for a period = sum of (hours × rate × multiplier) across all their OT entries for that period, and this total feeds into Gross pay.

**Employee status handling:**
- Employees with `status = inactive` and an end date **before** the selected pay period are excluded from that payroll run automatically.
- Employees who leave **mid-period**: do not auto-calculate — allow manual entry of "days worked" in that period so the existing daily-rate pro-ration logic applies naturally. Do not build a separate termination/severance calculator.

---

## Data Requirements

Whatever data layer this project already uses, extend it with data for:

- **Employees** — one record per staff member, per client, holding all the Employees page fields above, with the same tenant-isolation rule already applied to invoice data.
- **Payroll runs** — one record per client per pay period, tracking period, pay date, and draft/finalized status.
- **Payroll line items** — one record per employee per run, holding days worked, OT entries (hours, type, multiplier used), additions, deductions, and the calculated gross/SSO/WHT/net figures.
- **Client payroll settings** — per-client defaults for the OT hourly-rate divisor and the normal/holiday OT multipliers, editable by the client's account owner.

Enforce the same per-client data isolation rule already used for invoices — a client must never be able to see or query another client's employees or payroll data.

---

## Explicitly Out of Scope for Phase 1 — Do Not Build

- Leave tracking (annual/sick leave balances)
- Severance / termination pay calculators
- Bonus or 13th-month pay automation
- Government e-filing file generation or submission (PND1, SSO electronic formats) — deferred to a later phase
- Any additional pages beyond the 2 defined above
- New design system, component library, or visual style diverging from the existing invoice module

---

## Deliverable

- Two pages (Employees, Payroll) integrated into the existing Taxwork navigation, using the existing auth/tenant context.
- Data model additions for employees, payroll runs, payroll line items, and client payroll settings, following the existing project's conventions and tenant-isolation approach.
- Calculation logic for gross pay, SSO, WHT, and OT kept separate from UI components so it can be tested independently.
- Client-level payroll settings (OT divisor, default multipliers) editable somewhere reasonable within existing client settings — do not build a new dedicated settings page for this alone.
