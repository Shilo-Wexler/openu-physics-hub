/**
 * Google's own "Sign in with Google" button, in redirect mode: the whole tab goes to Google
 * and comes back through the server to /auth/done. No popup, because popups leave a white
 * screen in some phone browsers (iPhone Chrome). Google's script loads only when a button is shown.
 */

import { useEffect, useRef, useState } from "react";

import { saveReturnPath } from "./signInReturn";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCRIPT_URL = "https://accounts.google.com/gsi/client";
// Google posts the sign-in here; the server checks it and redirects to /auth/done.
const LOGIN_PATH = "/api/chat/auth/google/redirect";

// The small part of Google Identity Services this file uses.
interface ButtonOptions {
  type: "standard";
  theme: "outline";
  size: "medium";
  shape: "pill";
  text: "signin";
  locale: string;
  click_listener: () => void;
}

// The small part of Google Identity Services this file uses.
interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: { client_id: string; ux_mode: "redirect"; login_uri: string }) => void;
      renderButton: (parent: HTMLElement, options: ButtonOptions) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

// The script loads and initializes once per page, however many times a button mounts.
let googlePromise: Promise<GoogleIdentity> | null = null;

function loadGoogle(): Promise<GoogleIdentity> {
  googlePromise ??= new Promise<GoogleIdentity>((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error("VITE_GOOGLE_CLIENT_ID is not set"));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const google = window.google;
      if (!google) {
        reject(new Error("Google script loaded without window.google"));
        return;
      }
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        ux_mode: "redirect",
        // Same origin as the page, so it works on localhost, the dev tunnel and production alike.
        login_uri: `${window.location.origin}${LOGIN_PATH}`,
      });
      resolve(google);
    };
    script.onerror = () => reject(new Error("could not load Google script"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    googlePromise = null; // let the next mount try again (for example after going back online)
    throw error;
  });
  return googlePromise;
}

export default function GoogleButton() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    loadGoogle()
      .then((google) => {
        if (!active || !containerRef.current) return;
        google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "medium",
          shape: "pill",
          text: "signin",
          locale: "he",
          // Runs on click, just before the tab leaves for Google.
          click_listener: saveReturnPath,
        });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <div ref={containerRef} />
      {failed && <p role="alert">לא הצלחנו לטעון את ההתחברות עם Google. אפשר לרענן את הדף ולנסות שוב.</p>}
    </div>
  );
}
