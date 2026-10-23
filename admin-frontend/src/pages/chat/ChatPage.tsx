/** Chat moderation: open reports, blocked users and the action log, one view at a time (?view= in the URL). */

import { Link, useNavigate, useSearchParams } from "react-router";

import {
  blockedUsers,
  moderationActions,
  reportedMessages,
  type ModerationActionType,
} from "../../api/chat";
import SegmentedControl from "../../components/SegmentedControl";
import { formatDay, formatListTime } from "../../lib/format";
import { useAdmin, useLoad } from "../admin/context";
import LoadError from "../admin/LoadError";
import styles from "./ChatPage.module.css";

type View = "reports" | "blocked" | "log";

const VIEWS: { value: View; label: string }[] = [
  { value: "reports", label: "דיווחים" },
  { value: "blocked", label: "חסומים" },
  { value: "log", label: "יומן" },
];

const ACTION_LABEL: Record<ModerationActionType, string> = {
  dismiss: "התעלמות מדיווח",
  remove: "הסרת הודעה",
  block: "חסימת משתמש",
  unblock: "ביטול חסימה",
};

/** The view from the URL; anything else is the reports, the view that needs work. */
function readView(params: URLSearchParams): View {
  const view = params.get("view");
  return view === "blocked" || view === "log" ? view : "reports";
}

export default function ChatPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const view = readView(params);

  // replace: switching views should not fill the back button's history.
  function changeView(next: View) {
    navigate(next === "reports" ? "/chat" : `/chat?view=${next}`, { replace: true });
  }

  return (
    <>
      <h1>צ'אט</h1>
      <SegmentedControl label="תצוגה" segments={VIEWS} value={view} onChange={changeView} />
      {view === "reports" && <Reports />}
      {view === "blocked" && <Blocked />}
      {view === "log" && <Log />}
    </>
  );
}

function Chevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function reportsLabel(count: number): string {
  return count === 1 ? "דיווח אחד" : `${count} דיווחים`;
}

// ---------- Reports ----------

function Reports() {
  const { token, version } = useAdmin();
  const reported = useLoad((signal) => reportedMessages(token, signal), [token, version]);

  if (reported.failed) return <LoadError loaded={reported} what="הדיווחים" />;
  if (!reported.data) return <p className={styles.status}>טוען...</p>;
  if (reported.data.length === 0) return <p className={styles.status}>אין דיווחים פתוחים.</p>;

  return (
    <ul className={styles.list}>
      {reported.data.map((m) => (
        <li key={m.message_id} className={styles.item}>
          <Link to={`/chat/reports/${m.message_id}`} className={styles.row}>
            <span className={styles.content}>
              <span className={styles.body}>
                <span className={styles.top}>
                  <bdi className={styles.name}>{m.author_nickname}</bdi>
                  <span className={styles.count}>{reportsLabel(m.report_count)}</span>
                  <time className={styles.time} dateTime={m.last_reported_at}>
                    {formatListTime(m.last_reported_at)}
                  </time>
                </span>
                <span className={styles.sub}>{m.course_name}</span>
                <span className={styles.preview} dir="auto">
                  {m.content}
                </span>
              </span>
              <Chevron />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------- Blocked users ----------

function Blocked() {
  const { token, version } = useAdmin();
  const users = useLoad((signal) => blockedUsers(token, signal), [token, version]);

  if (users.failed) return <LoadError loaded={users} what="המשתמשים החסומים" />;
  if (!users.data) return <p className={styles.status}>טוען...</p>;
  if (users.data.length === 0) return <p className={styles.status}>אין משתמשים חסומים.</p>;

  return (
    <ul className={styles.list}>
      {users.data.map((u) => (
        <li key={u.user_id} className={styles.item}>
          <Link to={`/chat/blocked/${u.user_id}`} className={styles.row}>
            <span className={styles.content}>
              <span className={styles.body}>
                <bdi className={styles.name}>{u.nickname}</bdi>
                <span className={styles.sub}>
                  נחסם {formatDay(u.blocked_at)}
                  {u.removed_count > 0 && ` · ${u.removed_count} הודעות הוסרו`}
                </span>
              </span>
              <Chevron />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------- Action log ----------

function Log() {
  const { token, version } = useAdmin();
  const actions = useLoad((signal) => moderationActions(token, signal), [token, version]);

  if (actions.failed) return <LoadError loaded={actions} what="היומן" />;
  if (!actions.data) return <p className={styles.status}>טוען...</p>;
  if (actions.data.length === 0) return <p className={styles.status}>עוד לא בוצעו פעולות.</p>;

  return (
    <ul className={styles.list}>
      {actions.data.map((a) => (
        <li key={a.id} className={styles.item}>
          <div className={styles.row}>
            <span className={styles.content}>
              <span className={styles.body}>
                <span className={styles.top}>
                  <span className={styles.name}>
                    {ACTION_LABEL[a.action]}
                    {/* The chat server knows messages by number only; nicknames here need a server change. */}
                    {a.message_id !== null && <span className={styles.target}> · הודעה {a.message_id}</span>}
                  </span>
                  <time className={styles.time} dateTime={a.created_at}>
                    {formatListTime(a.created_at)}
                  </time>
                </span>
                <span className={styles.sub}>
                  <bdi dir="ltr">{a.admin_email}</bdi>
                </span>
              </span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
