# Design System

The single visual language for the app. Everything here derives from
`invoice-system-master-prompt.md` §"UI Style" (warm minimalism) and is encoded
once in **`src/design/tokens.ts`**, which `tailwind.config.ts` imports.

> Rule of thumb: **components consume roles, pages consume components, nobody
> hardcodes sizes or hex values.** If a value isn't a token, add a token.

## 1. Type scale

Roles, not sizes. Use the role that matches the content's job.

| Token | Size / line | Use for |
|---|---|---|
| `text-label` | 11 / 16 | form labels, badges, table headers, helper text, meta |
| `text-body` | 13 / 20 | body copy, table cells, inputs, buttons (`md`) |
| `text-title` | 15 / 22 | card, section and modal titles |
| `text-subtitle` | 18 / 26 | page subtitles, large section headers |
| `text-display` | 20 / 28 | emphasized headings |
| `text-page` | 24 / 32 | page titles |
| `text-hero` | 30 / 36 | dashboard KPI numbers |

**Rules**

- Headings are `font-semibold`. `font-bold` is not used anywhere.
- Labels/helper text are `font-medium`.
- **No uppercase and no letter-spacing on Thai labels** — uppercase is a no-op
  for Thai and tracking reads wrong. Labels rely on weight + colour.
- Never write `text-[13px]` or `text-xs`/`text-sm`. Those scales are removed.
- Body copy is 13px (the base `body` size in `src/index.css`).

## 2. Colour

### Neutral text ramp — `ink` only
`ink-900` (primary text) → `ink-700` → `ink-600` → `ink-500` → `ink-400`
(secondary/muted) → `ink-300` (disabled/placeholder) → `ink-100`/`ink-50` (fills).

`gray-*`, `stone-*`, `slate-*` and `cool-*` are **retired for UI**. Never use them.

### Surfaces
- Page: `bg-page-bg`
- Card: `bg-white` + `border-[0.5px] border-card-border`
- Field / subtle fill: `bg-paper-field`
- Hairlines: `line`, `line-faint`, `line-soft`, `line-strong`

### Semantic colours (only when the meaning is real)
- `primary` / `primary-soft` / `primary-deep` / `primary-border`
- `success` / `success-soft` / `success-text` / `success-border`
- `warning` / `warning-soft` / `warning-text` / `warning-border`
- `danger` / `danger-soft` / `danger-text` / `danger-strong` / `danger-border`
- `accent-teal`

### Document status (from the master prompt, do not drift)
| Status | Background | Text |
|---|---|---|
| Draft / Voided | `draft-bg` `#F1EFE8` | `draft-text` `#444441` / `voided-text` `#888780` |
| Sent / In billing | `sent-bg` `#E6F1FB` | `sent-text` `#0C447C` |
| Paid / Generated | `paid-bg` `#EAF3DE` | `paid-text` `#27500A` |
| Overdue | `overdue-bg` `#FCEBEB` | `overdue-text` `#791F1F` |
| Pending / Quote | `pending-bg` `#FAEEDA` | `pending-text` `#633806` |

Use `StatusBadge` / `Badge` — never hand-roll a status pill.

## 3. Radius

Two shapes, plus pills.

| Token | Value | Use for |
|---|---|---|
| `rounded-card` | 10px | cards, sections, modals, panels, drawers |
| `rounded-control` | 8px | buttons, inputs, selects, menu items, view toggles |
| `rounded-full` | — | badges, status pills, avatars, switches |

`rounded-xl`, `rounded-2xl`, `rounded-sheet`, `rounded-hero` and arbitrary
radii are retired.

## 4. Elevation

**Surfaces are flat.** The spec forbids drop shadows; the default Tailwind
shadow scale is removed from the theme so `shadow-sm/md/lg/xl/2xl` no longer
exist.

Only true overlays float, via the single `shadow-overlay` token:
modal, drawer, dropdown/menu, toast, autocomplete popover, sticky action bar.
Everything else separates with a border.

## 5. Components

Prefer a component over a hand-built equivalent.

| Component | Notes |
|---|---|
| `Button` | `size="sm"` = label, `size="md"` = body. `tone` for semantic colours. |
| `Input` / `Select` / `DateInput` | label = `text-label text-ink-600`, field = `text-body` |
| `Card` / `SectionCard` | 0.5px border, `rounded-card`, flat |
| `SettingRow` | label + description on the left, control on the right |
| `Modal` | overlay elevation, `text-title` header |
| `Toast` | overlay elevation, `text-body` |
| `Badge` / `StatusBadge` | status pills |
| `Money` / `AmountRow` | money is always `tabular-nums` |
| `TABLE` (`src/lib/tableStyles.ts`) | one table style: body cells 13px, headers 11px |

## 6. Spacing

- Card padding: `p-4` (16px) / `p-5` (20px)
- Gaps between elements: `gap-2` (8px) / `gap-3` (12px)
- Page content width: `max-w-page` (data pages) or `max-w-4xl` (forms)

## 7. Print layer is exempt

`src/components/print/**` and any `**/print.tsx` are a separate, pt-based type
system driven by CSS variables. They are excluded from the UI scale, from the
lint rules, and their geometry is frozen (`--print-font-size`,
`--print-line-height`) so UI type changes can never move print output.

## 8. Enforcement

- `npm run lint:design` — `scripts/check-design-system.mjs` fails the build on
  arbitrary px sizes, arbitrary hex colours, retired neutrals, retired shadows,
  retired type sizes and `font-bold`.
- `npm run lint` — ESLint (TypeScript + React hooks) **plus** the design check.
- `npm run test:ui-snapshots` — Playwright visual baselines for key pages.

Do not add an exception to the checker to land a page. Add a token instead.
