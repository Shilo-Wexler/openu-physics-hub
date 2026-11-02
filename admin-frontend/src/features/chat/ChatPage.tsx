/** Chat moderation: open reports, blocked users and the action log, one view at a time (?view= in the URL).
    On a computer the list sits beside the open item (see SplitView); the item's kind then also picks the view. */

import { useLocation, useMatch, useNavigate, useSearchParams } from "react-router";

import { blockedUsers, moderationActions, reportedMessages } from "../../shared/api/chat";
import { ListMessage, ListRow, RowList } from "../../shared/components/ListRow";
import SegmentedControl from "../../shared/components/SegmentedControl";
import {
  ListHead,
  positionText,
  useAutoOpen,
  useReportPosition,
  useSplit,
} from "../../shared/components/SplitView";
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

/** The view from the URL. Without ?view=, an open blocked user or log action shows its own list beside it;
    anything else is the reports, the view that needs work. */
function readView(params: URLSearchParams, pathname: string): View {
  const view = params.get("view");
  if (view === "blocked" || view === "log") return view;
  if (pathname.startsWith("/chat/blocked/")) return "blocked";
  if (pathname.startsWith("/chat/log/")) return "log";
  return "reports";
}

export default function ChatPage() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { split } = useSplit();
  const view = readView(params, pathname);

  // replace: switching views should not fill the back button's history.
  function changeView(next: View) {
    navigate(next === "reports" ? "/chat" : `/chat?view=${next}`, { replace: true });
  }

  return (
    <>
      {/* On a computer the title sits above the list-and-item window (SplitView draws it). */}
      {!split && <h1>צ'אט</h1>}
      <ListHead>
        <SegmentedControl label="תצוגה" segments={VIEWS} value={view} onChange={changeView} />
      </ListHead>
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

  // On a computer: the first report opens beside the list, and the open one's place shows above it.
  const first = reported.data?.[0];
  useAutoOpen(first ? `/chat/reports/${first.message_id}` : null, reported.loading, version);
  const openId = Number(useMatch("/chat/reports/:id")?.params.id);
  const index = reported.data?.findIndex((m) => m.message_id === openId) ?? -1;
  useReportPosition(positionText("דיווח", index, reported.data?.length));

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

  const first = users.data?.[0];
  useAutoOpen(first ? `/chat/blocked/${first.user_id}` : null, users.loading, version);
  const openId = useMatch("/chat/blocked/:userId")?.params.userId;
  const index = users.data?.findIndex((u) => u.user_id === openId) ?? -1;
  useReportPosition(positionText("משתמש", index, users.data?.length));

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

  const first = actions.data?.[0];
  useAutoOpen(first ? `/chat/log/${first.id}` : null, actions.loading, version);
  const openId = Number(useMatch("/chat/log/:id")?.params.id);
  const index = actions.data?.findIndex((a) => a.id === openId) ?? -1;
  useReportPosition(positionText("פעולה", index, actions.data?.length));

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
