import { useState, type FormEvent } from "react";

import { isAuthError } from "../../api/client";
import { blockEmail, listBlocked, unblockEmail } from "../../api/requests";
import { formatDateTime } from "../../lib/format";
import FieldError from "../../components/FieldError";
import { emailError } from "../../lib/validation";
import { actionError, useAdmin, useLoad } from "./context";
import LoadError from "./LoadError";

export default function BlockedTab() {
  const { token, version, changed, onAuthError } = useAdmin();
  const blocked = useLoad((signal) => listBlocked(token, signal), [token, version]);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      changed();
      return true;
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = emailError(email);
    setFieldError(problem);
    if (problem) return;
    if (await run(() => blockEmail(token, email.trim(), reason))) {
      setEmail("");
      setReason("");
    }
  }

  function remove(target: string) {
    if (window.confirm(`לבטל את החסימה של ${target}?`)) void run(() => unblockEmail(token, target));
  }

  return (
    <div className="stats">
      <form className="card form" onSubmit={add} noValidate>
        <h2>חסימת מייל מפניות</h2>
        <p className="muted">מייל חסום לא יכול לשלוח פניות חדשות. הפניות הקיימות שלו נשארות.</p>
        <label>
          מייל
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldError(null);
            }}
            aria-invalid={fieldError !== null}
            aria-describedby="block-email-error"
          />
          <FieldError id="block-email-error" message={fieldError} />
        </label>
        <label>
          סיבה (לא חובה)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          חסימה
        </button>
      </form>

      <section className="card">
        <h2>מיילים חסומים</h2>
        {error && <p className="error">{error}</p>}
        <LoadError loaded={blocked} what="רשימת המיילים החסומים" />
        {blocked.data && blocked.data.length === 0 && <p className="muted">אין מיילים חסומים.</p>}
        {blocked.data && blocked.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>מייל</th>
                  <th>סיבה</th>
                  <th>נחסם</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {blocked.data.map((b) => (
                  <tr key={b.email}>
                    <td dir="ltr" className="email-cell">
                      {b.email}
                    </td>
                    <td>{b.reason ?? <span className="muted">–</span>}</td>
                    <td className="nowrap">{formatDateTime(b.blocked_at)}</td>
                    <td>
                      <button className="btn btn-small" disabled={busy} onClick={() => remove(b.email)}>
                        ביטול חסימה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
