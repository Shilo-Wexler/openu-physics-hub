import { useState, type FormEvent } from "react";

import { addAdmin, listAdmins, removeAdmin, setAdminRoles } from "../../api/admins";
import { isAuthError } from "../../api/client";
import { formatDateTime } from "../../lib/format";
import { LEVEL_HINT, LEVEL_LABEL, levelOf, rolesOf, type Level } from "../../lib/levels";
import FieldError from "../../components/FieldError";
import { emailError } from "../../lib/validation";
import { actionError, useAdmin, useLoad } from "./context";
import LoadError from "./LoadError";

/**
 * Admins. Everyone sees the list. A full admin ("מנהל ראשי") can add, change the level of and remove
 * other admins; a standard admin ("מנהל") can do everything else in the console, but not this.
 */
export default function AdminsTab() {
  const { token, email: me, isFullAdmin, version, changed, onAuthError } = useAdmin();
  const admins = useLoad((signal) => listAdmins(token, signal), [token, version]);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<Level>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setAdded(null);
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
    const target = email.trim().toLowerCase();
    if (await run(() => addAdmin(token, target, rolesOf(level)))) {
      setAdded(target);
      setEmail("");
      setLevel("standard");
    }
  }

  function changeLevel(target: string, next: Level) {
    if (window.confirm(`לשנות את ${target} ל"${LEVEL_LABEL[next]}"? (${LEVEL_HINT[next]})`)) {
      void run(() => setAdminRoles(token, target, rolesOf(next)));
    }
  }

  function remove(target: string) {
    if (window.confirm(`להסיר את ${target} מהמנהלים? הגישה שלו תיחסם מיד.`)) {
      void run(() => removeAdmin(token, target));
    }
  }

  return (
    <div className="stats">
      {isFullAdmin ? (
        <form className="card form" onSubmit={add} noValidate>
          <h2>הוספת מנהל</h2>
          <p className="muted">ההרשאה נכנסת לתוקף מיד: המנהל החדש נכנס עם חשבון הגוגל של המייל הזה.</p>
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
              aria-describedby="admin-email-error"
            />
            <FieldError id="admin-email-error" message={fieldError} />
          </label>
          <fieldset className="levels">
            <legend>דרגה</legend>
            {(["standard", "full"] as const).map((l) => (
              <label key={l} className="checkbox">
                <input type="radio" name="level" value={l} checked={level === l} onChange={() => setLevel(l)} />
                <span>
                  <strong>{LEVEL_LABEL[l]}</strong> <span className="muted">· {LEVEL_HINT[l]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            הוספה
          </button>
          {added && (
            <p className="notice">
              <bdi dir="ltr">{added}</bdi> נוסף. כל עוד האפליקציה בגוגל במצב Testing, צריך להוסיף את המייל גם לרשימת
              Test users ב-Google Cloud Console, אחרת גוגל יחסום את הכניסה.
            </p>
          )}
        </form>
      ) : (
        <p className="notice standard-notice">רק מנהל ראשי יכול להוסיף, לשנות או להסיר מנהלים. את הרשימה אפשר לראות.</p>
      )}

      <section className="card">
        <h2>מנהלים</h2>
        {error && <p className="error">{error}</p>}
        <LoadError loaded={admins} what="רשימת המנהלים" />
        {admins.data && (
          <div className="table-wrap">
            <table className="admins-table">
              <thead>
                <tr>
                  <th>מייל</th>
                  <th>דרגה</th>
                  <th>נוסף על ידי</th>
                  <th>מתי</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {admins.data.map((a) => {
                  const current = levelOf(a.roles);
                  const other: Level = current === "full" ? "standard" : "full";
                  return (
                    <tr key={a.email}>
                      <td dir="ltr" className="email-cell">
                        {a.email}
                      </td>
                      <td>
                        <span className={`badge level-badge level-${current}`}>{LEVEL_LABEL[current]}</span>
                      </td>
                      <td dir="ltr" className="email-cell">
                        {a.added_by ?? <span className="muted">–</span>}
                      </td>
                      <td className="nowrap">{formatDateTime(a.created_at)}</td>
                      <td className="row-actions">
                        {a.email === me ? (
                          <span className="muted">(את/ה)</span>
                        ) : (
                          isFullAdmin && (
                            <>
                              <button className="btn btn-small" disabled={busy} onClick={() => changeLevel(a.email, other)}>
                                {other === "full" ? "הפיכה למנהל ראשי" : "הפיכה למנהל"}
                              </button>
                              <button className="btn btn-small btn-danger" disabled={busy} onClick={() => remove(a.email)}>
                                הסרה
                              </button>
                            </>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
