/**
 * Cloudflare Turnstile, the anti-bot check of the inquiry form. Hands the parent a token to send
 * with the inquiry, or null while there is none. A token works once, so the parent remounts this
 * component (a new `key`) to get a fresh one after every send.
 * Docs: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

import { useEffect, useRef } from "react";

// Must load from Cloudflare itself (no copy in the bundle). "explicit": React decides when a widget
// is created and removed, instead of the script scanning the page for one.
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface RenderOptions {
  sitekey: string;
  action?: string;
  theme?: "light" | "dark" | "auto";
  language?: string;
  appearance?: "always" | "execute" | "interaction-only";
  size?: "normal" | "flexible" | "compact";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: (code: string) => void;
}

interface Turnstile {
  render(container: HTMLElement, options: RenderOptions): string | null | undefined;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

// One script for the whole site, however many times the form is opened.
let scriptPromise: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<Turnstile>((resolve, reject) => {
    const element = document.createElement("script");
    element.src = SCRIPT_URL;
    element.async = true;
    element.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile script loaded without the turnstile object"));
    };
    element.onerror = () => {
      // Forget the failed attempt, so opening the form again tries again (e.g. after going online).
      scriptPromise = null;
      element.remove();
      reject(new Error("turnstile script failed to load"));
    };
    document.head.appendChild(element);
  });
  return scriptPromise;
}

interface Props {
  siteKey: string;
  /** A fresh token, or null when it expired or the check failed. */
  onToken: (token: string | null) => void;
  /** The check could not run (script blocked, network, Cloudflare error). */
  onFail: () => void;
}

export default function TurnstileWidget({ siteKey, onToken, onFail }: Props) {
  const box = useRef<HTMLDivElement>(null);

  // The widget is created once per mount; it calls whatever callbacks the parent passed last.
  const callbacks = useRef({ onToken, onFail });
  useEffect(() => {
    callbacks.current = { onToken, onFail };
  });

  useEffect(() => {
    let widgetId: string | null | undefined;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !box.current) return;
        widgetId = turnstile.render(box.current, {
          sitekey: siteKey,
          action: "inquiry",
          theme: "light",
          language: "he",
          // Invisible for most people; a checkbox shows up only when Cloudflare is unsure.
          appearance: "interaction-only",
          // Fixed size (300x65), as in Cloudflare's own demo. "flexible" failed for many visitors
          // with client error 300010 while the same browsers passed the demo.
          size: "normal",
          callback: (token) => callbacks.current.onToken(token),
          // Tokens expire after 5 minutes; Turnstile then fetches a new one and calls `callback` again.
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => {
            callbacks.current.onToken(null);
            callbacks.current.onFail();
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(error);
        callbacks.current.onFail();
      });

    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={box} />;
}
