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
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["12px", "18px"],
        sm: ["14px", "20px"],
        base: ["16px", "24px"],
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};