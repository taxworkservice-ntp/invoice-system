/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "page-bg": "#F7F6F3",
        "card-border": "#E8E6DF",
        primary: "#378ADD",
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        "draft-bg": "#F1EFE8",
        "draft-text": "#444441",
        "sent-bg": "#E6F1FB",
        "sent-text": "#0C447C",
        "paid-bg": "#DCFCE7",
        "paid-text": "#15803D",
        "overdue-bg": "#FCEBEB",
        "overdue-text": "#791F1F",
        "pending-bg": "#FAEEDA",
        "pending-text": "#633806",
        "voided-bg": "#F1EFE8",
        "voided-text": "#888780",

        // Warm neutral text scale (was #1A1A18 / #444441 / ... hex literals)
        ink: {
          100: "#C4BFB6",
          200: "#A8A39B",
          300: "#888780",
          400: "#7B766E",
          500: "#6F6A61",
          600: "#5F5A52",
          700: "#444441",
          800: "#1F1F1D",
          900: "#1A1A18",
        },

        // Cool slate scale (table + form borders, secondary text)
        cool: {
          25: "#F8FAFC",
          50: "#F4F7FB",
          75: "#EEF2F6",
          100: "#E6EBF2",
          200: "#D7DEE7",
          300: "#C9D5E3",
          400: "#667085",
          500: "#475467",
          900: "#111827",
        },

        // Paper / section fills
        paper: {
          DEFAULT: "#FFFFFF",
          soft: "#FAF8F3",
          field: "#FAFAF7",
          warm: "#F6F2EA",
          warm2: "#F5F1E8",
          glow: "#FFFDF8",
          tint: "#FCFBF8",
        },

        // Border scale (was #E8E6DF / #E7E5DE / #F0ECE5 / #E5E1D9)
        line: {
          DEFAULT: "#E8E6DF",
          soft: "#E7E5DE",
          faint: "#F0ECE5",
          strong: "#E5E1D9",
        },

        "primary-soft": "#EAF4FF",
        "primary-deep": "#0C447C",
        "primary-border": "#B8D7F4",

        danger: {
          DEFAULT: "#C0392B",
          soft: "#FCEBEB",
          text: "#791F1F",
          border: "#F2D4D4",
          strong: "#D14343",
        },

        success: {
          soft: "#F1FAF4",
          text: "#1E5A38",
          border: "#CFE7D8",
        },

        warning: {
          soft: "#FFF8EA",
          text: "#7A4A00",
          border: "#E6C776",
        },

        "accent-teal": "#0F9AA8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "3xs": ["9px", "12px"],
        "2xs": ["10px", "14px"],
        xs: ["12px", "18px"],
        sm: ["14px", "20px"],
        base: ["16px", "24px"],
      },
      borderRadius: {
        card: "12px",
        soft: "18px",
        sheet: "22px",
        hero: "26px",
      },
    },
  },
  plugins: [],
};
