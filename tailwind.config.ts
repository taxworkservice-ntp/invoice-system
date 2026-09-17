import {
  boxShadow,
  colors,
  contentWidth,
  fontFamily,
  fontSize,
  radius,
  screens,
} from "./src/design/tokens";

/**
 * Tailwind consumes the design tokens (`src/design/tokens.ts`) so utilities and
 * app code share one source of truth.
 *
 * Note: `boxShadow` is declared on `theme` (not `extend`) on purpose — the spec
 * forbids shadows on static surfaces, so the default shadow scale is removed.
 * Overlays use the single `shadow-overlay` token.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    boxShadow,
    extend: {
      colors,
      fontFamily,
      fontSize,
      borderRadius: {
        card: radius.card,
        control: radius.control,
      },
      maxWidth: {
        page: contentWidth.page,
        form: contentWidth.form,
        row: contentWidth.row,
      },
      screens,
    },
  },
  plugins: [],
};
