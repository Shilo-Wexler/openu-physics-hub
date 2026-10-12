/** The box for writing a new review. Stays at the bottom of the screen while the list scrolls. */

import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { ApiError } from "../../shared/api/client";
import { useAuth } from "../auth/AuthContext";
import styles from "./ReviewComposer.module.css";

// Same limit as MAX_LENGTH in chat-backend/app/services/messages.py.
const MAX_LENGTH = 4000;
// The counter appears only near the limit, so it does not distract while writing.
const SHOW_COUNTER_FROM = 3500;

interface Props {
  /** Adds the review (optimistically) and resolves when the server saved it. */
  onSend: (content: string) => Promise<void>;
}

export default function ReviewComposer({ onSend }: Props) {
  const { user, requireSignIn } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    // A guest sees what looks like the box; clicking it opens the sign-in dialog.
    return (
      <div className={styles.composer}>
        <button type="button" className={styles.guest} onClick={() => requireSignIn()}>
          כתבו ביקורת על הקורס...
        </button>
      </div>
    );
  }

  async function send() {
    const content = value.trim();
    if (content === "") return;
    setError(null);
    setValue(""); // cleared at once: the review already shows in the list
    try {
      await onSend(content);
    } catch (sendError) {
      // Give the text back, unless the user already started typing something new.
      setValue((current) => (current === "" ? content : current));
      setError(errorMessage(sendError));
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  // Enter adds a line (reviews are long); Ctrl+Enter or Cmd+Enter sends.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      {error && <p role="alert">{error}</p>}
      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        maxLength={MAX_LENGTH}
        rows={3}
        dir="auto"
        placeholder="כתבו ביקורת על הקורס..."
        aria-label="ביקורת חדשה"
      />
      <div className={styles.footer}>
        {value.length >= SHOW_COUNTER_FROM && (
          <span>
            {value.length}/{MAX_LENGTH}
          </span>
        )}
        <button type="submit" disabled={value.trim() === ""}>
          פרסום
        </button>
      </div>
    </form>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422 && error.message === "offensive content") {
      return "יש בביקורת מילה לא ראויה. ערכו אותה ונסו שוב.";
    }
    if (error.status === 422) return `הביקורת צריכה להיות באורך 1-${MAX_LENGTH} תווים`;
    if (error.status === 403) return "החשבון חסום ולא ניתן לפרסם";
    if (error.status === 401) return "צריך להתחבר מחדש";
  }
  return "הפרסום נכשל, נסו שוב";
}
