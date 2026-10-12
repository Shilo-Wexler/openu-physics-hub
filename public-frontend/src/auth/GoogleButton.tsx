/** Google's own "Sign in with Google" button. Google's script loads only when a button is shown. */

import { useEffect, useRef, useState } from "react";

import type { SignInResult } from "../api/chat";
import { useAuth } from "./AuthContext";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCRIPT_URL = "https://accounts.google.com/gsi/client";

// The small part of Google Identity Services this file uses.
interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

// Google calls one callback for the whole page; it forwards to the button that is mounted.
let handleCredential: ((idToken: string) => void) | null = null;

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
        callback: (response) => handleCredential?.(response.credential),
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

interface Props {
  /** Called after a successful sign-in; result.is_new is true on the account's first sign-in. */
  onSignedIn?: (result: SignInResult) => void;
}

export default function GoogleButton({ onSignedIn }: Props) {
  const { signIn } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // The latest onSignedIn, so the handler below never calls an old one.
  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  }, [onSignedIn]);

  useEffect(() => {
    let active = true;

    handleCredential = async (idToken) => {
      try {
        const result = await signIn(idToken);
        onSignedInRef.current?.(result);
      } catch (error) {
        console.error("sign-in failed", error);
        if (active) setFailed(true);
      }
    };

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
        });
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      handleCredential = null;
    };
  }, [signIn]);

  return (
    <div>
      <div ref={containerRef} />
      {failed && <p role="alert">ההתחברות נכשלה, נסו שוב</p>}
    </div>
  );
}
