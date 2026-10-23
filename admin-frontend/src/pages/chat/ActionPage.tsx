/** One action of the moderation log: what was done, to which message or user, how they are now, and undoing it. */

import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ApiError, isAuthError } from "../../api/client";
import { moderationAction, undoModerationAction, type ModerationAction } from "../../api/chat";
import BackLink from "../../components/BackLink";
import { useConfirm } from "../../components/ConfirmSheet";
import { Group, Row } from "../../components/GroupedList";
import { formatDateTime } from "../../lib/format";
import { ACTION_LABEL, STATE_LABEL, UNDO_EFFECT } from "../../lib/moderationLabels";
import { actionError, useAdmin, useLoad } from "../admin/context";
import LoadError from "../admin/LoadError";
import styles from "./ReportPage.module.css";

const BACK = "/chat?view=log";

export default function ActionPage() {
  const { token, version, changed, onAuthError } = useAdmin();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loaded = useLoad((signal) => moderationAction(token, id, signal), [token, id, version]);

  const back = <BackLink to={BACK} label="יומן" />;

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
        <p className={styles.status}>טוען...</p>
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
      // 409: something changed since the screen loaded (another action, or the author deleted the message).
      else if (e instanceof ApiError && e.status === 409) {
        setError("אי אפשר לבטל את הפעולה הזו, כי ההודעה או המשתמש השתנו מאז.");
        changed();
      } else setError(actionError(e));
      setBusy(false);
    }
  }

  return (
    <>
      {back}

      <header className={styles.head}>
        <h1 className={styles.title}>{ACTION_LABEL[a.action]}</h1>
        <p className={styles.meta}>
          <bdi dir="ltr">{a.admin_email}</bdi>
          <span>{formatDateTime(a.created_at)}</span>
        </p>
      </header>

      {a.message && (
        <div className={styles.content} dir="auto">
          {a.message.content}
        </div>
      )}

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
        <Row label="כותב" value={<bdi>{m.author_nickname}</bdi>} />
        <Row label="קורס" value={m.course_name} />
        <Row label="נכתבה" value={formatDateTime(m.created_at)} />
        <Row label="מצב" value={STATE_LABEL[m.state]} />
        <Row label="דיווחים פתוחים" value={m.open_reports} />
        <Row label="כל הדיווחים" value={m.all_reports} />
        {m.state === "active" && m.open_reports > 0 && <Row label="מעבר לדיווח" to={`/chat/reports/${m.message_id}`} />}
      </Group>
    );
  }

  // Neither came back: the chat backend did not answer, the log itself still loaded.
  const u = a.user;
  if (!u) {
    return <p className={styles.status}>הפרטים לא זמינים כרגע, כי שרת הצ'אט לא ענה. נסו שוב מאוחר יותר.</p>;
  }

  return (
    <Group title="המשתמש">
      <Row label="כינוי" value={<bdi>{u.nickname}</bdi>} />
      <Row label="מצב" value={u.blocked_at ? `חסום מ־${formatDateTime(u.blocked_at)}` : "לא חסום"} />
      {u.blocked_at && <Row label="מעבר למשתמש החסום" to={`/chat/blocked/${u.user_id}`} />}
    </Group>
  );
}

/** The undo row when it can be undone; otherwise why not, with a link to the related action. */
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
      <Group footer="הפעולה כבר בוטלה, ואפשר לבטל פעולה פעם אחת בלבד.">
        <Row label="הפעולה שביטלה אותה" to={`/chat/log/${a.undone_by}`} />
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