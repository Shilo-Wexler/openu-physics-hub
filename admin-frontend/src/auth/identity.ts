/**
 * Who is signed in, kept per browser tab (sessionStorage) so a refresh does not sign you out.
 * The token is a Google ID token; the backend verifies it on every request. Here we only read
 * the email, name and expiry from it, for display. In dev mode the token is "dev:<email>".
 */

export interface Identity {
  token: string;
  email: string;
  name: string | null;
  expiresAt: number | null; // ms since epoch; null for dev tokens
}

/** One area today (the admin console); the key leaves room for more without mixing sign-ins. */
export type Area = "admin";

const storageKey = (area: Area) => `identity:${area}`;

// Treat a token as expired a minute early, so it does not run out in the middle of a request.
const EXPIRY_MARGIN_MS = 60_000;

export function identityFromToken(token: string): Identity | null {
  if (token.startsWith("dev:")) {
    const email = token.slice(4).trim().toLowerCase();
    return email.includes("@") ? { token, email, name: null, expiresAt: null } : null;
  }
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.email !== "string") return null;
  return {
    token,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : null,
    expiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : null,
  };
}

export function loadIdentity(area: Area): Identity | null {
  try {
    const raw = sessionStorage.getItem(storageKey(area));
    if (!raw) return null;
    const identity = JSON.parse(raw) as Identity;
    if (identity.expiresAt !== null && identity.expiresAt - EXPIRY_MARGIN_MS < Date.now()) {
      clearIdentity(area);
      return null;
    }
    return identity;
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
  window.google?.accounts.id.disableAutoSelect();
}

/** Reads the middle part of a JWT. No signature check: the backend does that. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    // TextDecoder, so Hebrew names come out right.
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
