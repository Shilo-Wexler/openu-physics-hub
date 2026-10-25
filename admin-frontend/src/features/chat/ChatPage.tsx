/** Chat moderation: open reports, blocked users and the action log, one view at a time (?view= in the URL). */

import { useNavigate, useSearchParams } from "react-router";

import { blockedUsers, moderationActions, reportedMessages } from "../../shared/api/chat";
import { ListMessage, ListRow, RowList } from "../../shared/components/ListRow";
import SegmentedControl from "../../shared/components/SegmentedControl";
import { formatDay } from "../../shared/lib/format";
import AdminLabel from "../../layout/AdminLabel";
import { useAdmin, useLoad } from "../../layout/consoleContext";
import LoadError from "../../layout/LoadError";
import styles from "./ChatPage.module.css";
import { ACTION_LABEL, reportsLabel, targetName } from "./labels";

type View = "reports" | "blocked" | "log";

const VIEWS: { value: View; label: string }[] = [
  { value: "reports", label: "דיווחים" },
  { value: "blocked", label: "חסומים" },
  { value: "log", label: "יומן" },
];

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

// ---------- Reports ----------

function Reports() {
  const { token, version } = useAdmin();
  const reported = useLoad((signal) => reportedMessages(token, signal), [token, version]);

  if (reported.failed) return <LoadError loaded={reported} what="הדיווחים" />;
  if (!reported.data) return <ListMessage>טוען…</ListMessage>;
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
  if (!users.data) return <ListMessage>טוען…</ListMessage>;
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
  if (!actions.data) return <ListMessage>טוען…</ListMessage>;
  if (actions.data.length === 0) return <ListMessage>עוד לא בוצעו פעולות.</ListMessage>;

  return (
    <RowList>
      {actions.data.map((a) => {
        // Without the chat backend there is no nickname; the message number still tells which one.
        const target = targetName(a) ?? (a.message_id !== null ? `הודעה ${a.message_id}` : null);
        return (
          <ListRow
            key={a.id}
            to={`/chat/log/${a.id}`}
            title={
              <>
                {ACTION_LABEL[a.action]}
                {target && (
                  <span className={styles.target}>
                    {" · "}
                    <bdi>{target}</bdi>
                  </span>
                )}
              </>
            }
            badge={a.undone_by !== null && <span className={styles.undone}>בוטלה</span>}
            time={a.created_at}
            subtitle={<AdminLabel email={a.admin_email} />}
            preview={a.message?.content}
          />
        );
      })}
    </RowList>
  );
}
