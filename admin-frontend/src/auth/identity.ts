/**
 * Who is signed in to the console.
 *
 * Production: Cloudflare Access signs the admin in before the console loads, and adds a signed header to
 * every request to this domain. So the console holds no token, and who it is comes from /api/admin/me.
 * Dev (the Vite dev server, no Cloudflare): a "dev:<email>" token, kept per browser tab (sessionStorage) so
 * a refresh does not sign you out. The backend accepts it only when it runs with ENV=dev and DEV_AUTH_EMAIL.
 */

export interface Identity {
  /** "dev:<email>" in dev. Empty in production: the browser sends the Cloudflare cookie instead. */
  token: string;
  /** Lowercase. Known up front only in dev; in production it comes from /api/admin/me. */
  email: string;
}

/** One area today (the admin console); the key leaves room for more without mixing sign-ins. */
export type Area = "admin";

/** The Vite dev server signs in with an email box. A production build relies on Cloudflare Access. */
export const DEV_SIGN_IN = import.meta.env.DEV;

/** Where Cloudflare Access ends its session (the console is served behind it). */
export const CLOUDFLARE_LOGOUT_URL = "/cdn-cgi/access/logout";

const CLOUDFLARE_IDENTITY: Identity = { token: "", email: "" };

const storageKey = (area: Area) => `identity:${area}`;

export function devIdentity(email: string): Identity | null {
  const clean = email.trim().toLowerCase();
  return clean.includes("@") ? { token: `dev:${clean}`, email: clean } : null;
}

/** In production there is always an identity: Cloudflare would not have let the page load otherwise. */
export function loadIdentity(area: Area): Identity | null {
  if (!DEV_SIGN_IN) return CLOUDFLARE_IDENTITY;
  try {
    const raw = sessionStorage.getItem(storageKey(area));
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(area: Area, identity: Identity): void {
  try {
    sessionStorage.setItem(storageKey(area), JSON.stringify(identity));
  } catch {
    // Storage blocked (private mode): the sign-in still works until the page is refreshed.
  }
}

export function clearIdentity(area: Area): void {
  try {
    sessionStorage.removeItem(storageKey(area));
  } catch {
    // Nothing to clear.
  }
}
