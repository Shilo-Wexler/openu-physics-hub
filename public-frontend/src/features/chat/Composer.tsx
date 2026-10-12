/**
 * The box for writing a message: a new review (sticky at the bottom of the screen)
 * or a reply inside a thread (with a "replying to" bar).
 */

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { ApiError } from "../../shared/api/client";
import { useAuth } from "../auth/AuthContext";
import styles from "./Composer.module.css";

// Same limit as MAX_LENGTH in chat-backend/app/services/messages.py.
const MAX_LENGTH = 4000;
// The counter appears only near the limit, so it does not distract while writing.
const SHOW_COUNTER_FROM = 3500;

interface Props {
  /** Adds the message (optimistically) and resolves when the server saved it. */
  onSend: (content: string) => Promise<void>;
  placeholder: string;
  /** Read by screen readers, since the box has no visible label. */
  label: string;
  /** Stays at the bottom of the screen while the list scrolls (the new-review box). */
  sticky?: boolean;
  /** The message being answered, shown above the box. */
  replyingTo?: { nickname: string } | null;
  /** Shows a cancel button; called when the reader gives up on this reply. */
  onCancel?: () => void;
  /** Puts the cursor in the box when it appears (a reply the reader just asked for). */
  autoFocus?: boolean;
}

export default function Composer({
  onSend,
  placeholder,
  label,
  sticky = false,
  replyingTo = null,
  onCancel,
  autoFocus = false,
}: Props) {
  const { user, requireSignIn } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus, replyingTo]);

  const className = sticky ? `${styles.composer} ${styles.sticky}` : styles.composer;

  if (!user) {
    // A guest sees what looks like the box; clicking it opens the sign-in dialog.
    return (
      <div className={className}>
        <button type="button" className={styles.guest} onClick={() => requireSignIn()}>
          {placeholder}
        </button>
      </div>
    );
  }

  async function send() {
    const content = value.trim();
    if (content === "") return;
    setError(null);
    setValue(""); // cleared at once: the message already shows in the list
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

  // Enter adds a line (messages can be long); Ctrl+Enter or Cmd+Enter sends.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form className={className} onSubmit={handleSubmit}>
      {replyingTo && (
        <div className={styles.replyingTo}>
          <span>מגיבים ל-{replyingTo.nickname}</span>
          {onCancel && (
            <button type="button" onClick={onCancel} aria-label="ביטול תגובה">
              ✕
            </button>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        maxLength={MAX_LENGTH}
        rows={sticky ? 3 : 2}
        dir="auto"
        placeholder={placeholder}
        aria-label={label}
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
      return "יש בהודעה מילה לא ראויה. ערכו אותה ונסו שוב.";
    }
    if (error.status === 422) return `ההודעה צריכה להיות באורך 1-${MAX_LENGTH} תווים`;
    if (error.status === 404) return "ההודעה שהגבתם עליה נמחקה";
    if (error.status === 403) return "החשבון חסום ולא ניתן לפרסם";
    if (error.status === 401) return "צריך להתחבר מחדש";
  }
  return "הפרסום נכשל, נסו שוב";
}
