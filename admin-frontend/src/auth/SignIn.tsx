import { useEffect, useRef, useState, type FormEvent } from "react";

import FieldError from "../components/FieldError";
import { emailError } from "../lib/validation";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GIS_SRC = "https://accounts.google.com/gsi/client";

// Google allows initialize() once per page, so one callback slot is shared by every button.
let currentCallback: ((token: string) => void) | null = null;
let gisReady: Promise<void> | null = null;

function loadGoogle(clientId: string): Promise<void> {
  gisReady ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => currentCallback?.(response.credential),
      });
      resolve();
    };
    script.onerror = () => {
      gisReady = null; // allow a retry on the next mount
      reject(new Error("Google sign-in script failed to load"));
    };
    document.head.appendChild(script);
  });
  return gisReady;
}

interface Props {
  onToken: (token: string) => void;
}

/** "Sign in with Google", or, in dev without a client ID, a plain email box ("dev:<email>"). */
export default function SignIn({ onToken }: Props) {
  if (CLIENT_ID) return <GoogleButton clientId={CLIENT_ID} onToken={onToken} />;
  if (import.meta.env.DEV) return <DevSignIn onToken={onToken} />;
  return <p className="error">אי אפשר להתחבר, כי ההתחברות עם גוגל לא מוגדרת באתר (חסר VITE_GOOGLE_CLIENT_ID).</p>;
}

function GoogleButton({ clientId, onToken }: Props & { clientId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    currentCallback = onToken;
    let cancelled = false;
    loadGoogle(clientId)
      .then(() => {
        if (!cancelled && container.current) {
          window.google?.accounts.id.renderButton(container.current, {
            theme: "outline",
            size: "large",
            text: "signin_with",
            locale: "he",
          });
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (currentCallback === onToken) currentCallback = null;
    };
  }, [clientId, onToken]);

  if (failed) return <p className="error">לא הצלחנו לטעון את ההתחברות של גוגל. בדקו את החיבור ורעננו את הדף.</p>;
  return <div ref={container} className="google-button" />;
}

function DevSignIn({ onToken }: Props) {
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = emailError(email);
    setProblem(error);
    if (!error) onToken(`dev:${email.trim()}`);
  }

  return (
    <form className="dev-signin" onSubmit={submit} noValidate>
      <p className="notice">
        מצב פיתוח: לא הוגדר VITE_GOOGLE_CLIENT_ID, ולכן ההתחברות עוקפת את גוגל. זה עובד רק מול שרת שהורם עם
        DEV_AUTH_EMAIL.
      </p>
      <label>
        מייל
        <input
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setProblem(null);
          }}
          aria-invalid={problem !== null}
          aria-describedby="dev-email-error"
        />
        <FieldError id="dev-email-error" message={problem} />
      </label>
      <button className="btn btn-primary" type="submit">
        התחברות (פיתוח)
      </button>
    </form>
  );
}
