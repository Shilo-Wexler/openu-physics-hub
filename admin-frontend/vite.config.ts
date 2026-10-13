import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // ADMIN_API_URL comes from the environment or from .env; it is not exposed to the browser.
  // Only /api/admin is forwarded: this site is the admin console, the student side is public-frontend.
  const env = loadEnv(mode, ".", "ADMIN_API_URL");
  // 8001 on the host: 8000 belongs to chat-backend, which public-frontend proxies to.
  const target = env.ADMIN_API_URL || "http://localhost:8001";

  return {
    plugins: [react()],
    server: {
      // 5174, so it can run next to public-frontend (5173).
      port: 5174,
      // Fail instead of moving to another port: Google sign-in only accepts registered origins.
      strictPort: true,
      // Dev only: forward API calls to the admin backend, so the browser sees one origin,
      // the same as behind the Ingress in production.
      proxy: {
        "/api/admin": target,
      },
    },
  };
});
