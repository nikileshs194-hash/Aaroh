import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8080", "/v1": "http://127.0.0.1:8080" },
  },
  build: {
    outDir: "dist",
    target: "es2018",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: { charts: ["recharts"], qr: ["qrcode"] },
      },
    },
  },
});
