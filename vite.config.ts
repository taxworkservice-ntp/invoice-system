import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "https://invoice-system.vercel.app",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("jspdf")) return "pdf";
          if (id.includes("react-router-dom")) return "router";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react") || id.includes("react-dom")) return "react-vendor";
        },
      },
    },
  },
});
