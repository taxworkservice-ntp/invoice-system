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
| `text-label` | 12 / 18 | form labels, badges, table headers, helper text, meta |
| `text-body` | 14 / 22 | body copy, table cells, inputs, buttons (`md`) |
| `text-title` | 17 / 24 | card, section and modal titles |
| `text-subtitle` | 20 / 29 | page subtitles, large section headers |
| `text-display` | 22 / 31 | emphasized headings |
| `text-page` | 26 / 35 | page titles |
| `text-hero` | 33 / 40 | dashboard KPI numbers |

**Rules**

- Headings are `font-semibold`. `font-bold` is not used anywhere.
- Labels/helper text are `font-medium`.
- **No uppercase and no letter-spacing on Thai labels** — uppercase is a no-op
  for Thai and tracking reads wrong. Labels rely on weight + colour.
- Never write `text-[14px]` or `text-xs`/`text-sm`. Those scales are removed.
- Body copy is 14px (the base `body` size in `src/index.css`).

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
| `TABLE` (`src/lib/tableStyles.ts`) | one table style: body cells 14px, headers 12px |

## 6. Spacing and content width

- Card padding: `p-4` (16px) / `p-5` (20px)
- Gaps between elements: `gap-2` (8px) / `gap-3` (12px)

**The shell owns width.** Pages never set their own container — `AppShell`
takes a content profile and applies it to the top bar, breadcrumbs and content,
so they can never disagree.

| Profile             | Token          | Width             | Use for                          |
| ------------------- | -------------- | ----------------- | -------------------------------- |
| `data` (default)  | `max-w-page` | fluid, cap 2048   | list, detail and report pages    |
| `form`            | `max-w-form` | 896, fixed        | settings and simple create/edit forms |

Data pages are **fluid**: on laptops and 1920 desktops the cap never binds, so
tables get the full width beside the sidebar. It engages only on ultrawide/4K,
where an unbounded row hurts readability. Form pages are capped because long
label/control rows stop being readable when stretched.

**Rows inside a page.** Monitor width must arrive as more content, never as
stretched content:

| Row kind                                               | Rule                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Fixed item count (KPI cards, stat strips, filter bars) | cap with `max-w-row` (1280) — they never gain items, so stretching only yields sparse 500px cards |
| Item count can grow (card lists, preset grids)         | add a `3xl:` (1792px) column step to the grid                                                      |
| Tables                                                 | fill the container; never cap, never add columns                                                     |

Do not reintroduce `max-w-7xl` / `max-w-screen-2xl` containers, and do not use
`max-w-page` / `max-w-form` outside `AppShell` — `lint:design` fails on both.

## 7. Print layer is exempt

`src/components/print/**` and any `**/print.tsx` are a separate, pt-based type
system driven by CSS variables. They are excluded from the UI scale, from the
lint rules, and their geometry is frozen (`--print-font-size`,
`--print-line-height`) so UI type changes can never move print output.

## 8. Enforcement

- `npm run lint:design` — `scripts/check-design-system.mjs` fails the build on
  arbitrary px sizes, arbitrary hex colours, retired neutrals, retired shadows,
  retired type sizes, `font-bold`, retired page containers
  (`max-w-7xl` / `max-w-screen-2xl`) and per-page container widths
  (`max-w-page` / `max-w-form` outside the shell).
- `npm run lint` — ESLint (TypeScript + React hooks) **plus** the design check.
- `npm run test:ui-snapshots` — Playwright visual baselines for key pages, at
  1280px (`visual`) and 1920px (`visual-wide`). Width changes are invisible at
  1280, so the wide project is what actually guards the container.

Do not add an exception to the checker to land a page. Add a token instead.
