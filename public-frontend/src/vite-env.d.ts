/// <reference types="vite/client" />

// The VITE_* variables the site reads, only under `npm run dev` (from .env). The image is built
// without them: there the same settings come from /config.js at runtime (src/shared/lib/config.ts).
// Only keys meant for the browser go here, never a secret.
interface ImportMetaEnv {
  // Google sign-in for the chat (OAuth client ID, public by design).
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // Cloudflare Turnstile site key for the inquiry form. Locally: the test key 1x00000000000000000000AA.
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}