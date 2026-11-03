import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // Vite puts small files (under 4KB) inside the JavaScript. Never the avatars: every visitor
    // would download them on the first load, even without opening the chat or the profile.
    // As files they are fetched only where shown, and cached for a year.
    assetsInlineLimit: (filePath) => (filePath.includes("/assets/avatars/") ? false : undefined),
  },
  server: {
    port: 5173,
    // Fail instead of silently moving to another port: Google sign-in only
    // accepts the origins registered in Google Cloud Console.
    strictPort: true,
    // Dev only: the Cloudflare tunnel name used for testing on a phone.
    // Vite rejects any other Host header (protection against DNS rebinding).
    allowedHosts: ["dev.openuvoice.com"],
    // Dev only: forward API calls to the backends running locally, so the
    // browser sees one origin, the same as behind the Ingress in production.
    proxy: {
      "/api/chat": "http://localhost:8000",
      // admin-backend: the only two routes the public site uses.
      "/api/inquiries": "http://localhost:8001",
      "/api/announcements": "http://localhost:8001",
    },
  },
});