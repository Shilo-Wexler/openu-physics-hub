import { useState, type FormEvent } from "react";

import FieldError from "../components/FieldError";
import { emailError } from "../lib/validation";

interface Props {
  onEmail: (email: string) => void;
}

/**
 * DEV ONLY: a plain email box (sent as "dev:<email>"). In production Cloudflare Access signs the admin in
 * before the console loads, so this form is never shown there.
 */
export default function SignIn({ onEmail }: Props) {
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = emailError(email);
    setProblem(error);
    if (!error) onEmail(email);
  }

  return (
    <form className="dev-signin" onSubmit={submit} noValidate>
      <p className="notice">
        מצב פיתוח: אין כאן Cloudflare, ולכן מתחברים עם מייל בלבד. זה עובד רק מול שרת שהורם עם ENV=dev ו־
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

