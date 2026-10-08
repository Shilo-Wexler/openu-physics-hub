import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail instead of silently moving to another port: Google sign-in only
    // accepts the origins registered in Google Cloud Console.
    strictPort: true,
    // Dev only: forward API calls to the backends running locally, so the
    // browser sees one origin, the same as behind the Ingress in production.
    proxy: {
      "/api/chat": "http://localhost:8000",
    },
  },
});