/** Edits a message in place, inside the message itself (as in Discord). */

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { ApiError } from "../../shared/api/client";
// The same look as the writing box: a full-width text box with the buttons under it.
import styles from "./Composer.module.css";

// Same limit as MAX_LENGTH in chat-backend/app/services/messages.py.
const MAX_LENGTH = 4000;

interface Props {
  /** The current text of the message. */
  initial: string;
  /** Resolves when the server saved the new text; the parent then closes the editor. */
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}

export default function MessageEditor({ initial, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The cursor starts at the end of the text, ready to keep typing.
  useEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, []);

  const content = value.trim();
  const canSave = content !== "" && content !== initial.trim() && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(content);
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  // Ctrl+Enter or Cmd+Enter saves, as in the writing box; Escape gives up.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
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
        rows={3}
        dir="auto"
        aria-label="עריכת ההודעה"
        disabled={saving}
      />
      <div className={styles.footer}>
        <button type="button" onClick={onCancel} disabled={saving}>
          ביטול
        </button>
        <button type="submit" disabled={!canSave}>
          {saving ? "שומר..." : "שמירה"}
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
    if (error.status === 404) return "ההודעה כבר נמחקה";
    if (error.status === 403) return "החשבון חסום ולא ניתן לערוך";
    if (error.status === 401) return "צריך להתחבר מחדש";
  }
  return "השמירה נכשלה, נסו שוב";
}
