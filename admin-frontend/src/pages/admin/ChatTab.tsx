import { useState } from "react";

import { isAuthError } from "../../api/client";
import {
  blockedUsers,
  blockUser,
  dismissReports,
  moderationActions,
  removedMessages,
  removeMessage,
  reportedMessages,
  unblockUser,
  type ModerationActionType,
  type ReportedMessage,
} from "../../api/chat";
import { formatDateTime } from "../../lib/format";
import { actionError, useAdmin, useLoad } from "./context";
import LoadError from "./LoadError";

type View = "reported" | "blocked" | "log";

const VIEWS: { id: View; label: string }[] = [
  { id: "reported", label: "הודעות מדווחות" },
  { id: "blocked", label: "משתמשים חסומים" },
  { id: "log", label: "יומן פעולות" },
];

export default function ChatTab() {
  const [view, setView] = useState<View>("reported");
  return (
    <>
      <div className="filters">
        <div className="segmented">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? "active" : ""} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {view === "reported" && <Reported />}
      {view === "blocked" && <Blocked />}
      {view === "log" && <Log />}
    </>
  );
}

/** Runs an admin action, reloads everything on success, and reports errors. */
function useAction() {
  const { changed, onAuthError } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      changed();
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      else setError(actionError(e));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

// ---------- Reported messages ----------

function Reported() {
  const { token, version } = useAdmin();
  const reported = useLoad((signal) => reportedMessages(token, signal), [token, version]);
  const { busy, error, run } = useAction();

  return (
    <>
      <LoadError loaded={reported} what="ההודעות המדווחות" />
      {error && <p className="error">{error}</p>}
      {reported.data && reported.data.length === 0 && <p className="muted empty">אין הודעות מדווחות. 🎉</p>}
      {reported.data?.map((m) => (
        <ReportedCard key={m.message_id} message={m} busy={busy} run={run} />
      ))}
    </>
  );
}

interface CardProps {
  message: ReportedMessage;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}

function ReportedCard({ message: m, busy, run }: CardProps) {
  const { token } = useAdmin();

  function remove() {
    if (window.confirm("להסיר את ההודעה מהצ'אט? הדיווחים עליה ייסגרו.")) {
      void run(() => removeMessage(token, m.message_id));
    }
  }

  function block() {
    if (window.confirm(`לחסום את ${m.author_nickname}? הוא יוכל לקרוא, אבל לא לכתוב, לדרג או לדווח.`)) {
      void run(() => blockUser(token, m.author_id));
    }
  }

  return (
    <article className="card report-card">
      <div className="report-head">
        <span>
          <strong>{m.author_nickname}</strong>
          {m.author_blocked && <span className="badge badge-closed"> חסום</span>}
          <span className="muted"> · {m.course_name} · {formatDateTime(m.created_at)}</span>
        </span>
        <span className="badge badge-danger">{m.report_count} דיווחים</span>
      </div>

      <div className="body-text">{m.content}</div>

      <p className="muted small">
        היסטוריית הכותב: {m.author_reported_count} הודעות שדווחו, {m.author_removed_count} הוסרו. דיווח אחרון:{" "}
        {formatDateTime(m.last_reported_at)}
      </p>

      <div className="actions">
        <button className="btn" disabled={busy} onClick={() => run(() => dismissReports(token, m.message_id))}>
          התעלמות (ההודעה נשארת)
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={remove}>
          הסרת ההודעה
        </button>
        {m.author_blocked ? (
          <button className="btn" disabled={busy} onClick={() => run(() => unblockUser(token, m.author_id))}>
            ביטול חסימת הכותב
          </button>
        ) : (
          <button className="btn btn-danger" disabled={busy} onClick={block}>
            חסימת הכותב
          </button>
        )}
      </div>
    </article>
  );
}

// ---------- Blocked users ----------

function Blocked() {
  const { token, version } = useAdmin();
  const users = useLoad((signal) => blockedUsers(token, signal), [token, version]);
  const { busy, error, run } = useAction();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="card">
      <LoadError loaded={users} what="המשתמשים החסומים" />
      {error && <p className="error">{error}</p>}
      {users.data && users.data.length === 0 && <p className="muted">אין משתמשים חסומים בצ'אט.</p>}
      {users.data && users.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>כינוי</th>
                <th>נחסם</th>
                <th>הודעות שהוסרו</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <UserRow
                  key={u.user_id}
                  userId={u.user_id}
                  nickname={u.nickname}
                  blockedAt={u.blocked_at}
                  removedCount={u.removed_count}
                  expanded={open === u.user_id}
                  onToggle={() => setOpen(open === u.user_id ? null : u.user_id)}
                  onUnblock={() => {
                    if (window.confirm(`לבטל את החסימה של ${u.nickname}?`)) void run(() => unblockUser(token, u.user_id));
                  }}
                  busy={busy}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface UserRowProps {
  userId: string;
  nickname: string;
  blockedAt: string;
  removedCount: number;
  expanded: boolean;
  onToggle: () => void;
  onUnblock: () => void;
  busy: boolean;
}

function UserRow({ userId, nickname, blockedAt, removedCount, expanded, onToggle, onUnblock, busy }: UserRowProps) {
  return (
    <>
      <tr>
        <td>{nickname}</td>
        <td className="nowrap">{formatDateTime(blockedAt)}</td>
        <td>
          {removedCount > 0 ? (
            <button className="link-button" onClick={onToggle}>
              {removedCount} {expanded ? "▲" : "▼"}
            </button>
          ) : (
            0
          )}
        </td>
        <td>
          <button className="btn btn-small" disabled={busy} onClick={onUnblock}>
            ביטול חסימה
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4}>
            <RemovedList userId={userId} />
          </td>
        </tr>
      )}
    </>
  );
}

function RemovedList({ userId }: { userId: string }) {
  const { token } = useAdmin();
  const removed = useLoad((signal) => removedMessages(token, userId, signal), [token, userId]);
  return (
    <>
      <LoadError loaded={removed} what="ההודעות שהוסרו" />
      <ul className="removed-list">
        {removed.data?.map((m) => (
          <li key={m.message_id}>
            <span className="muted small">
              {m.course_name} · נכתבה {formatDateTime(m.created_at)} · הוסרה {formatDateTime(m.removed_at)}
            </span>
            <div className="body-text">{m.content}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Action log ----------

const ACTION_LABEL: Record<ModerationActionType, string> = {
  dismiss: "התעלמות מדיווחים",
  remove: "הסרת הודעה",
  block: "חסימת משתמש",
  unblock: "ביטול חסימה",
};

function Log() {
  const { token, version } = useAdmin();
  const actions = useLoad((signal) => moderationActions(token, signal), [token, version]);

  return (
    <section className="card">
      <p className="muted">הפעולות שבוצעו מהקונסולה, החדשה ראשונה. נשמר אצלנו: שרת הצ'אט לא יודע מי ביצע כל פעולה.</p>
      <LoadError loaded={actions} what="יומן הפעולות" />
      {actions.data && actions.data.length === 0 && <p className="muted">עוד לא בוצעו פעולות.</p>}
      {actions.data && actions.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>מתי</th>
                <th>מי</th>
                <th>פעולה</th>
                <th>על מה</th>
              </tr>
            </thead>
            <tbody>
              {actions.data.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{formatDateTime(a.created_at)}</td>
                  <td dir="ltr" className="email-cell">
                    {a.admin_email}
                  </td>
                  <td>{ACTION_LABEL[a.action]}</td>
                  <td dir="ltr" className="email-cell">
                    {a.message_id !== null ? `message #${a.message_id}` : `user ${a.user_id}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
