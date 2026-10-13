/**
 * The box for writing a message: a new review (a bar stuck to the bottom of the screen)
 * or a reply inside a thread (with a "replying to" bar).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  /** Grey text inside the empty box. Optional: the course page's box has none. */
  placeholder?: string;
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

  // The box grows with the text, up to the CSS max-height (five lines), then scrolls.
  // A layout effect runs before the browser paints, so the box never flickers at the old size.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const className = sticky ? `${styles.composer} ${styles.sticky}` : styles.composer;

  if (!user) {
    // A guest sees what looks like the box; clicking it opens the sign-in dialog.
    return (
      <div className={className}>
        <button
          type="button"
          className={styles.guest}
          aria-label={label}
          onClick={() => requireSignIn()}
        >
          {placeholder}
        </button>
      </div>
    );
  }

  const hasText = value.trim() !== "";

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

  function clear() {
    setValue("");
    setError(null);
    textareaRef.current?.focus();
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
          <span className={styles.replyingText}>
            מגיבים ל-<strong>{replyingTo.nickname}</strong>
          </span>
          {onCancel && (
            <button
              type="button"
              className={styles.cancel}
              onClick={onCancel}
              aria-label="ביטול תגובה"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {value.length >= SHOW_COUNTER_FROM && (
        <span className={styles.counter}>
          {value.length}/{MAX_LENGTH}
        </span>
      )}
      <div className={styles.row}>
        <div className={styles.field}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            maxLength={MAX_LENGTH}
            rows={1}
            dir="auto"
            placeholder={placeholder}
            aria-label={label}
          />
          {value !== "" && (
            <button
              type="button"
              className={styles.clear}
              aria-label="ניקוי הטקסט"
              // Keeps the focus (and the phone keyboard) in the box while the button is pressed.
              onPointerDown={(event) => event.preventDefault()}
              onClick={clear}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7l10 10M17 7 7 17" />
              </svg>
            </button>
          )}
        </div>
        {/* Appears only with text, so an empty box stays clean. */}
        {hasText && (
          <button type="submit" className={styles.send} aria-label="פרסום">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        )}
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
