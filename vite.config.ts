import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  esbuild: {
    target: "safari15",
  },
  resolve: {
    alias: {
      "@": "/src",
    },
    preserveSymlinks: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
  build: {
    target: ["es2020", "safari15"],
    modulePreload: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("exceljs")) return "excel-export";
            if (id.includes("jspdf")) return "pdf";
            if (id.includes("html2canvas")) return "html-render";
            if (id.includes("jszip")) return "zip";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("react-router-dom")) return "router";
            if (id.includes("react-dom") || id.includes("react")) return "react-vendor";
            return "vendor";
          }
        },
      },
    },
  },
});
