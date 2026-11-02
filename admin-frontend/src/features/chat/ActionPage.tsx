/** One action of the moderation log: what was done, to which message or user, how they are now, and undoing it. */

import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ApiError, isAuthError } from "../../shared/api/client";
import { moderationAction, undoModerationAction, type ModerationAction } from "../../shared/api/chat";
import BackLink from "../../shared/components/BackLink";
import { useConfirm } from "../../shared/components/ConfirmSheet";
import { Group, Row } from "../../shared/components/GroupedList";
import LongText from "../../shared/components/LongText";
import { useSplit } from "../../shared/components/SplitView";
import { formatDateTime } from "../../shared/lib/format";
import { errorMessage } from "../../shared/lib/errors";
import AdminLabel from "../../layout/AdminLabel";
import { useAdmin, useLoad } from "../../layout/consoleContext";
import LoadError from "../../layout/LoadError";
import { ACTION_LABEL, DELETED_ACCOUNT, STATE_LABEL, UNDO_EFFECT } from "./labels";
import styles from "./ReportPage.module.css";

const BACK = "/chat?view=log";

export default function ActionPage() {
  const { token, version, changed, onAuthError } = useAdmin();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { split } = useSplit();
  const id = Number(useParams().id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loaded = useLoad((signal) => moderationAction(token, id, signal), [token, id, version]);

  // Beside the list (computer) there is nothing to go back to.
  const back = split ? null : <BackLink to={BACK} label="יומן" />;

  if (loaded.failed) {
    return (
      <>
        {back}
        <LoadError loaded={loaded} what="הפעולה" />
      </>
    );
  }
  if (!loaded.data) {
    return (
      <>
        {back}
        <p className={styles.status}>טוען…</p>
      </>
    );
  }

  const a = loaded.data;

  async function undo() {
    if (busy) return;
    const ok = await confirm({
      message: UNDO_EFFECT[a.action] ?? "",
      action: "ביטול הפעולה",
      // Undoing an unblock blocks the user again.
      danger: a.action === "unblock",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await undoModerationAction(token, a.id);
      changed();
      navigate(BACK, { replace: true });
    } catch (e) {
      if (isAuthError(e)) onAuthError();
      // 409: something changed since the screen loaded (another action, the author deleted the
      // message, or the author deleted their account).
      else if (e instanceof ApiError && e.status === 409) {
        setError("אי אפשר לבטל את הפעולה הזו, כי ההודעה או המשתמש השתנו מאז.");
        changed();
      } else setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      {back}

      <header className={styles.head}>
        <h1 className={styles.title}>{ACTION_LABEL[a.action]}</h1>
        <p className={styles.meta}>
          <AdminLabel email={a.admin_email} />
          <span>{formatDateTime(a.created_at)}</span>
        </p>
      </header>

      {a.message &&
        // A deleted account's messages are emptied in the chat, so there is no text to show.
        (a.message.author_id === null ? (
          <p className={styles.status}>התוכן נמחק יחד עם החשבון.</p>
        ) : (
          <LongText key={a.id} className={styles.content}>
            {a.message.content}
          </LongText>
        ))}

      <Details action={a} />

      {error && <p className="error">{error}</p>}

      <UndoGroup action={a} onUndo={() => void undo()} />
    </>
  );
}

/** How the message or the user is now, as the chat backend tells it. */
function Details({ action: a }: { action: ModerationAction }) {
  if (a.message) {
    const m = a.message;
    return (
      <Group title="ההודעה">
        <Row label="כותב" value={m.author_nickname === null ? DELETED_ACCOUNT : <bdi>{m.author_nickname}</bdi>} />
        <Row label="קורס" value={m.course_name} />
        <Row label="נכתבה" value={formatDateTime(m.created_at)} />
        <Row label="מצב" value={STATE_LABEL[m.state]} />
        <Row label="דיווחים פתוחים" value={m.open_reports} />
        <Row label="כל הדיווחים" value={m.all_reports} />
        {m.state === "active" && m.open_reports > 0 && <Row label="מעבר לדיווח" to={`/chat/reports/${m.message_id}`} />}
      </Group>
    );
  }

  // Neither came back. Either the chat backend did not answer (the log itself still loaded),
  // or the user deleted their account; the console cannot tell which.
  const u = a.user;
  if (!u) {
    return (
      <p className={styles.status}>
        הפרטים לא זמינים. ייתכן ששרת הצ'אט לא ענה, ואז אפשר לנסות שוב מאוחר יותר, או שהמשתמש מחק את החשבון.
      </p>
    );
  }

  return (
    <Group title="המשתמש">
      <Row label="כינוי" value={<bdi>{u.nickname}</bdi>} />
      <Row label="מצב" value={u.blocked_at ? `חסום מ־${formatDateTime(u.blocked_at)}` : "לא חסום"} />
      {u.blocked_at && <Row label="מעבר למשתמש החסום" to={`/chat/blocked/${u.user_id}`} />}
    </Group>
  );
}

/** The undo row when it can be undone; otherwise who undid it, or why it can't be. */
function UndoGroup({ action: a, onUndo }: { action: ModerationAction; onUndo: () => void }) {
  if (a.can_undo) {
    return (
      <Group footer={UNDO_EFFECT[a.action]}>
        <Row label="ביטול הפעולה" danger={a.action === "unblock"} onClick={onUndo} />
      </Group>
    );
  }

  if (a.undone_by !== null) {
    return (
      <Group title="בוטלה" footer="אפשר לבטל פעולה פעם אחת בלבד.">
        {a.undone_by_email && <Row label="על ידי" value={<AdminLabel email={a.undone_by_email} />} />}
        {a.undone_at && <Row label="מתי" value={formatDateTime(a.undone_at)} />}
      </Group>
    );
  }

  if (a.undoes !== null) {
    return (
      <Group footer="זו פעולת ביטול, ואותה אי אפשר לבטל.">
        <Row label="הפעולה שבוטלה" to={`/chat/log/${a.undoes}`} />
      </Group>
    );
  }

  return (
    <p className={styles.status}>
      אי אפשר לבטל את הפעולה הזו, כי אחריה נעשתה פעולה אחרת על אותה הודעה או אותו משתמש. אפשר לבטל רק את האחרונה.
    </p>
  );
}
