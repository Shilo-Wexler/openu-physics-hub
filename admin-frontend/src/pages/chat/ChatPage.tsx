/** Chat moderation: open reports, blocked users and the action log, one view at a time (?view= in the URL). */

import { useNavigate, useSearchParams } from "react-router";

import {
  blockedUsers,
  moderationActions,
  reportedMessages,
  type ModerationActionType,
} from "../../api/chat";
import { ListMessage, ListRow, RowList } from "../../components/ListRow";
import SegmentedControl from "../../components/SegmentedControl";
import { formatDay } from "../../lib/format";
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

function reportsLabel(count: number): string {
  return count === 1 ? "דיווח אחד" : `${count} דיווחים`;
}

// ---------- Reports ----------

function Reports() {
  const { token, version } = useAdmin();
  const reported = useLoad((signal) => reportedMessages(token, signal), [token, version]);

  if (reported.failed) return <LoadError loaded={reported} what="הדיווחים" />;
  if (!reported.data) return <ListMessage>טוען...</ListMessage>;
  if (reported.data.length === 0) return <ListMessage>אין דיווחים פתוחים.</ListMessage>;

  return (
    <RowList>
      {reported.data.map((m) => (
        <ListRow
          key={m.message_id}
          to={`/chat/reports/${m.message_id}`}
          title={<bdi>{m.author_nickname}</bdi>}
          badge={<span className={styles.count}>{reportsLabel(m.report_count)}</span>}
          time={m.last_reported_at}
          subtitle={m.course_name}
          preview={m.content}
        />
      ))}
    </RowList>
  );
}

// ---------- Blocked users ----------

function Blocked() {
  const { token, version } = useAdmin();
  const users = useLoad((signal) => blockedUsers(token, signal), [token, version]);

  if (users.failed) return <LoadError loaded={users} what="המשתמשים החסומים" />;
  if (!users.data) return <ListMessage>טוען...</ListMessage>;
  if (users.data.length === 0) return <ListMessage>אין משתמשים חסומים.</ListMessage>;

  return (
    <RowList>
      {users.data.map((u) => (
        <ListRow
          key={u.user_id}
          to={`/chat/blocked/${u.user_id}`}
          title={<bdi>{u.nickname}</bdi>}
          subtitle={
            <>
              נחסם {formatDay(u.blocked_at)}
              {u.removed_count > 0 && ` · ${u.removed_count} הודעות הוסרו`}
            </>
          }
        />
      ))}
    </RowList>
  );
}

// ---------- Action log ----------

function Log() {
  const { token, version } = useAdmin();
  const actions = useLoad((signal) => moderationActions(token, signal), [token, version]);

  if (actions.failed) return <LoadError loaded={actions} what="היומן" />;
  if (!actions.data) return <ListMessage>טוען...</ListMessage>;
  if (actions.data.length === 0) return <ListMessage>עוד לא בוצעו פעולות.</ListMessage>;

  return (
    <RowList>
      {actions.data.map((a) => (
        <ListRow
          key={a.id}
          title={
            <>
              {ACTION_LABEL[a.action]}
              {/* The chat server knows messages by number only; nicknames here need a server change. */}
              {a.message_id !== null && <span className={styles.target}> · הודעה {a.message_id}</span>}
            </>
          }
          time={a.created_at}
          subtitle={<bdi dir="ltr">{a.admin_email}</bdi>}
        />
      ))}
    </RowList>
  );
}
