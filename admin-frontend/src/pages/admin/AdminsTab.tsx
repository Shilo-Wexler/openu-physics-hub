import { useState, type FormEvent } from "react";

import { addAdmin, listAdmins, removeAdmin, setAdminRole } from "../../api/admins";
import { isAuthError } from "../../api/client";
import { formatDateTime } from "../../lib/format";
import { LEVEL_HINT, LEVEL_LABEL, levelsManagedBy, type Level } from "../../lib/levels";
import FieldError from "../../components/FieldError";
import { emailError } from "../../lib/validation";
import { actionError, useAdmin, useLoad } from "./context";
import LoadError from "./LoadError";

/**
 * Admins. Every level sees the list. A super admin manages everyone; an admin manages admins and members,
 * never a super admin; a member manages no one (lib/levels). Nobody changes or removes their own row.
 */
export default function AdminsTab() {
  const { token, email: me, role, version, changed, onAuthError } = useAdmin();
  const admins = useLoad((signal) => listAdmins(token, signal), [token, version]);
  // The levels this admin may give, and whose rows they may change or remove.
  const managed = levelsManagedBy(role);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<Level>("member");
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
    if (await run(() => addAdmin(token, target, level))) {
      setAdded(target);
      setEmail("");
      setLevel("member");
    }
  }

  function changeLevel(target: string, next: Level) {
    if (window.confirm(`לשנות את ${target} ל"${LEVEL_LABEL[next]}"? (${LEVEL_HINT[next]})`)) {
      void run(() => setAdminRole(token, target, next));
    }
  }

  function remove(target: string) {
    if (window.confirm(`להסיר את ${target} מהמנהלים? הגישה שלו תיחסם מיד.`)) {
      void run(() => removeAdmin(token, target));
    }
  }

  return (
    <div className="stats">
      {managed.length > 0 && (
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
            <legend>תפקיד</legend>
            {managed.map((l) => (
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
                  <th>תפקיד</th>
                  <th>נוסף על ידי</th>
                  <th>מתי</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {admins.data.map((a) => (
                  <tr key={a.email}>
                    <td dir="ltr" className="email-cell">
                      {a.email}
                    </td>
                    <td>
                      <span className={`badge level-badge level-${a.role}`}>{LEVEL_LABEL[a.role]}</span>
                    </td>
                    <td dir="ltr" className="email-cell">
                      {a.added_by ?? <span className="muted">–</span>}
                    </td>
                    <td className="nowrap">{formatDateTime(a.created_at)}</td>
                    <td className="row-actions">
                      {a.email === me ? (
                        <span className="muted">(את/ה)</span>
                      ) : (
                        managed.includes(a.role) && (
                          <>
                            {managed
                              .filter((l) => l !== a.role)
                              .map((l) => (
                                <button key={l} className="btn btn-small" disabled={busy} onClick={() => changeLevel(a.email, l)}>
                                  הפיכה ל{LEVEL_LABEL[l]}
                                </button>
                              ))}
                            <button className="btn btn-small btn-danger" disabled={busy} onClick={() => remove(a.email)}>
                              הסרה
                            </button>
                          </>
                        )
                      )}
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
