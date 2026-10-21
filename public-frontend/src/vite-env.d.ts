/// <reference types="vite/client" />

// The VITE_* variables the site reads. Vite puts them into the build, so they are public by design:
// only keys meant for the browser go here, never a secret.
interface ImportMetaEnv {
  // Google sign-in for the chat (OAuth client ID, public by design).
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // Cloudflare Turnstile site key for the inquiry form. Locally: the test key 1x00000000000000000000AA.
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}