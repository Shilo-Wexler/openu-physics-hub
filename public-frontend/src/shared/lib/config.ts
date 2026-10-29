/**
 * Public settings that differ per environment: the Google client ID and the Turnstile site key.
 * In the container they come from /config.js, which is written from env vars when nginx starts
 * (docker/config.sh), so one image serves staging and production alike. Under `npm run dev`
 * /config.js is an empty placeholder and the VITE_* values from .env are used instead.
 * Both are public by design: the browser sees them anyway.
 */

interface RuntimeConfig {
  googleClientId?: string;
  turnstileSiteKey?: string;
}

declare global {
  interface Window {
    __OPENUVOICE_CONFIG__?: RuntimeConfig;
  }
}

const runtime = window.__OPENUVOICE_CONFIG__ ?? {};

export const GOOGLE_CLIENT_ID: string | undefined =
  runtime.googleClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const TURNSTILE_SITE_KEY: string | undefined =
  runtime.turnstileSiteKey || import.meta.env.VITE_TURNSTILE_SITE_KEY;