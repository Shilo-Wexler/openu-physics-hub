/** Change the signed-in user's nickname. */

import { useState } from "react";
import type { FormEvent } from "react";

import { changeNickname } from "../../shared/api/chat";
import { ApiError } from "../../shared/api/client";
import { useAuth } from "../auth/AuthContext";

// Same rule as _NICKNAME_PATTERN in chat-backend/app/services/users.py:
// 3-30 Hebrew or English letters, digits, space, underscore, hyphen, dot.
// Checked here only for instant feedback; the server still enforces it.
const NICKNAME_PATTERN = /^[A-Za-z0-9א-ת _.-]{3,30}$/;

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

interface Props {
  current: string;
}

export default function NicknameForm({ current }: Props) {
  const { updateUser } = useAuth();
  const [value, setValue] = useState(current);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const trimmed = value.trim();
  const valid = NICKNAME_PATTERN.test(trimmed);
  const changed = trimmed !== current;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !changed) return;
    setStatus({ kind: "saving" });
    try {
      const { nickname } = await changeNickname(trimmed);
      updateUser({ nickname }); // the header updates at once, with no /me call
      setValue(nickname);
      setStatus({ kind: "saved" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="nickname">כינוי</label>
      <input
        id="nickname"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setStatus({ kind: "idle" });
        }}
        maxLength={30}
        autoComplete="off"
        aria-invalid={!valid}
      />
      <button type="submit" disabled={!valid || !changed || status.kind === "saving"}>
        {status.kind === "saving" ? "שומר..." : "שמירה"}
      </button>

      {!valid && trimmed !== "" && (
        <p>3-30 תווים: אותיות בעברית או באנגלית, ספרות, רווח, _ - .</p>
      )}
      {status.kind === "saved" && <p role="status">הכינוי נשמר</p>}
      {status.kind === "error" && <p role="alert">{status.message}</p>}
    </form>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "הכינוי הזה תפוס, נסו אחר";
    if (error.status === 422) return "כינוי לא תקין";
    if (error.status === 403) return "החשבון חסום ולא ניתן לשנות כינוי";
    if (error.status === 401) return "צריך להתחבר מחדש";
  }
  return "השמירה נכשלה, נסו שוב";
}
