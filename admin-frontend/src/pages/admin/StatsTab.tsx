import { useState } from "react";

import { isAuthError } from "../../api/client";
import { blockEmail, statsByCourse, statsWeekly, topSenders } from "../../api/requests";
import { formatDateTime, formatDay } from "../../lib/format";
import { actionError, useAdmin, useLoad } from "./context";
import LoadError from "./LoadError";

const WEEKS = 12;

export default function StatsTab() {
  const { token, version } = useAdmin();
  const byCourse = useLoad((signal) => statsByCourse(token, signal), [token, version]);
  const weekly = useLoad((signal) => statsWeekly(token, WEEKS, signal), [token, version]);
  const senders = useLoad((signal) => topSenders(token, signal), [token, version]);

  // Only courses that have requests, most first (the server already sorts them).
  const courses = (byCourse.data ?? []).filter((c) => c.total > 0);
  const maxCourse = Math.max(1, ...courses.map((c) => c.total));
  const maxWeek = Math.max(1, ...(weekly.data ?? []).map((w) => w.total));

  return (
    <div className="stats">
      <section className="card">
        <h2>פניות לפי קורס</h2>
        <LoadError loaded={byCourse} what="הפניות לפי קורס" />
        {byCourse.data && courses.length === 0 && <p className="muted">אין עדיין פניות.</p>}
        <ul className="hbars">
          {courses.map((c) => (
            <li key={c.course_name}>
              <span className="hbar-label">{c.course_name}</span>
              <span className="hbar-track">
                <span className="hbar-fill" style={{ width: `${(c.total / maxCourse) * 100}%` }} />
              </span>
              <span className="hbar-value">
                {c.total}
                {c.unread > 0 && <span className="muted"> ({c.unread} לא נקראו)</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>פניות לפי שבוע ({WEEKS} שבועות אחרונים)</h2>
        <LoadError loaded={weekly} what="הפניות לפי שבוע" />
        <div className="vbars">
          {weekly.data?.map((w) => (
            <div key={w.week} className="vbar" title={`שבוע מ-${formatDay(w.week)}: ${w.total}`}>
              <span className="vbar-value">{w.total || ""}</span>
              <span className="vbar-area">
                <span className="vbar-fill" style={{ height: `${(w.total / maxWeek) * 100}%` }} />
              </span>
              <span className="vbar-label">{formatDay(w.week)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>השולחים המובילים (30 יום)</h2>
        <LoadError loaded={senders} what="השולחים המובילים" />
        {senders.data && senders.data.length === 0 && <p className="muted">אין פניות ב-30 הימים האחרונים.</p>}
        {senders.data && senders.data.length > 0 && <SendersTable rows={senders.data} />}
      </section>
    </div>
  );
}

function SendersTable({ rows }: { rows: { email: string; total: number; last_at: string; is_blocked: boolean }[] }) {
  const { token, changed, onAuthError } = useAdmin();
  const [error, setError] = useState<string | null>(null);

  async function block(email: string) {
    const reason = window.prompt(`חסימת ${email}. סיבה (לא חובה):`);
    if (reason === null) return;
    try {
      await blockEmail(token, email, reason);
      changed();
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
    }
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>מייל</th>
              <th>פניות</th>
              <th>אחרונה</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.email}>
                <td dir="ltr" className="email-cell">
                  {r.email}
                </td>
                <td>{r.total}</td>
                <td className="nowrap">{formatDateTime(r.last_at)}</td>
                <td>
                  {r.is_blocked ? (
                    <span className="badge badge-closed">חסום</span>
                  ) : (
                    <button className="btn btn-small" onClick={() => block(r.email)}>
                      חסימה
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
