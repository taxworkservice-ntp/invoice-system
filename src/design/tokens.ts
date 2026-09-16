/**
 * Design tokens — the single source of truth for the app's visual language.
 *
 * Authority: `invoice-system-master-prompt.md` §"UI Style" (warm minimalism):
 *   - 13px body, 15px card titles, 11px labels/badges
 *   - cards: white, 0.5px #E8E6DF border, 10px radius
 *   - primary #378ADD, no gradients, no drop shadows
 *
 * `tailwind.config.ts` imports this file, so Tailwind utilities and app code
 * (charts, PDFs, inline styles) can never drift apart. Do not hardcode raw
 * hex/px values in components — use a token.
 */

/**
 * Type scale. Sizes are the *roles* the UI consumes; legacy sizes are kept
 * during migration and will be removed once pages are swept.
 */
export const fontSize = {
  // Canonical roles -----------------------------------------------------------
  label: ["11px", { lineHeight: "16px" }],
  body: ["13px", { lineHeight: "20px" }],
  title: ["15px", { lineHeight: "22px" }],
  subtitle: ["18px", { lineHeight: "26px" }],
  display: ["20px", { lineHeight: "28px" }],
  page: ["24px", { lineHeight: "32px" }],
  /** Large stat numbers (dashboard KPIs). */
  hero: ["30px", { lineHeight: "36px" }],
} as const;

/** Warm neutral text ramp — the ONLY neutral for UI text and chrome. */
export const ink = {
  50: "#F2F0EB",
  100: "#C4BFB6",
  200: "#A8A39B",
  300: "#888780",
  400: "#7B766E",
  500: "#6F6A61",
  600: "#5F5A52",
  700: "#444441",
  800: "#1F1F1D",
  900: "#1A1A18",
} as const;

/** Border scale. `line` is the 0.5px card border from the spec. */
export const line = {
  DEFAULT: "#E8E6DF",
  soft: "#E7E5DE",
  faint: "#F0ECE5",
  strong: "#E5E1D9",
} as const;

/** Surface / paper fills. */
export const paper = {
  DEFAULT: "#FFFFFF",
  soft: "#FAF8F3",
  field: "#FAFAF7",
  warm: "#F6F2EA",
  warm2: "#F5F1E8",
  glow: "#FFFDF8",
  tint: "#FCFBF8",
} as const;

/** Document status colors — must match the spec table exactly. */
export const status = {
  draft: { bg: "#F1EFE8", text: "#444441" },
  sent: { bg: "#E6F1FB", text: "#0C447C" },
  paid: { bg: "#EAF3DE", text: "#27500A" },
  overdue: { bg: "#FCEBEB", text: "#791F1F" },
  pending: { bg: "#FAEEDA", text: "#633806" },
  voided: { bg: "#F1EFE8", text: "#888780" },
} as const;

/**
 * Radius scale. Two shapes only:
 *   - `card` 10px — cards, sections, modals, panels (spec)
 *   - `rounded-control` 8px — controls (buttons, inputs, menu items), the Tailwind
 *     default, aliased here so the intent is explicit
 *   - `rounded-full` — pills, badges, avatars
 */
export const radius = {
  card: "10px",
  control: "8px",
} as const;

/**
 * Elevation. The spec forbids shadows on static surfaces; only true overlays
 * (modal, drawer, dropdown, toast, sticky bars) may float.
 */
export const boxShadow = {
  none: "none",
  overlay: "0 10px 30px rgba(26, 26, 24, 0.12)",
} as const;

export const colors = {
  "page-bg": "#F7F6F3",
  "card-border": "#E8E6DF",
  primary: "#378ADD",
  error: "#EF4444",

  "draft-bg": status.draft.bg,
  "draft-text": status.draft.text,
  "sent-bg": status.sent.bg,
  "sent-text": status.sent.text,
  "paid-bg": status.paid.bg,
  "paid-text": status.paid.text,
  "overdue-bg": status.overdue.bg,
  "overdue-text": status.overdue.text,
  "pending-bg": status.pending.bg,
  "pending-text": status.pending.text,
  "voided-bg": status.voided.bg,
  "voided-text": status.voided.text,

  ink,
  line,
  paper,

  "primary-soft": "#EAF4FF",
  "primary-deep": "#0C447C",
  "primary-border": "#B8D7F4",

  success: {
    DEFAULT: "#22C55E",
    soft: "#F1FAF4",
    text: "#1E5A38",
    border: "#CFE7D8",
  },
  warning: {
    DEFAULT: "#F59E0B",
    soft: "#FFF8EA",
    text: "#7A4A00",
    border: "#E6C776",
  },
  danger: {
    DEFAULT: "#C0392B",
    soft: "#FCEBEB",
    text: "#791F1F",
    border: "#F2D4D4",
    strong: "#D14343",
  },

  "accent-teal": "#0F9AA8",
} as const;

export const fontFamily = {
  sans: ["Inter", "system-ui", "sans-serif"],
} as const;

/** Page content widths — two shapes only: data pages and forms. */
export const contentWidth = {
  page: "max-w-screen-2xl",
  form: "max-w-4xl",
} as const;
