import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev, requests to /api/* are forwarded to the local backend
      // so you don't need to deal with CORS while working locally.
      "/api": "http://localhost:8787",
    },
  },
});
